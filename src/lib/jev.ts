import { postJsonWithRetry } from "./dispatcher";
import { JEV_RATES, usd } from "./pricing";
import { getSettings, getTaxonomyForJev, type Taxonomy } from "./taxonomy";
import type {
  FieldSignal,
  TicketAnalysis,
  TicketSignals,
} from "./schema";

// ---------------------------------------------------------------------------
// Jev — TypeSafe System One. One call classifies the ticket with 4 structured
// questions (3 rubric-based choice questions + 1 scored sentiment question).
// https://api.typesafe.ai/v1/systemone
// ---------------------------------------------------------------------------

const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const JEV_MODEL = "jev-latest";

export class JevAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JevAuthError";
  }
}

export class JevError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "JevError";
  }
}

interface JevChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

interface JevScoreQuestion {
  type: "score";
  instructions: string;
  criteria: string[];
}

// Yes/no question. The answer is a probability (0..1) that the answer is "yes",
// which we use directly as the match confidence for transparency signals.
interface JevNoulQuestion {
  type: "noul";
  instructions: string;
  criteria: { true: string; false: string };
}

interface JevAnswerChoice {
  type: "choice";
  choice: string;
  probabilities?: Record<string, number>;
  confidence: number;
}

interface JevAnswerScore {
  type: "score";
  score: number;
  probabilities?: number[];
  confidence: number;
}

interface JevAnswerNoul {
  type: "noul";
  noul: number;
}

interface JevResponse {
  model: string;
  answers: Record<string, JevAnswerChoice | JevAnswerScore | JevAnswerNoul>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export interface JevClassifyResult {
  analysis: TicketAnalysis;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  // Flow B's parseErrors is genuinely always 0: Jev returns structured,
  // schema-constrained answers, so there is nothing to re-parse or retry.
  parseErrors: 0;
}

// Cross-cutting noul questions — fixed, not tied to any taxonomy option.
const CROSS_CUTTING: [string, string][] = [
  [
    "multiple_distinct_issues_present",
    "Does this ticket describe two or more distinct, separable issues?",
  ],
  [
    "explicit_deadline_mentioned",
    "Does the customer state an explicit deadline, time limit, or specific date by which something must happen?",
  ],
  [
    "threatens_to_cancel_or_leave",
    "Does the customer threaten — explicitly or implicitly — to cancel, downgrade, switch provider, or otherwise leave?",
  ],
];

function buildQuestions(
  state: string,
  taxonomy?: Taxonomy,
): Record<string, JevChoiceQuestion | JevScoreQuestion | JevNoulQuestion> {
  const t = getTaxonomyForJev(taxonomy);
  const questions: Record<
    string,
    JevChoiceQuestion | JevScoreQuestion | JevNoulQuestion
  > = {
    category: {
      type: "choice",
      instructions: `Classify the primary intent of this support ticket.\n\nTicket:\n${state}`,
      criteria: t.categoryCriteria,
    },
    priority: {
      type: "choice",
      instructions: `Judge how urgently this support ticket must be handled.\n\nTicket:\n${state}`,
      criteria: t.priorityCriteria,
    },
    route_to_team: {
      type: "choice",
      instructions: `Decide which internal team should own this support ticket.\n\nTicket:\n${state}`,
      criteria: t.routeCriteria,
    },
    sentiment: {
      type: "score",
      instructions: `Rate the customer's emotional tone in this support ticket.\n\nTicket:\n${state}`,
      criteria: [
        "Very negative — furious, threatening, or deeply frustrated",
        "Negative — annoyed, disappointed, or dissatisfied",
        "Neutral — factual, calm, no strong emotion",
        "Positive — polite, satisfied, appreciative",
        "Very positive — delighted, enthusiastic, grateful",
      ],
    },
  };

  // Transparency signals: one isolated noul probe per taxonomy option, derived
  // from the same descriptions as the choice criteria, so editing a taxonomy
  // option updates both its rubric and its transparency question at once.
  for (const [field, criteria] of [
    ["category", t.categoryCriteria],
    ["priority", t.priorityCriteria],
    ["route_to_team", t.routeCriteria],
  ] as const) {
    const label = field.replace(/_/g, " ");
    for (const [key, description] of Object.entries(criteria)) {
      questions[`signal_${field}_${key}`] = {
        type: "noul",
        instructions: `Does this ticket match the ${label} option "${key}" meaning: ${description}?`,
        criteria: {
          true: "The ticket clearly fits this meaning",
          false: "The ticket does not fit this meaning",
        },
      };
    }
  }
  for (const [key, question] of CROSS_CUTTING) {
    questions[`signal_x_${key}`] = {
      type: "noul",
      instructions: question,
      criteria: { true: "Yes", false: "No" },
    };
  }
  return questions;
}

function noulSignal(answer: JevAnswerNoul | undefined): FieldSignal {
  const p = answer?.noul ?? 0;
  return { match: p >= 0.5, confidence: p };
}

const SIGNAL_FIELDS = ["category", "priority", "route_to_team"] as const;

function mapSignals(
  answers: Record<string, JevAnswerChoice | JevAnswerScore | JevAnswerNoul>,
): TicketSignals {
  const noul = (key: string): FieldSignal => {
    const a = answers[key];
    return a && a.type === "noul" ? noulSignal(a) : { match: false, confidence: 0 };
  };
  const signals: TicketSignals = {
    category: {},
    priority: {},
    route_to_team: {},
    cross_cutting: {},
  };
  for (const key of Object.keys(answers)) {
    if (!key.startsWith("signal_") || key.startsWith("signal_x_")) continue;
    const m = /^signal_(category|priority|route_to_team)_(.+)$/.exec(key);
    if (!m) continue;
    signals[m[1] as "category"][m[2]] = noul(key);
  }
  for (const [key] of CROSS_CUTTING) {
    signals.cross_cutting[key] = noul(`signal_x_${key}`);
  }
  return signals;
}

/** True when the winner's match probability is not clearly the highest. */
function computeSignalMismatch(
  signals: TicketSignals,
  winners: { category: string; priority: string; route_to_team: string },
) {
  const out = { category: false, priority: false, route_to_team: false };
  for (const field of SIGNAL_FIELDS) {
    const entries = Object.entries(signals[field]);
    if (entries.length < 2) continue;
    const winnerConf = signals[field][winners[field]]?.confidence ?? 0;
    const runnerUp = entries
      .filter(([k]) => k !== winners[field])
      .map(([, s]) => s.confidence)
      .sort((a, b) => b - a)[0] ?? 0;
    out[field] = winnerConf - runnerUp < 0.15;
  }
  return out;
}

export async function classifyWithJev(
  ticketText: string,
  taxonomy?: Taxonomy,
  settings?: { systemPrompt: string; businessContext: string },
): Promise<JevClassifyResult> {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) {
    throw new JevAuthError(
      "TypeSafe API key needed — add TYPESAFE_API_KEY to .env.local (get one at https://console.typesafe.ai/keys), then restart the dev server.",
    );
  }
  const st = settings ?? getSettings();
  const state = st.businessContext.trim()
    ? `Business context:\n${st.businessContext.trim()}\n\nTicket:\n${ticketText}`
    : ticketText;
  const res = await postJsonWithRetry(
    JEV_ENDPOINT,
    { Authorization: `Bearer ${apiKey}` },
    {
      state,
      model: JEV_MODEL,
      questions: buildQuestions(state, taxonomy),
    },
  );

  if (res.status === 401 || res.status === 403) {
    throw new JevAuthError(
      `TypeSafe API key was rejected (HTTP ${res.status}). Check TYPESAFE_API_KEY in .env.local — get a valid key at https://console.typesafe.ai/keys.`,
    );
  }
  if (res.status < 200 || res.status >= 300) {
    throw new JevError(
      `Jev request failed: HTTP ${res.status} ${res.body.slice(0, 300)}`,
      res.status,
    );
  }

  let json: JevResponse;
  try {
    json = JSON.parse(res.body) as JevResponse;
  } catch {
    throw new JevError(
      `Jev response was not JSON: HTTP ${res.status} ${res.body.slice(0, 300)}`,
      res.status,
    );
  }
  const { answers } = json;

  const category = answers.category;
  const priority = answers.priority;
  const route = answers.route_to_team;
  const sentiment = answers.sentiment;
  if (
    !category ||
    category.type !== "choice" ||
    !priority ||
    priority.type !== "choice" ||
    !route ||
    route.type !== "choice" ||
    !sentiment ||
    sentiment.type !== "score"
  ) {
    throw new JevError("Jev response was missing expected typed answers.");
  }

  const inputTokens = json.usage?.input_tokens ?? 0;
  const outputTokens = json.usage?.output_tokens ?? 0;

  const signals = mapSignals(answers);
  const winners = {
    category: category.choice,
    priority: priority.choice,
    route_to_team: route.choice,
  };

  return {
    analysis: {
      category: winners.category as TicketAnalysis["category"],
      priority: winners.priority as TicketAnalysis["priority"],
      // Jev score 0..4 (Very negative..Very positive) mapped linearly to -1..1
      sentiment: sentiment.score / 2 - 1,
      route_to_team: winners.route_to_team as TicketAnalysis["route_to_team"],
      confidence: {
        category: category.confidence,
        priority: priority.confidence,
        sentiment: sentiment.confidence,
        route_to_team: route.confidence,
      },
      signals,
      signalMismatch: computeSignalMismatch(signals, winners),
    },
    inputTokens,
    outputTokens,
    costUsd: usd(inputTokens, outputTokens, JEV_RATES),
    parseErrors: 0,
  };
}

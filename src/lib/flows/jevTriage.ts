import type { SystemOneAdapter } from "../adapters/system-one";
import type { QuestionSpec } from "../adapters/types";
import type { OutputSchema } from "../projects";
import type { FieldSignal, TicketAnalysis, TicketSignals } from "../schema";
import type { TriageSettings } from "./llmTriage";

// ---------------------------------------------------------------------------
// Ticket triage on system_one: one parallel pass of typed questions (3 choice
// + 1 score) plus noul evidence probes powering the transparency signals.
// ---------------------------------------------------------------------------

const CROSS_CUTTING: [string, string][] = [
  ["multiple_distinct_issues_present", "Does this ticket describe two or more distinct, separable issues?"],
  ["explicit_deadline_mentioned", "Does the customer state an explicit deadline, time limit, or specific date by which something must happen?"],
  ["threatens_to_cancel_or_leave", "Does the customer threaten — explicitly or implicitly — to cancel, downgrade, switch provider, or otherwise leave?"],
];

// Priority signals: atomic evidence-of-urgency clues, NOT one question per
// taxonomy level (that would just restate the decision).
const PRIORITY_CLUES: [string, string][] = [
  ["outage_or_emergency", "Is there a live outage, security exposure, legal, or financial emergency described in this ticket?"],
  ["blocked_from_work", "Does the customer describe being blocked from doing their work?"],
  ["strong_frustration", "Does the customer express strong frustration or anger in their own words?"],
  ["minor_no_pressure", "Is this a minor inconvenience with no real time pressure — can the customer reasonably wait?"],
];

const URGENCY_CLUES = ["outage_or_emergency", "blocked_from_work", "strong_frustration"] as const;
const LOW_URGENCY_CLUES = ["minor_no_pressure"] as const;

const SENTIMENT_SCALE = [
  "Very negative — furious, threatening, or deeply frustrated",
  "Negative — annoyed, disappointed, or dissatisfied",
  "Neutral — factual, calm, no strong emotion",
  "Positive — polite, satisfied, appreciative",
  "Very positive — delighted, enthusiastic, grateful",
];

// Human-readable clue label derived from an option description — this becomes
// the UI row label, turning "bug" into "describes something is broken, …".
function clueLabel(description: string): string {
  const d = description.trim().replace(/\.$/, "");
  return "describes " + d.charAt(0).toLowerCase() + d.slice(1);
}

export interface JevClassifyResult {
  analysis: TicketAnalysis;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  parseErrors: 0;
}

interface BuiltQuestions {
  specs: QuestionSpec[];
  categoryClues: [string, string][];
  routeClues: [string, string][];
}

function buildQuestions(state: string, schema: OutputSchema): BuiltQuestions {
  const enumField = (key: string) => schema.find((f) => f.key === key);
  const specs: QuestionSpec[] = [
    {
      key: "category",
      type: "enum",
      instructions: `Classify the primary intent of this support ticket.\n\nTicket:\n${state}`,
      options: enumField("category")?.options ?? [],
    },
    {
      key: "priority",
      type: "enum",
      instructions: `Judge how urgently this support ticket must be handled.\n\nTicket:\n${state}`,
      options: enumField("priority")?.options ?? [],
    },
    {
      key: "route_to_team",
      type: "enum",
      instructions: `Decide which internal team should own this support ticket.\n\nTicket:\n${state}`,
      options: enumField("route_to_team")?.options ?? [],
    },
    {
      key: "sentiment",
      type: "float_range",
      instructions: `Rate the customer's emotional tone in this support ticket.\n\nTicket:\n${state}`,
      scale: SENTIMENT_SCALE,
    },
  ];

  const categoryClues: [string, string][] = [];
  const routeClues: [string, string][] = [];
  for (const [field, out] of [
    ["category", categoryClues],
    ["route_to_team", routeClues],
  ] as const) {
    for (const opt of enumField(field)?.options ?? []) {
      out.push([opt.key, clueLabel(opt.description)]);
      specs.push({
        key: `signal_${field}_${opt.key}`,
        type: "noul",
        instructions: `Content check about the ticket's subject matter (this is not a label assignment): does the ticket describe the following situation — ${opt.description}?`,
        noulCriteria: {
          true: "The ticket describes this",
          false: "The ticket does not describe this",
        },
      });
    }
  }
  for (const [key, question] of PRIORITY_CLUES) {
    specs.push({ key: `signal_priority_${key}`, type: "noul", instructions: question });
  }
  for (const [key, question] of CROSS_CUTTING) {
    specs.push({ key: `signal_x_${key}`, type: "noul", instructions: question });
  }
  return { specs, categoryClues, routeClues };
}

function noulSignal(p: number): FieldSignal {
  return { match: p >= 0.5, confidence: p };
}

function mapSignals(
  answers: Record<string, { value: unknown; confidence: number }>,
  categoryClues: [string, string][],
  routeClues: [string, string][],
): TicketSignals {
  const clueFor = (list: [string, string][], k: string) =>
    list.find(([ok]) => ok === k)?.[1] ?? k;
  const noul = (key: string): FieldSignal =>
    answers[key] ? noulSignal(answers[key].value as number) : { match: false, confidence: 0 };
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
    const k =
      m[1] === "category"
        ? clueFor(categoryClues, m[2])
        : m[1] === "route_to_team"
          ? clueFor(routeClues, m[2])
          : m[2];
    signals[m[1] as "category"][k] = noul(key);
  }
  for (const [key] of CROSS_CUTTING) {
    signals.cross_cutting[key] = noul(`signal_x_${key}`);
  }
  return signals;
}

/** True when the selected option's supporting evidence is not clearly the
 * strongest. Category/route rows are keyed by clue label, so winner keys are
 * translated via the clue map first. */
function computeSignalMismatch(
  signals: TicketSignals,
  winners: { category: string; priority: string; route_to_team: string },
  priorityKeys: string[],
  categoryClues: [string, string][],
  routeClues: [string, string][],
) {
  const translate = (list: [string, string][], key: string) =>
    list.find(([k]) => k === key)?.[1] ?? key;
  const clueWinners: Record<string, string> = {
    category: translate(categoryClues, winners.category),
    route_to_team: translate(routeClues, winners.route_to_team),
  };
  const out = { category: false, priority: false, route_to_team: false };
  for (const field of ["category", "route_to_team"] as const) {
    const entries = Object.entries(signals[field]);
    if (entries.length < 2) continue;
    const winnerConf = signals[field][clueWinners[field]]?.confidence ?? 0;
    const runnerUp =
      entries
        .filter(([k]) => k !== clueWinners[field])
        .map(([, s]) => s.confidence)
        .sort((a, b) => b - a)[0] ?? 0;
    out[field] = winnerConf - runnerUp < 0.15;
  }
  const idx = priorityKeys.indexOf(winners.priority);
  if (idx !== -1 && URGENCY_CLUES.some((k) => signals.priority[k])) {
    const pos = priorityKeys.length > 1 ? idx / (priorityKeys.length - 1) : 1;
    const urgencyConf = Math.max(
      ...URGENCY_CLUES.map((k) => signals.priority[k]?.confidence ?? 0),
    );
    const minorConf = LOW_URGENCY_CLUES.reduce(
      (m, k) => Math.max(m, signals.priority[k]?.confidence ?? 0),
      0,
    );
    const [support, oppose] = pos >= 0.5 ? [urgencyConf, minorConf] : [minorConf, urgencyConf];
    out.priority = support - oppose < 0.15;
  }
  return out;
}

export async function classifyWithJev(
  ticketText: string,
  schema: OutputSchema,
  settings: TriageSettings,
  adapter: SystemOneAdapter,
): Promise<JevClassifyResult> {
  const state = settings.businessContext.trim()
    ? `Business context:\n${settings.businessContext.trim()}\n\nTicket:\n${ticketText}`
    : ticketText;
  const built = buildQuestions(state, schema);
  const out = await adapter.runDecision({ text: state, questions: built.specs });

  const winners = {
    category: out.answers.category.value as string,
    priority: out.answers.priority.value as string,
    route_to_team: out.answers.route_to_team.value as string,
  };
  const signals = mapSignals(out.answers, built.categoryClues, built.routeClues);
  const priorityKeys = (schema.find((f) => f.key === "priority")?.options ?? []).map((o) => o.key);

  return {
    analysis: {
      category: winners.category,
      priority: winners.priority,
      // Jev score 0..4 (Very negative..Very positive) mapped linearly to -1..1
      sentiment: (out.answers.sentiment.value as number) / 2 - 1,
      route_to_team: winners.route_to_team,
      confidence: {
        category: out.answers.category.confidence,
        priority: out.answers.priority.confidence,
        sentiment: out.answers.sentiment.confidence,
        route_to_team: out.answers.route_to_team.confidence,
      },
      signals,
      signalMismatch: computeSignalMismatch(
        signals,
        winners,
        priorityKeys,
        built.categoryClues,
        built.routeClues,
      ),
    },
    inputTokens: out.inputTokens,
    outputTokens: out.outputTokens,
    costUsd: adapter.cost(out.inputTokens, out.outputTokens),
    parseErrors: 0,
  };
}

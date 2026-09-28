import { CROSS_CUTTING, PRIORITY_CLUES, clueLabel, computeSignalMismatch } from "./jev";
import type { FieldSignal, TicketAnalysis, TicketSignals } from "./schema";
import { getSettings, getTaxonomyForJev, type Taxonomy } from "./taxonomy";

const SENTIMENT_LEVELS = {
  "0": "Very negative — furious, threatening, or deeply frustrated",
  "1": "Negative — annoyed, disappointed, or dissatisfied",
  "2": "Neutral — factual, calm, no strong emotion",
  "3": "Positive — polite, satisfied, appreciative",
  "4": "Very positive — delighted, enthusiastic, grateful",
};

type Task = { labels: Record<string, string> | string[]; prompt?: string };
type Decision = { label: string; confidence: number };

export class GlinerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GlinerError";
  }
}

function decision(data: Record<string, unknown>, key: string, allowed: string[]): Decision {
  const value = data[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GlinerError(`GLiNER did not return a decision for ${key}.`);
  }
  const { label, confidence } = value as Record<string, unknown>;
  if (!allowed.includes(label as string) || typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new GlinerError(`GLiNER returned an invalid decision for ${key}.`);
  }
  return { label: label as string, confidence };
}

export async function classifyWithGliner(
  ticketText: string,
  taxonomy?: Taxonomy,
  settings?: { businessContext: string },
): Promise<{ analysis: TicketAnalysis; inputTokens: 0; outputTokens: 0; costUsd: 0; parseErrors: 0 }> {
  const t = getTaxonomyForJev(taxonomy);
  const context = (settings ?? getSettings()).businessContext.trim();
  const text = context ? `Business context:\n${context}\n\nTicket:\n${ticketText}` : ticketText;
  const tasks: Record<string, Task> = {
    category: { labels: t.categoryCriteria },
    priority: { labels: t.priorityCriteria },
    route_to_team: { labels: t.routeCriteria },
    sentiment: { labels: SENTIMENT_LEVELS },
  };

  const categoryClues: [string, string][] = [];
  const routeClues: [string, string][] = [];
  for (const [field, criteria, clues] of [
    ["category", t.categoryCriteria, categoryClues],
    ["route_to_team", t.routeCriteria, routeClues],
  ] as const) {
    for (const [key, description] of Object.entries(criteria)) {
      clues.push([key, clueLabel(description)]);
      tasks[`signal_${field}_${key}`] = {
        labels: ["yes", "no"],
        prompt: `Does the ticket describe the following situation — ${description}?`,
      };
    }
  }
  for (const [key, question] of PRIORITY_CLUES) {
    tasks[`signal_priority_${key}`] = { labels: ["yes", "no"], prompt: question };
  }
  for (const [key, question] of CROSS_CUTTING) {
    tasks[`signal_x_${key}`] = { labels: ["yes", "no"], prompt: question };
  }

  const endpoint = process.env.GLINER_URL ?? "http://127.0.0.1:8100";
  let response: Response;
  try {
    response = await fetch(`${endpoint.replace(/\/$/, "")}/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, tasks }),
      signal: AbortSignal.timeout(120_000),
      cache: "no-store",
    });
  } catch (err) {
    throw new GlinerError(
      `Local GLiNER is unavailable at ${endpoint}. Start it with: .venv-gliner/bin/python scripts/gliner_server.py (${err instanceof Error ? err.message : String(err)})`,
    );
  }
  if (!response.ok) {
    throw new GlinerError(`Local GLiNER failed (HTTP ${response.status}): ${(await response.text()).slice(0, 300)}`);
  }
  let data: Record<string, unknown>;
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new GlinerError("Local GLiNER returned invalid JSON.");
  }

  const category = decision(data, "category", Object.keys(t.categoryCriteria));
  const priority = decision(data, "priority", Object.keys(t.priorityCriteria));
  const route = decision(data, "route_to_team", Object.keys(t.routeCriteria));
  const sentiment = decision(data, "sentiment", Object.keys(SENTIMENT_LEVELS));
  const probe = (key: string): FieldSignal => {
    const answer = decision(data, key, ["yes", "no"]);
    return {
      match: answer.label === "yes",
      confidence: answer.label === "yes" ? answer.confidence : 1 - answer.confidence,
    };
  };
  const signals: TicketSignals = {
    category: {},
    priority: {},
    route_to_team: {},
    cross_cutting: {},
  };
  for (const [key, label] of categoryClues) signals.category[label] = probe(`signal_category_${key}`);
  for (const [key, label] of routeClues) signals.route_to_team[label] = probe(`signal_route_to_team_${key}`);
  for (const [key] of PRIORITY_CLUES) signals.priority[key] = probe(`signal_priority_${key}`);
  for (const [key] of CROSS_CUTTING) signals.cross_cutting[key] = probe(`signal_x_${key}`);
  const winners = {
    category: category.label,
    priority: priority.label,
    route_to_team: route.label,
  };

  return {
    analysis: {
      ...winners,
      sentiment: Number(sentiment.label) / 2 - 1,
      confidence: {
        category: category.confidence,
        priority: priority.confidence,
        route_to_team: route.confidence,
        sentiment: sentiment.confidence,
      },
      signals,
      signalMismatch: computeSignalMismatch(signals, winners, Object.keys(t.priorityCriteria), categoryClues, routeClues),
    },
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    parseErrors: 0,
  };
}

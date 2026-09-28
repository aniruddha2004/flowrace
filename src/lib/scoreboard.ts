import {
  agreementRatio,
  costWinner,
  latencyWinner,
  parseErrorWinner,
  type Winner,
} from "./compare";
import { getDb } from "./db";
import { getProject } from "./projects";
import { normalizeAnalysis } from "./schema";

// Server-side scoreboard: derived from persisted single-mode sessions of ONE
// project so every tally row sums to runs for that project only.

export interface MetricTally {
  a: number;
  tie: number;
  b: number;
}

export interface ScoreboardPayload {
  projectId: string;
  runs: number;
  latency: MetricTally;
  cost: MetricTally;
  parseErrors: MetricTally;
  agreementSum: number;
  agreementCount: number;
}

interface StoredTotals {
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  parseErrors?: number;
}

interface StoredFlow {
  analysis?: unknown;
  totalMs?: number;
  totals?: StoredTotals;
}

function tally(t: MetricTally, w: Winner): MetricTally {
  if (w === "A") return { ...t, a: t.a + 1 };
  if (w === "B") return { ...t, b: t.b + 1 };
  return { ...t, tie: t.tie + 1 };
}

export function computeScoreboard(projectId: string): ScoreboardPayload {
  const rows = getDb()
    .prepare(`SELECT result FROM sessions WHERE type = 'single' AND project_id = ?`)
    .all(projectId) as { result: string }[];

  const payload: ScoreboardPayload = {
    projectId,
    runs: 0,
    latency: { a: 0, tie: 0, b: 0 },
    cost: { a: 0, tie: 0, b: 0 },
    parseErrors: { a: 0, tie: 0, b: 0 },
    agreementSum: 0,
    agreementCount: 0,
  };

  const schema = getProject(projectId)?.outputSchema ?? [];

  for (const r of rows) {
    let flows: { A?: StoredFlow; B?: StoredFlow };
    try {
      flows = (JSON.parse(r.result) as { flows?: typeof flows }).flows ?? {};
    } catch {
      continue;
    }
    const a = flows.A;
    const b = flows.B;
    if (
      !a?.totalMs ||
      !b?.totalMs ||
      a.totals == null ||
      b.totals == null ||
      typeof a.totals.costUsd !== "number" ||
      typeof b.totals.costUsd !== "number"
    ) {
      continue;
    }
    payload.runs += 1;
    payload.latency = tally(payload.latency, latencyWinner(a.totalMs, b.totalMs));
    payload.cost = tally(payload.cost, costWinner(a.totals.costUsd, b.totals.costUsd));
    payload.parseErrors = tally(
      payload.parseErrors,
      parseErrorWinner(a.totals.parseErrors ?? 0, b.totals.parseErrors ?? 0),
    );
    if (a.analysis && b.analysis) {
      payload.agreementSum += agreementRatio(
        schema,
        normalizeAnalysis(a.analysis),
        normalizeAnalysis(b.analysis),
      );
      payload.agreementCount += 1;
    }
  }
  return payload;
}

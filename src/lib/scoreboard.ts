import {
  agreementRatio,
  costWinner,
  latencyWinner,
  parseErrorWinner,
  type Winner,
} from "./compare";
import { getDb } from "./db";
import type { TicketAnalysis } from "./schema";

// Server-side scoreboard: derived entirely from persisted single-mode
// sessions so every tally row sums to `runs`, matching what a fresh page
// load actually has in the database.

export interface MetricTally {
  a: number;
  tie: number;
  b: number;
}

export interface ScoreboardPayload {
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
  analysis?: TicketAnalysis;
  totalMs?: number;
  totals?: StoredTotals;
}

function tally(t: MetricTally, w: Winner): MetricTally {
  if (w === "A") return { ...t, a: t.a + 1 };
  if (w === "B") return { ...t, b: t.b + 1 };
  return { ...t, tie: t.tie + 1 };
}

export function computeScoreboard(): ScoreboardPayload {
  const rows = getDb()
    .prepare(`SELECT type, result FROM sessions WHERE type = 'single'`)
    .all() as { type: string; result: string }[];

  const payload: ScoreboardPayload = {
    runs: 0,
    latency: { a: 0, tie: 0, b: 0 },
    cost: { a: 0, tie: 0, b: 0 },
    parseErrors: { a: 0, tie: 0, b: 0 },
    agreementSum: 0,
    agreementCount: 0,
  };

  for (const r of rows) {
    let flows: { A?: StoredFlow; B?: StoredFlow };
    try {
      flows = (JSON.parse(r.result) as { flows?: typeof flows }).flows ?? {};
    } catch {
      continue;
    }
    const a = flows.A;
    const b = flows.B;
    // Skip incomplete runs (a flow errored before producing totals) so every
    // tally row sums to runs.
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
      payload.agreementSum += agreementRatio(a.analysis, b.analysis);
      payload.agreementCount += 1;
    }
  }
  return payload;
}

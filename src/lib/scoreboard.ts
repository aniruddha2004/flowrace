import {
  agreementRatio,
  costTied,
  costWinner,
  latencyTied,
  latencyWinner,
  parseErrorsTied,
  parseErrorWinner,
  threeWayWinner,
  type ThreeWayWinner,
  type Winner,
} from "./compare";
import { getDb } from "./db";
import { asTicketAnalysis } from "./schema";

// Server-side scoreboard: derived entirely from persisted single-mode
// sessions so every tally row sums to `runs`, matching what a fresh page
// load actually has in the database.

export interface MetricTally {
  a: number;
  tie: number;
  b: number;
  c: number;
}

export interface ScoreboardPayload {
  runs: number;
  threeWayRuns: number;
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

function tally(t: MetricTally, w: Winner | ThreeWayWinner): MetricTally {
  if (w === "A") return { ...t, a: t.a + 1 };
  if (w === "B") return { ...t, b: t.b + 1 };
  if (w === "C") return { ...t, c: t.c + 1 };
  return { ...t, tie: t.tie + 1 };
}

export function computeScoreboard(): ScoreboardPayload {
  const rows = getDb()
    .prepare(`SELECT type, result FROM sessions WHERE type = 'single'`)
    .all() as { type: string; result: string }[];

  const payload: ScoreboardPayload = {
    runs: 0,
    threeWayRuns: 0,
    latency: { a: 0, tie: 0, b: 0, c: 0 },
    cost: { a: 0, tie: 0, b: 0, c: 0 },
    parseErrors: { a: 0, tie: 0, b: 0, c: 0 },
    agreementSum: 0,
    agreementCount: 0,
  };

  for (const r of rows) {
    let flows: { A?: StoredFlow; B?: StoredFlow; C?: StoredFlow };
    try {
      flows = (JSON.parse(r.result) as { flows?: typeof flows }).flows ?? {};
    } catch {
      continue;
    }
    const a = flows.A;
    const b = flows.B;
    const c = flows.C;
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
    const hasC = !!c?.totalMs && typeof c.totals?.costUsd === "number";
    if (hasC && c) {
      payload.threeWayRuns += 1;
      payload.latency = tally(payload.latency, threeWayWinner(
        { A: a.totalMs, B: b.totalMs, C: c.totalMs! }, latencyTied,
      ));
      payload.cost = tally(payload.cost, threeWayWinner(
        { A: a.totals.costUsd, B: b.totals.costUsd, C: c.totals!.costUsd! }, costTied,
      ));
      payload.parseErrors = tally(payload.parseErrors, threeWayWinner(
        { A: a.totals.parseErrors ?? 0, B: b.totals.parseErrors ?? 0, C: c.totals!.parseErrors ?? 0 },
        parseErrorsTied,
      ));
    } else {
      payload.latency = tally(payload.latency, latencyWinner(a.totalMs, b.totalMs));
      payload.cost = tally(payload.cost, costWinner(a.totals.costUsd, b.totals.costUsd));
      payload.parseErrors = tally(payload.parseErrors, parseErrorWinner(a.totals.parseErrors ?? 0, b.totals.parseErrors ?? 0));
    }
    const aAnalysis = asTicketAnalysis(a.analysis);
    const bAnalysis = asTicketAnalysis(b.analysis);
    const cAnalysis = hasC ? asTicketAnalysis(c?.analysis) : undefined;
    if (aAnalysis && bAnalysis && (!hasC || cAnalysis)) {
      const analyses = hasC ? [aAnalysis, bAnalysis, cAnalysis!] : [aAnalysis, bAnalysis];
      payload.agreementSum += hasC
        ? (agreementRatio(analyses[0], analyses[1])
          + agreementRatio(analyses[0], analyses[2])
          + agreementRatio(analyses[1], analyses[2])) / 3
        : agreementRatio(analyses[0], analyses[1]);
      payload.agreementCount++;
    }
  }
  return payload;
}

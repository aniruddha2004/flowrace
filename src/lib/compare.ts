import type { TicketAnalysis } from "./schema";

// ---------------------------------------------------------------------------
// Pure comparison helpers for the scoreboard / comparison strip.
// ---------------------------------------------------------------------------

export type CompareField =
  | "category"
  | "priority"
  | "sentiment"
  | "route_to_team";

export const COMPARE_FIELDS: CompareField[] = [
  "category",
  "priority",
  "sentiment",
  "route_to_team",
];

const SENTIMENT_TOLERANCE = 0.2;

/** True when both flows produced equivalent values for a field. */
export function fieldsAgree(
  a: TicketAnalysis,
  b: TicketAnalysis,
  field: CompareField,
): boolean {
  if (field === "sentiment") {
    return Math.abs(a.sentiment - b.sentiment) <= SENTIMENT_TOLERANCE;
  }
  return a[field] === b[field];
}

export function agreementRatio(a: TicketAnalysis, b: TicketAnalysis): number {
  const agreed = COMPARE_FIELDS.filter((f) => fieldsAgree(a, b, f)).length;
  return agreed / COMPARE_FIELDS.length;
}

export type Winner = "A" | "B" | "tie";
export type ThreeWayWinner = Winner | "C";

const LATENCY_TIE_RATIO = 0.05; // within 5% counts as a tie
const COST_TIE_ABS = 0.0001; // within $0.0001 counts as a tie

/** Lower latency wins; within 5% of the larger value is a tie. */
export function latencyWinner(msA: number, msB: number): Winner {
  const max = Math.max(msA, msB);
  if (max > 0 && Math.abs(msA - msB) / max <= LATENCY_TIE_RATIO) return "tie";
  return msA < msB ? "A" : "B";
}

/** Lower cost wins; within $0.0001 is a tie. */
export function costWinner(costA: number, costB: number): Winner {
  if (Math.abs(costA - costB) <= COST_TIE_ABS) return "tie";
  return costA < costB ? "A" : "B";
}

/** Fewer parse errors wins; equal counts tie. */
export function parseErrorWinner(errA: number, errB: number): Winner {
  if (errA === errB) return "tie";
  return errA < errB ? "A" : "B";
}

/** Lowest value wins only when it is outside the tie tolerance of every rival. */
export function threeWayWinner(
  values: { A: number; B: number; C: number },
  tied: (low: number, other: number) => boolean,
): ThreeWayWinner {
  const ranked = (Object.entries(values) as ["A" | "B" | "C", number][])
    .sort((a, b) => a[1] - b[1]);
  return tied(ranked[0][1], ranked[1][1]) ? "tie" : ranked[0][0];
}

export const latencyTied = (low: number, other: number): boolean =>
  other > 0 && (other - low) / other <= LATENCY_TIE_RATIO;
export const costTied = (low: number, other: number): boolean => other - low <= COST_TIE_ABS;
export const parseErrorsTied = (low: number, other: number): boolean => low === other;

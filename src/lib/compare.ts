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

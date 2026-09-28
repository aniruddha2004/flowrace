import type { OutputField, OutputSchema } from "./projects";
import type { FlowAnalysis } from "./schema";

// ---------------------------------------------------------------------------
// Pure comparison helpers — schema-driven: one column per decision field,
// float_range compared with a range-scaled tolerance, everything else exact.
// ---------------------------------------------------------------------------

/** Fields the comparison/scoreboard iterate: all decision (non-free_text) fields. */
export function compareFields(schema: OutputSchema): OutputField[] {
  return schema.filter((f) => f.type !== "free_text");
}

/** Tolerance for float comparisons: 10% of the configured range
 * (sentiment -1..1 → 0.2, matching the historical constant). */
export function floatTolerance(field: OutputField): number {
  return ((field.range?.max ?? 1) - (field.range?.min ?? 0)) / 10;
}

export function fieldAgree(field: OutputField, a: FlowAnalysis, b: FlowAnalysis): boolean {
  const va = a.values[field.key]?.value;
  const vb = b.values[field.key]?.value;
  if (va === undefined || vb === undefined) return false;
  if (field.type === "float_range") {
    return Math.abs(Number(va) - Number(vb)) <= floatTolerance(field);
  }
  return va === vb;
}

export function agreementRatio(schema: OutputSchema, a: FlowAnalysis, b: FlowAnalysis): number {
  const fields = compareFields(schema);
  if (fields.length === 0) return 0;
  const agreed = fields.filter((f) => fieldAgree(f, a, b)).length;
  return agreed / fields.length;
}

export type Winner = "A" | "B" | "tie";

const LATENCY_TIE_RATIO = 0.05;
const COST_TIE_ABS = 0.0001;

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

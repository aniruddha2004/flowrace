import type { TicketAnalysis } from "./schema";

// NDJSON stream contract for POST /api/race — one JSON object per line.

export type FlowId = "A" | "B" | "C";
export type StepId = "classification" | "reply";

export interface StepMetrics {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  parseErrors: number;
}

export interface FlowTotals {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  parseErrors: number;
}

export type RaceEvent =
  | { type: "step_start"; flow: FlowId; step: StepId; at: number }
  | {
      type: "step_done";
      flow: FlowId;
      step: "classification";
      ms: number;
      data: TicketAnalysis;
      metrics: StepMetrics;
    }
  | {
      type: "step_done";
      flow: FlowId;
      step: "reply";
      ms: number;
      reply: string;
      metrics: StepMetrics;
    }
  | {
      type: "flow_done";
      flow: FlowId;
      totalMs: number;
      totals: FlowTotals;
    }
  | {
      type: "flow_error";
      flow: FlowId;
      step: StepId;
      code: string;
      message: string;
    }
  | { type: "run_done" };

export function encodeEvent(event: RaceEvent): string {
  return JSON.stringify(event) + "\n";
}

import type { FlowAnalysis } from "./schema";

// NDJSON stream contract for POST /api/race — one JSON object per line.

export type FlowId = string;
export type StepId = string;

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
  | { type: "step_start"; flow: FlowId; stepId: StepId; stepIndex: number; role: "decide" | "generate"; modelName: string; at: number }
  | {
      type: "step_done";
      flow: FlowId;
      stepId: StepId;
      stepIndex: number;
      role: "decide";
      ms: number;
      data: FlowAnalysis;
      metrics: StepMetrics;
    }
  | {
      type: "step_done";
      flow: FlowId;
      stepId: StepId;
      stepIndex: number;
      role: "generate";
      ms: number;
      freeText: Record<string, string>;
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
      stepId: StepId;
      stepIndex: number;
      code: string;
      message: string;
    }
  | { type: "run_done" };

export function encodeEvent(event: RaceEvent): string {
  return JSON.stringify(event) + "\n";
}

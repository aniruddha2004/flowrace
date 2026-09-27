import type { StepMetrics } from "./events";
import type { TicketAnalysis } from "./schema";

// Client-side per-flow state assembled incrementally from NDJSON events.

export type StepStatus = "idle" | "running" | "done" | "error";

export interface StepState {
  status: StepStatus;
  startedAt?: number;
  ms?: number;
}

export interface FlowErrorInfo {
  step: "classification" | "reply";
  code: string;
  message: string;
}

export interface FlowState {
  classification: StepState;
  reply: StepState;
  analysis?: TicketAnalysis;
  classificationMetrics?: StepMetrics;
  replyText?: string;
  replyMetrics?: StepMetrics;
  totalMs?: number;
  totals?: StepMetrics;
  error?: FlowErrorInfo;
}

export function emptyFlowState(): FlowState {
  return {
    classification: { status: "idle" },
    reply: { status: "idle" },
  };
}

/** 0 → 1 progress used to drive the header race track. */
export function flowProgress(state: FlowState): number {
  if (state.totals) return 1;
  if (state.reply.status === "running") return 0.66;
  if (state.classification.status === "done") return 0.5;
  if (state.classification.status === "running") return 0.15;
  return 0;
}

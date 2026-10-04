import type { StepMetrics } from "./events";
import type { FlowAnalysis } from "./schema";
import type { Flow } from "./flows";

// Client-side per-flow state assembled incrementally from NDJSON events.

export type StepStatus = "idle" | "running" | "done" | "error";

export interface StepState {
  status: StepStatus;
  startedAt?: number;
  ms?: number;
}

export interface FlowErrorInfo {
  step: string;
  code: string;
  message: string;
}

export interface FlowState {
  steps: Array<StepState & { stepId: string; stepIndex: number; role: "decide" | "generate"; modelName: string; metrics?: StepMetrics }>;
  classification: StepState;
  reply: StepState;
  analysis?: FlowAnalysis;
  classificationMetrics?: StepMetrics;
  freeText?: Record<string, string>;
  replyMetrics?: StepMetrics;
  totalMs?: number;
  totals?: StepMetrics;
  error?: FlowErrorInfo;
}

export function emptyFlowState(flow?: Flow): FlowState {
  return {
    steps: flow?.steps.map((step, stepIndex) => ({ stepId: step.id, stepIndex, role: step.role, modelName: step.modelId, status: "idle" })) ?? [],
    classification: { status: "idle" },
    reply: { status: "idle" },
  };
}

export function flowProgress(state: FlowState): number {
  if (state.steps.length > 0) return state.steps.filter((step) => step.status === "done").length / state.steps.length;
  if (state.totals) return 1;
  if (state.reply.status === "running") return 0.66;
  if (state.classification.status === "done") return 0.5;
  if (state.classification.status === "running") return 0.15;
  return 0;
}

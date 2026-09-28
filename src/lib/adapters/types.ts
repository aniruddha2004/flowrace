import type { ModelRow } from "../models";

// ---------------------------------------------------------------------------
// ModelAdapter — the one interface every registered model plugs into. Flow
// steps never hand-craft HTTP calls: they express work as typed questions
// (runDecision) or free-text generation (runGenerate); the adapter owns the
// wire protocol for its model kind.
// ---------------------------------------------------------------------------

export interface QuestionSpec {
  key: string;
  /** Full prompt text for this question — the adapter passes it through verbatim. */
  instructions: string;
  type: "enum" | "float_range" | "noul" | "boolean" | "free_text";
  options?: { key: string; label: string; description: string }[];
  range?: { min: number; max: number };
  /** score-type scale band descriptions (system_one adapters only). */
  scale?: string[];
  /** Gauge true/false wording (default { true: "Yes", false: "No" }). */
  noulCriteria?: { true: string; false: string };
}

export interface DecisionAnswer {
  value: unknown;
  confidence: number;
}

export interface DecisionInput {
  text: string;
  questions: QuestionSpec[];
  /** System-level preamble (only meaningful for llm_chat adapters). */
  context?: string;
  toolName?: string;
  toolDescription?: string;
  maxTokens?: number;
}

export interface DecisionOutput {
  answers: Record<string, DecisionAnswer>;
  inputTokens: number;
  outputTokens: number;
  ms: number;
  parseErrors: number;
}

export interface GenerateInput {
  text: string;
  context?: string;
  priorStepOutput?: unknown;
  maxTokens?: number;
}

export interface GenerateOutput {
  text: string;
  inputTokens: number;
  outputTokens: number;
  ms: number;
}

export interface ModelAdapter {
  runDecision(input: DecisionInput): Promise<DecisionOutput>;
  runGenerate(input: GenerateInput): Promise<GenerateOutput>;
  readonly model: ModelRow;
}

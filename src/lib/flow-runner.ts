import { LLMError, LLMParseError, LlmChatAdapter } from "./adapters/llm-chat";
import { JevAuthError, JevError, SystemOneAdapter } from "./adapters/system-one";
import type { FlowTotals, RaceEvent, StepMetrics } from "./events";
import type { Flow } from "./flows";
import { getModel } from "./models";
import { decide, generate, generateFrom, type FlowSettings } from "./flows/llmTriage";
import { classifyWithJev } from "./flows/jevTriage";
import { getAdapter } from "./registry";
import { SCHEMA_VERSION, type FlowAnalysis } from "./schema";

export interface StoredStep {
  stepId: string;
  stepIndex: number;
  role: "decide" | "generate";
  modelId: string;
  modelName: string;
  ms: number;
  metrics: StepMetrics;
  data?: FlowAnalysis;
  freeText?: Record<string, string>;
}

export interface FlowResult {
  analysis: FlowAnalysis;
  freeText: Record<string, string>;
  steps: StoredStep[];
  totalMs?: number;
  totals?: FlowTotals;
  classificationMetrics?: StepMetrics;
  classificationMs?: number;
  replyMetrics?: StepMetrics;
  replyMs?: number;
  error?: string;
}

function emptyMetrics(): StepMetrics {
  return { inputTokens: 0, outputTokens: 0, costUsd: 0, parseErrors: 0 };
}

function add(target: StepMetrics, source: StepMetrics): void {
  target.inputTokens += source.inputTokens;
  target.outputTokens += source.outputTokens;
  target.costUsd += source.costUsd;
  target.parseErrors += source.parseErrors;
}

function errorCode(err: unknown): string {
  if (err instanceof JevAuthError) return "jev_auth";
  if (err instanceof JevError) return "jev_http";
  if (err instanceof LLMParseError) return "llm_parse";
  if (err instanceof LLMError) return "llm_http";
  return "internal";
}

export async function runFlowDefinition(flow: Flow, text: string, settings: FlowSettings, emit: (event: RaceEvent) => void): Promise<FlowResult> {
  const schema = settings.project.outputSchema;
  const analysis: FlowAnalysis = { schemaVersion: SCHEMA_VERSION, values: {}, freeText: {} };
  const result: FlowResult = { analysis, freeText: analysis.freeText, steps: [] };
  const totals = emptyMetrics();
  const started = performance.now();
  let priorOutput: unknown;

  for (const [stepIndex, step] of flow.steps.entries()) {
    const registered = getModel(step.modelId)!;
    const modelName = registered.name;
    emit({ type: "step_start", flow: flow.id, stepIndex, stepId: step.id, role: step.role, modelName, at: Date.now() });
    const stepStart = performance.now();
    try {
      const model = getAdapter(step.modelId);
      const input = step.seesPriorStepOutput && priorOutput !== undefined
        ? `${text}\n\nPrior step output:\n${JSON.stringify(priorOutput)}` : text;
      if (step.role === "decide") {
        // Include free-text definitions to preserve the seeded projects' original
        // system prompts, while only assigning the fields owned by this step.
        const ownedSchema = schema.filter((field) => step.ownsFields.includes(field.key) || field.type === "free_text");
        const output = model instanceof SystemOneAdapter
          ? await classifyWithJev(input, ownedSchema, settings, model, step.promptOverride)
          : await decide(input, ownedSchema, settings, model as LlmChatAdapter, step.promptOverride);
        Object.assign(analysis.values, output.analysis.values);
        if (output.analysis.reasoning) analysis.reasoning = output.analysis.reasoning;
        if (output.analysis.signals) analysis.signals = { ...analysis.signals, ...output.analysis.signals };
        if (output.analysis.signalMismatch) analysis.signalMismatch = { ...analysis.signalMismatch, ...output.analysis.signalMismatch };
        const metrics: StepMetrics = { inputTokens: output.inputTokens, outputTokens: output.outputTokens, costUsd: output.costUsd, parseErrors: output.parseErrors };
        const ms = Math.round(performance.now() - stepStart);
        add(totals, metrics);
        const snapshot = structuredClone(analysis);
        result.steps.push({ stepId: step.id, stepIndex, role: step.role, modelId: step.modelId, modelName, ms, metrics, data: snapshot });
        if (result.classificationMetrics) add(result.classificationMetrics, metrics);
        else result.classificationMetrics = { ...metrics };
        result.classificationMs = (result.classificationMs ?? 0) + ms;
        emit({ type: "step_done", flow: flow.id, stepIndex, stepId: step.id, role: "decide", ms, data: snapshot, metrics });
        priorOutput = output.analysis;
      } else {
        const freeText: Record<string, string> = {};
        const metrics = emptyMetrics();
        for (const key of step.ownsFields) {
          const field = schema.find((item) => item.key === key)!;
          if (!(model instanceof LlmChatAdapter)) throw new Error(`Model "${step.modelId}" cannot generate free text.`);
          if (step.seesPriorStepOutput && flow.steps[stepIndex - 1]?.role === "decide") {
            const previous = flow.steps[stepIndex - 1];
            const previousAnalysis = priorOutput as FlowAnalysis;
            const output = previous.modelId === step.modelId
              ? await generate(text, key, previousAnalysis, settings, schema, model, step.promptOverride)
              : await generateFrom(text, key, previousAnalysis, settings, schema, model, step.promptOverride);
            freeText[key] = output.text;
            add(metrics, output);
          } else {
            const output = await model.runGenerate({
              text: `${settings.project.inputLabel}:\n${input}`,
              context: step.promptOverride || field.generatePrompt || `Write ${field.label}. Output only the text.`,
              priorStepOutput: step.seesPriorStepOutput ? priorOutput : undefined,
            });
            freeText[key] = output.text;
            add(metrics, { inputTokens: output.inputTokens, outputTokens: output.outputTokens, costUsd: model.cost(output.inputTokens, output.outputTokens), parseErrors: 0 });
          }
          analysis.freeText[key] = freeText[key];
        }
        const ms = Math.round(performance.now() - stepStart);
        add(totals, metrics);
        result.steps.push({ stepId: step.id, stepIndex, role: step.role, modelId: step.modelId, modelName, ms, metrics, freeText });
        if (result.replyMetrics) add(result.replyMetrics, metrics);
        else result.replyMetrics = { ...metrics };
        result.replyMs = (result.replyMs ?? 0) + ms;
        emit({ type: "step_done", flow: flow.id, stepIndex, stepId: step.id, role: "generate", ms, freeText, metrics });
        priorOutput = freeText;
      }
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      emit({ type: "flow_error", flow: flow.id, stepIndex, stepId: step.id, code: errorCode(err), message: result.error });
      return result;
    }
  }
  result.totalMs = Math.round(performance.now() - started);
  result.totals = totals;
  emit({ type: "flow_done", flow: flow.id, totalMs: result.totalMs, totals });
  return result;
}

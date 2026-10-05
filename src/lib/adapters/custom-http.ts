import { postJsonWithRetry } from "../dispatcher";
import { applyTemplate, parseMapping, readPath, type AnswerTransform, type HttpMapping, type JsonTemplate } from "../http-mapping";
import { modelCost, type ModelRow } from "../models";
import type { ProviderRow } from "../providers";
import type { DecisionInput, DecisionOutput, GenerateInput, GenerateOutput, ModelAdapter, QuestionSpec } from "./types";

export class MappingError extends Error {
  constructor(message: string) { super(message); this.name = "MappingError"; }
}

function checkAnswer(spec: QuestionSpec, value: unknown): void {
  if (spec.type === "enum" && (typeof value !== "string" || !(spec.options ?? []).some((option) => option.key === value))) throw new MappingError(`Invalid enum answer for ${spec.key}.`);
  if (spec.type === "float_range" && (typeof value !== "number" || !Number.isFinite(value) || value < (spec.range?.min ?? -Infinity) || value > (spec.range?.max ?? Infinity))) throw new MappingError(`Invalid numeric answer for ${spec.key}.`);
  if (spec.type === "boolean" && typeof value !== "boolean") throw new MappingError(`Invalid boolean answer for ${spec.key}.`);
  if (spec.type === "noul" && (typeof value !== "number" || value < 0 || value > 1)) throw new MappingError(`Invalid noul answer for ${spec.key}.`);
  if (spec.type === "free_text" && (typeof value !== "string" || !value.trim())) throw new MappingError(`Invalid text answer for ${spec.key}.`);
}

function transformAnswer(value: unknown, transform: AnswerTransform | undefined, spec: QuestionSpec): unknown {
  if (!transform) return value;
  if (transform.kind === "equals") return value === transform.value;
  const numeric = typeof value === "string" && value.trim() ? Number(value) : value;
  if (typeof numeric !== "number" || !Number.isFinite(numeric)) throw new MappingError(`Expected numeric answer for ${spec.key}.`);
  if (transform.kind === "number") return numeric;
  if (numeric < transform.min || numeric > transform.max) throw new MappingError(`Ordinal answer for ${spec.key} was outside the mapped range.`);
  return (spec.range?.min ?? 0) + (numeric - transform.min) / (transform.max - transform.min) * ((spec.range?.max ?? 1) - (spec.range?.min ?? 0));
}

function questionsFor(input: DecisionInput, mapping: HttpMapping): { specs: QuestionSpec[]; list: unknown[]; byKey: Record<string, unknown> } {
  const specs = input.questions.filter((question) => !mapping.excludeQuestionTypes?.includes(question.type));
  const list = specs.map((question) => {
    const template = mapping.questionTemplates?.[question.type];
    if (!template) return question;
    const optionsMap = Object.fromEntries((question.options ?? []).map((option) => [option.key, option.description]));
    return applyTemplate(template, { question: { ...question, optionsMap }, key: question.key });
  });
  return { specs, list, byKey: Object.fromEntries(specs.map((question, index) => [question.key, list[index]])) };
}

function decisionPrompt(input: DecisionInput): string {
  return `${input.context ? `${input.context}\n\n` : ""}Input:\n${input.text}\n\nAnswer each question using its allowed type and options. Return only valid JSON with this exact shape: {"answers":{"field_key":{"value":<allowed value>,"confidence":<number from 0 to 1>}}}. Include all keys, including reasoning when requested.\nQuestions:\n${JSON.stringify(input.questions)}`;
}

export class CustomHttpAdapter implements ModelAdapter {
  readonly mapping: HttpMapping;
  constructor(readonly model: ModelRow, private readonly provider: ProviderRow, private readonly apiKey?: string) {
    if (!model.apiConfig.requestTemplate) throw new MappingError(`Model ${model.id} has no HTTP mapping.`);
    this.mapping = parseMapping(model.apiConfig.requestTemplate);
  }

  private async execute(body: JsonTemplate, variables: Record<string, unknown>): Promise<{ json: unknown; ms: number }> {
    const start = performance.now();
    const { mapping } = this;
    const modelId = this.model.apiConfig.modelId ?? this.model.id;
    const endpoint = mapping.path.replace(/{{\s*model\s*}}/g, encodeURIComponent(modelId));
    const url = `${this.provider.apiBase.replace(/\/$/, "")}${endpoint}`;
    const auth = mapping.auth ?? { mode: "bearer" };
    const headers = Object.fromEntries(Object.entries(mapping.headers ?? {}).map(([key, value]) => [key, String(applyTemplate(value, variables))]));
    if (auth.mode !== "none") {
      if (!this.apiKey) throw new MappingError(`No credential configured for provider ${this.provider.name}.`);
      headers[auth.mode === "header" ? auth.header! : "Authorization"] = auth.mode === "bearer" ? `Bearer ${this.apiKey}` : this.apiKey;
    }
    const response = await postJsonWithRetry(url, headers, applyTemplate(body, variables), 120_000);
    if (response.status < 200 || response.status >= 300) throw new MappingError(`Provider ${this.provider.name} returned HTTP ${response.status}.`);
    try { return { json: JSON.parse(response.body) as unknown, ms: Math.round(performance.now() - start) }; }
    catch { throw new MappingError(`Provider ${this.provider.name} returned invalid JSON.`); }
  }

  private usage(json: unknown): { inputTokens: number; outputTokens: number } {
    const input = readPath(json, this.mapping.usage?.inputTokensPath ?? "");
    const output = readPath(json, this.mapping.usage?.outputTokensPath ?? "");
    return { inputTokens: typeof input === "number" && Number.isFinite(input) ? input : 0, outputTokens: typeof output === "number" && Number.isFinite(output) ? output : 0 };
  }

  async runDecision(input: DecisionInput): Promise<DecisionOutput> {
    const config = this.mapping.decision;
    if (!config) throw new MappingError(`Model ${this.model.name} has no decision mapping.`);
    const questions = questionsFor(input, this.mapping);
    const { json, ms } = await this.execute(config.body, {
      text: input.text, context: input.context ?? "", model: this.model.apiConfig.modelId ?? this.model.id,
      questions: questions.list, questionsByKey: questions.byKey, decisionPrompt: decisionPrompt(input), maxTokens: input.maxTokens ?? 4096,
    });
    let root = readPath(json, config.resultPath ?? "");
    if (config.resultIsJsonString) {
      if (typeof root !== "string") throw new MappingError("Decision result path must point to JSON text.");
      try { root = JSON.parse(root.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); }
      catch { throw new MappingError("Decision result was not valid JSON text."); }
    }
    const answers: DecisionOutput["answers"] = {};
    for (const spec of questions.specs) {
      const source = readPath(root, config.answersPath.replaceAll("{{key}}", spec.key));
      const answer = config.answersPath.includes("{{key}}") ? source : readPath(source, spec.key);
      if (answer === undefined) throw new MappingError(`Missing answer for ${spec.key}.`);
      const value = transformAnswer(readPath(answer, config.valueByType?.[spec.type] ?? config.valuePath ?? "value"), config.transforms?.[spec.type], spec);
      checkAnswer(spec, value);
      const rawConfidence = readPath(answer, config.confidencePath ?? "confidence");
      const confidence = rawConfidence ?? config.fallbackConfidence ?? 0;
      if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new MappingError(`Invalid confidence for ${spec.key}.`);
      answers[spec.key] = { value, confidence };
    }
    return { answers, ...this.usage(json), ms, parseErrors: 0 };
  }

  async runGenerate(input: GenerateInput): Promise<GenerateOutput> {
    const config = this.mapping.generate;
    if (!config) throw new MappingError(`Model ${this.model.name} has no generation mapping.`);
    const { json, ms } = await this.execute(config.body, { text: input.text, context: input.context ?? "", prior: input.priorStepOutput ?? null, model: this.model.apiConfig.modelId ?? this.model.id, maxTokens: input.maxTokens ?? 3000 });
    const text = readPath(json, config.textPath);
    if (typeof text !== "string" || !text.trim()) throw new MappingError("Generation response had no text at the configured path.");
    return { text: text.trim(), ...this.usage(json), ms };
  }

  cost(inputTokens: number, outputTokens: number): number { return modelCost(this.model, inputTokens, outputTokens); }
}

import type { ProviderProtocol } from "./provider-catalog";

export type JsonTemplate = null | string | number | boolean | JsonTemplate[] | { [key: string]: JsonTemplate };
export type AnswerTransform = { kind: "equals"; value: string } | { kind: "ordinal_range"; min: number; max: number } | { kind: "number" };
export interface HttpMapping {
  path: string;
  auth?: { mode: "bearer" | "header" | "none"; header?: string };
  headers?: Record<string, string>;
  questionTemplates?: Partial<Record<"enum" | "float_range" | "boolean" | "noul" | "free_text", JsonTemplate>>;
  excludeQuestionTypes?: ("enum" | "float_range" | "boolean" | "noul" | "free_text")[];
  decision?: {
    body: JsonTemplate;
    resultPath?: string;
    resultIsJsonString?: boolean;
    answersPath: string;
    valuePath?: string;
    valueByType?: Partial<Record<"enum" | "float_range" | "boolean" | "noul" | "free_text", string>>;
    transforms?: Partial<Record<"enum" | "float_range" | "boolean" | "noul" | "free_text", AnswerTransform>>;
    confidencePath?: string;
    fallbackConfidence?: number;
  };
  generate?: { body: JsonTemplate; textPath: string };
  usage?: { inputTokensPath?: string; outputTokensPath?: string };
}

const TEMPLATE_RE = /{{\s*([a-zA-Z][\w.]*)\s*}}/g;
const VARIABLE_RE = /^(text|context|model|prior|questions|questionsByKey|decisionPrompt|maxTokens|question|key)(\.(key|instructions|type|options|optionsMap|range|scale|noulCriteria))?$/;
const PATH_RE = /^(?:[a-zA-Z_][\w-]*|\d+)(?:\.(?:[a-zA-Z_][\w-]*|\d+))*$/;

export function readPath(object: unknown, path: string): unknown {
  if (!path) return object;
  return path.split(".").reduce<unknown>((value, key) => {
    if (key === "__proto__" || key === "constructor" || key === "prototype") return undefined;
    if (value === null || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[key];
  }, object);
}

export function applyTemplate(template: JsonTemplate, variables: Record<string, unknown>): unknown {
  if (typeof template === "string") {
    const whole = template.match(/^{{\s*([a-zA-Z][\w.]*)\s*}}$/);
    if (whole) return readPath(variables, whole[1]) ?? null;
    return template.replace(TEMPLATE_RE, (_, key: string) => {
      const value = readPath(variables, key);
      return value === undefined || value === null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
    });
  }
  if (Array.isArray(template)) return template.map((item) => applyTemplate(item, variables));
  if (template !== null && typeof template === "object") return Object.fromEntries(Object.entries(template).map(([key, value]) => [key, applyTemplate(value, variables)]));
  return template;
}

export function validateMapping(raw: unknown): string[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return ["Mapping must be a JSON object."];
  const mapping = raw as Partial<HttpMapping>;
  const errors: string[] = [];
  if (typeof mapping.path !== "string" || !mapping.path.startsWith("/") || mapping.path.startsWith("//") || mapping.path.includes("..") || mapping.path.includes("?")) errors.push("path must be an absolute path on the provider host (no query, // or ..).");
  if (!mapping.decision && !mapping.generate) errors.push("Provide a decision or generate mapping.");
  if (mapping.auth && (!["bearer", "header", "none"].includes(mapping.auth.mode) || (mapping.auth.mode === "header" && !/^[A-Za-z][\w-]*$/.test(mapping.auth.header ?? "")))) errors.push("auth must use bearer, none or a named header.");
  if (mapping.headers && (typeof mapping.headers !== "object" || Object.entries(mapping.headers).some(([key, value]) => !/^[A-Za-z][\w-]*$/.test(key) || typeof value !== "string" || /[\r\n]/.test(value)))) errors.push("headers must be single-line strings with valid header names.");
  const path = (value: unknown, label: string, required = false, allowRoot = false) => {
    if ((required || value !== undefined) && (typeof value !== "string" || (required && !allowRoot && !value) || (value && !PATH_RE.test(value)))) errors.push(`${label} must be a dot-separated response path.`);
  };
  if (mapping.decision) {
    if (!Object.hasOwn(mapping.decision, "body")) errors.push("decision.body is required.");
    path(mapping.decision.resultPath, "decision.resultPath");
    path(mapping.decision.answersPath?.replaceAll("{{key}}", "field"), "decision.answersPath", true, true);
    path(mapping.decision.valuePath, "decision.valuePath");
    path(mapping.decision.confidencePath, "decision.confidencePath");
    if (mapping.decision.valueByType) for (const [key, value] of Object.entries(mapping.decision.valueByType)) path(value, `decision.valueByType.${key}`, true);
    if (mapping.decision.transforms) for (const [key, transform] of Object.entries(mapping.decision.transforms)) {
      if (!["enum", "float_range", "boolean", "noul", "free_text"].includes(key) || !transform || !["equals", "number", "ordinal_range"].includes(transform.kind)) errors.push(`Invalid transform for ${key}.`);
      else if (transform.kind === "equals" && typeof transform.value !== "string") errors.push(`equals transform needs a string value for ${key}.`);
      else if (transform.kind === "ordinal_range" && (!Number.isFinite(transform.min) || !Number.isFinite(transform.max) || transform.max <= transform.min)) errors.push(`ordinal_range needs min < max for ${key}.`);
    }
    if (mapping.decision.fallbackConfidence !== undefined && (typeof mapping.decision.fallbackConfidence !== "number" || mapping.decision.fallbackConfidence < 0 || mapping.decision.fallbackConfidence > 1)) errors.push("fallbackConfidence must be between 0 and 1.");
  }
  if (mapping.generate) { if (!Object.hasOwn(mapping.generate, "body")) errors.push("generate.body is required."); path(mapping.generate.textPath, "generate.textPath", true); }
  if (mapping.usage) { path(mapping.usage.inputTokensPath, "usage.inputTokensPath"); path(mapping.usage.outputTokensPath, "usage.outputTokensPath"); }
  if (mapping.questionTemplates && (typeof mapping.questionTemplates !== "object" || Array.isArray(mapping.questionTemplates) || Object.keys(mapping.questionTemplates).some((key) => !["enum", "float_range", "boolean", "noul", "free_text"].includes(key)))) errors.push("questionTemplates must be an object keyed by question type.");
  if (mapping.excludeQuestionTypes && (!Array.isArray(mapping.excludeQuestionTypes) || mapping.excludeQuestionTypes.some((type) => !["enum", "float_range", "boolean", "noul", "free_text"].includes(type)))) errors.push("excludeQuestionTypes must contain question types.");
  const scan = (value: unknown, depth = 0) => {
    if (depth > 12) { errors.push("Template nesting cannot exceed 12 levels."); return; }
    if (typeof value === "string") {
      for (const match of value.matchAll(TEMPLATE_RE)) if (!VARIABLE_RE.test(match[1])) errors.push(`Unknown template variable: ${match[1]}.`);
    } else if (Array.isArray(value)) value.forEach((item) => scan(item, depth + 1));
    else if (value !== null && typeof value === "object") Object.values(value).forEach((item) => scan(item, depth + 1));
  };
  scan(mapping.decision?.body); scan(mapping.generate?.body); scan(mapping.questionTemplates); scan(mapping.headers); scan(mapping.path);
  return errors;
}

export function parseMapping(source: string): HttpMapping {
  if (source.length > 32_768) throw new Error("Mapping JSON is too large (32 KB maximum).");
  let mapping: unknown;
  try { mapping = JSON.parse(source); } catch { throw new Error("Mapping must be valid JSON."); }
  const errors = validateMapping(mapping);
  if (errors.length) throw new Error(errors.join(" "));
  return mapping as HttpMapping;
}

const llmDecision = {
  resultIsJsonString: true, answersPath: "answers", valuePath: "value", confidencePath: "confidence", fallbackConfidence: 0,
};

export function mappingForProtocol(protocol: ProviderProtocol): HttpMapping | null {
  if (protocol === "anthropic_messages") return {
    path: "/messages", auth: { mode: "header", header: "x-api-key" }, headers: { "anthropic-version": "2023-06-01" },
    decision: { body: { model: "{{model}}", max_tokens: "{{maxTokens}}", system: "{{context}}", messages: [{ role: "user", content: "{{decisionPrompt}}" }] }, resultPath: "content.0.text", ...llmDecision },
    generate: { body: { model: "{{model}}", max_tokens: "{{maxTokens}}", system: "{{context}}", messages: [{ role: "user", content: "{{text}}" }] }, textPath: "content.0.text" },
    usage: { inputTokensPath: "usage.input_tokens", outputTokensPath: "usage.output_tokens" },
  };
  if (protocol === "gemini_generate") return {
    path: "/models/{{model}}:generateContent", auth: { mode: "header", header: "x-goog-api-key" },
    decision: { body: { contents: [{ parts: [{ text: "{{decisionPrompt}}" }] }], generationConfig: { responseMimeType: "application/json", maxOutputTokens: "{{maxTokens}}" } }, resultPath: "candidates.0.content.parts.0.text", ...llmDecision },
    generate: { body: { contents: [{ parts: [{ text: "{{context}}\n\n{{text}}" }] }], generationConfig: { maxOutputTokens: "{{maxTokens}}" } }, textPath: "candidates.0.content.parts.0.text" },
    usage: { inputTokensPath: "usageMetadata.promptTokenCount", outputTokensPath: "usageMetadata.candidatesTokenCount" },
  };
  return null;
}

export const GLINER_MAPPING: HttpMapping = {
  path: "/classify", auth: { mode: "none" }, excludeQuestionTypes: ["free_text"],
  questionTemplates: {
    enum: { labels: "{{question.optionsMap}}", prompt: "{{question.instructions}}" },
    float_range: { labels: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"], prompt: "{{question.instructions}}" },
    boolean: { labels: ["yes", "no"], prompt: "{{question.instructions}}" },
  },
  decision: {
    body: { text: "{{text}}", tasks: "{{questionsByKey}}" }, answersPath: "",
    valuePath: "label", confidencePath: "confidence",
    transforms: { float_range: { kind: "ordinal_range", min: 0, max: 10 }, boolean: { kind: "equals", value: "yes" } },
  },
};

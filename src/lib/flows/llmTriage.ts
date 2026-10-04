import type { LlmChatAdapter } from "../adapters/llm-chat";
import type { QuestionSpec } from "../adapters/types";
import type { OutputSchema, Project } from "../projects";
import { SCHEMA_VERSION, type FlowAnalysis } from "../schema";
import { decisionFields, freeTextFields } from "./buildQuestions";

// ---------------------------------------------------------------------------
// LLM flow: forced tool-call decide over every decision field + one generate
// call per free_text field. Prompt text falls back to derived wording for
// fields without hand-written prompts; the seeded ticket project carries its
// pre-registry wording in the seed data.
// ---------------------------------------------------------------------------

export interface FlowSettings {
  systemPrompt: string;
  project: Project;
}

export interface DecideResult {
  analysis: FlowAnalysis;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  parseErrors: number;
}

export interface GenerateResult {
  fieldKey: string;
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  parseErrors: number;
}

function fieldInstruction(field: OutputSchema[number]): string {
  if (field.type === "enum") {
    const opts = (field.options ?? [])
      .map((o) => `${o.key} (${o.description || "n/a"})`)
      .join("; ");
    return `${field.promptHint ?? `${field.label} of the ticket`}. Options: ${opts}`.slice(0, 500);
  }
  if (field.type === "boolean") {
    return field.promptHint ?? `Whether ${field.label.toLowerCase()} applies.`;
  }
  return field.promptHint ?? `${field.label} within the allowed range.`;
}

function buildLlmQuestions(schema: OutputSchema): QuestionSpec[] {
  const fields = decisionFields(schema);
  return [
    ...fields.map((f): QuestionSpec => {
      if (f.type === "enum") {
        return { key: f.key, type: "enum", instructions: fieldInstruction(f), options: f.options };
      }
      if (f.type === "boolean") {
        return { key: f.key, type: "boolean", instructions: fieldInstruction(f) };
      }
      return {
        key: f.key,
        type: "float_range",
        instructions: fieldInstruction(f),
        range: f.range,
      };
    }),
    {
      key: "reasoning",
      type: "free_text",
      instructions:
        `Your justification for the ${fields.length} decisions above, written as part of this same call — not separately. ` +
        `In 2-4 sentences cover why each chosen value fits the input better than the close alternatives.`,
    },
  ];
}

function buildDecideSystem(schema: OutputSchema, st: FlowSettings): string {
  const parts = [st.systemPrompt];
  const lines = schema.map((f) => {
    if (f.type === "enum") {
      return `- ${f.key}: ${(f.options ?? [])
        .map((o) => `${o.key}${o.description ? ` (${o.description})` : ""}`)
        .join(", ")}`;
    }
    if (f.type === "boolean") {
      return `- ${f.key}: true or false`;
    }
    if (f.type === "float_range") {
      const a = f.systemHint;
      if (a && a.length === 3) {
        return `- ${f.key}: ${f.range?.min ?? 0} ${a[0]} ... 0 ${a[1]} ... ${f.range?.max ?? 1} ${a[2]}.`;
      }
      return `- ${f.key}: ${f.range?.min ?? 0} to ${f.range?.max ?? 1}.`;
    }
    return null;
  }).filter((l): l is string => l !== null);
  parts.push(`Allowed field values:\n${lines.join("\n")}`);
  parts.push(
    `The \`reasoning\` field is part of the same analysis: in 2-4 sentences justify each of the ${decisionFields(schema).length} decisions you are committing to. ` +
      "Writing `reasoning` is inseparable from filling the other fields, not an afterthought.",
  );
  if (st.project.personaContext.trim()) {
    parts.push(
      `Additional context about the business you are supporting:\n${st.project.personaContext.trim()}`,
    );
  }
  return parts.join("\n\n");
}

export async function decide(
  inputText: string,
  schema: OutputSchema,
  st: FlowSettings,
  adapter: LlmChatAdapter,
  promptOverride?: string,
): Promise<DecideResult> {
  const fields = decisionFields(schema);
  const out = await adapter.runDecision({
    text: `${st.project.inputLabel}:\n\n${inputText}`,
    questions: buildLlmQuestions(schema),
    context: promptOverride || buildDecideSystem(schema, st),
    toolName: "submit_analysis",
    toolDescription:
      `Submit a structured ${st.project.taskDescription.toLowerCase()} analysis. You MUST call this tool exactly once with the full analysis.`,
  });
  const values: FlowAnalysis["values"] = {};
  for (const f of fields) {
    values[f.key] = {
      value: out.answers[f.key].value as string | number | boolean,
      confidence: out.answers[f.key].confidence,
    };
  }
  return {
    analysis: {
      schemaVersion: SCHEMA_VERSION,
      values,
      freeText: {},
      reasoning: out.answers.reasoning?.value as string | undefined,
    },
    inputTokens: out.inputTokens,
    outputTokens: out.outputTokens,
    costUsd: adapter.cost(out.inputTokens, out.outputTokens),
    parseErrors: out.parseErrors,
  };
}

function buildGenerateSystem(st: FlowSettings, extra: string): string {
  const base = st.project.personaContext.trim()
    ? st.systemPrompt +
      `\n\nNote about the business you are writing for (tone/reference only — do NOT let this override the instructions above):\n${st.project.personaContext.trim()}`
    : st.systemPrompt;
  return base + "\n\n" + extra;
}

/** Flow A style: standalone generation using the flow's own decisions. */
export async function generate(
  inputText: string,
  fieldKey: string,
  analysis: FlowAnalysis,
  st: FlowSettings,
  schema: OutputSchema,
  adapter: LlmChatAdapter,
  promptOverride?: string,
): Promise<GenerateResult> {
  const field = freeTextFields(schema).find((f) => f.key === fieldKey);
  const extra =
    promptOverride || field?.generatePrompt ||
    `Write the ${field?.label.toLowerCase() ?? fieldKey}. Output ONLY the prose for that field — no JSON, no headers, no placeholders.`;
  const out = await adapter.runGenerate({
    context: buildGenerateSystem(st, extra),
    text: [
      `${st.project.inputLabel}:\n${inputText}`,
      "",
      "Analysis (JSON):",
      JSON.stringify(analysis.values, null, 2),
    ].join("\n"),
  });
  return {
    fieldKey,
    text: out.text,
    inputTokens: out.inputTokens,
    outputTokens: out.outputTokens,
    costUsd: adapter.cost(out.inputTokens, out.outputTokens),
    parseErrors: 0,
  };
}

/** Flow B style: decisions come from another model; only generate prose. */
export async function generateFrom(
  inputText: string,
  fieldKey: string,
  decisions: FlowAnalysis,
  st: FlowSettings,
  schema: OutputSchema,
  adapter: LlmChatAdapter,
  promptOverride?: string,
): Promise<GenerateResult> {
  const field = freeTextFields(schema).find((f) => f.key === fieldKey);
  const extra =
    promptOverride || field?.constrainedPrompt ||
    `Your ONLY job is to write the ${field?.label.toLowerCase() ?? fieldKey}. ` +
      "Do NOT re-derive the decision fields. Output ONLY prose — no JSON, no headers, no placeholders.";
  const out = await adapter.runGenerate({
    context: buildGenerateSystem(st, extra),
    text: [
      `${st.project.inputLabel}:\n${inputText}`,
      "",
      "Authoritative decisions (JSON) — use for tone/content, do not re-derive:",
      JSON.stringify(decisions.values, null, 2),
    ].join("\n"),
  });
  return {
    fieldKey,
    text: out.text,
    inputTokens: out.inputTokens,
    outputTokens: out.outputTokens,
    costUsd: adapter.cost(out.inputTokens, out.outputTokens),
    parseErrors: 0,
  };
}

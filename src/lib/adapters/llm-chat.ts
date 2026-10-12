import { postJsonWithRetry } from "../dispatcher";
import { modelCost, type ModelRow } from "../models";
import { z } from "zod";
import type {
  DecisionInput,
  DecisionOutput,
  GenerateInput,
  GenerateOutput,
  ModelAdapter,
  QuestionSpec,
} from "./types";

// ---------------------------------------------------------------------------
// llm_chat adapter — chat-completions endpoints with tool/function calling
// (kimi-k3, GPT, Claude-via-compat, ...). runDecision forces a single tool
// call constrained by a schema derived from QuestionSpec[]; runGenerate is a
// plain completion.
// ---------------------------------------------------------------------------

export class LLMError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LLMError";
  }
}

export class LLMParseError extends Error {
  constructor(
    message: string,
    readonly rawOutput: string,
  ) {
    super(message);
    this.name = "LLMParseError";
  }
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface ChatCompletionResponse {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: { name: string; arguments: string };
      }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string };
}

const MAX_RETRIES = 2;

function propertyFor(spec: QuestionSpec): Record<string, unknown> {
  switch (spec.type) {
    case "enum":
      return {
        type: "string",
        enum: (spec.options ?? []).map((o) => o.key),
        description: spec.instructions,
      };
    case "float_range":
      return {
        type: "number",
        minimum: spec.range?.min,
        maximum: spec.range?.max,
        description: spec.instructions,
      };
    case "boolean":
      return { type: "boolean", description: spec.instructions };
    default:
      return { type: "string", description: spec.instructions };
  }
}

function zodFor(spec: QuestionSpec): z.ZodTypeAny {
  switch (spec.type) {
    case "enum":
      return z.enum((spec.options ?? []).map((o) => o.key) as [string, ...string[]]);
    case "float_range":
      return z
        .number()
        .min(spec.range?.min ?? Number.NEGATIVE_INFINITY)
        .max(spec.range?.max ?? Number.POSITIVE_INFINITY);
    case "boolean":
      return z.boolean();
    default:
      return z.string().min(1);
  }
}

function buildTool(
  specs: QuestionSpec[],
  toolName: string,
  toolDescription: string,
): ToolDefinition {
  const scored = specs.filter((s) => s.type !== "free_text");
  const free = specs.filter((s) => s.type === "free_text");
  // Property order matters for consistency with the pre-adapter wire format:
  // scored fields, then confidence, then free-text fields.
  return {
    type: "function",
    function: {
      name: toolName,
      description: toolDescription,
      parameters: {
        type: "object",
        properties: {
          ...Object.fromEntries(scored.map((s) => [s.key, propertyFor(s)])),
          confidence: {
            type: "object",
            properties: Object.fromEntries(
              scored.map((s) => [s.key, { type: "number", minimum: 0, maximum: 1 }]),
            ),
            required: scored.map((s) => s.key),
            additionalProperties: false,
            description: "Per-field confidence scores, each between 0 and 1.",
          },
          ...Object.fromEntries(free.map((s) => [s.key, propertyFor(s)])),
        },
        required: [...scored.map((s) => s.key), "confidence", ...free.map((s) => s.key)],
        additionalProperties: false,
      },
    },
  };
}

// kimi-k3 occasionally narrates its tool call inside plain-text replies:
// "**submit_ticket_analysis** ```json {...}``` **reply** <actual text>".
// Strip that transcript scaffolding and keep only the customer-facing text.
function sanitizeLlmText(raw: string): string {
  let text = raw.trim();
  const markers = [...text.matchAll(/\*\*reply\*\*\s*/gi)];
  const last = markers[markers.length - 1];
  if (last && typeof last.index === "number") {
    text = text.slice(last.index + last[0].length).trim();
  }
  text = text
    .replace(/^(\*\*[a-z_]+\*\*\s*)?```(?:json)?\s*[\s\S]*?```\s*/i, "")
    .trim();
  return text;
}

export class LlmChatAdapter implements ModelAdapter {
  constructor(
    readonly model: ModelRow,
    private readonly apiKey: string,
  ) {}

  private async chat(opts: {
    messages: ChatMessage[];
    tools?: ToolDefinition[];
    toolChoice?: { type: "function"; function: { name: string } };
    maxTokens: number;
  }): Promise<{
    content: string;
    toolArguments: string | null;
    inputTokens: number;
    outputTokens: number;
  }> {
    const body: Record<string, unknown> = {
      model: this.model.apiConfig.modelId,
      messages: opts.messages,
      max_tokens: opts.maxTokens,
    };
    if (opts.tools) body.tools = opts.tools;
    if (opts.toolChoice) body.tool_choice = opts.toolChoice;

    const res = await postJsonWithRetry(
      `${this.model.apiConfig.apiBase}/chat/completions`,
      { Authorization: `Bearer ${this.apiKey}` },
      body,
    );
    if (res.status < 200 || res.status >= 300) {
      throw new LLMError(
        `LLM request failed: HTTP ${res.status}.`,
        res.status,
      );
    }
    let json: ChatCompletionResponse;
    try {
      json = JSON.parse(res.body) as ChatCompletionResponse;
    } catch {
      throw new LLMError(
        `LLM response was not JSON: HTTP ${res.status}.`,
        res.status,
      );
    }
    if (json.error?.message) {
      throw new LLMError("LLM API returned an error.");
    }
    const choice = json.choices?.[0];
    const toolCall = choice?.message?.tool_calls?.[0];
    return {
      content: choice?.message?.content ?? "",
      toolArguments: toolCall ? toolCall.function.arguments : null,
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
    };
  }

  async runDecision(input: DecisionInput): Promise<DecisionOutput> {
    const startedAt = performance.now();
    const toolName = input.toolName ?? "submit_analysis";
    const tool = buildTool(
      input.questions,
      toolName,
      input.toolDescription ??
        `Submit a structured analysis. You MUST call this tool exactly once with the full analysis.`,
    );
    const messages: ChatMessage[] = [
      ...(input.context ? [{ role: "system" as const, content: input.context }] : []),
      { role: "user" as const, content: input.text },
    ];
    const schema = z.object({
      ...Object.fromEntries(input.questions.map((s) => [s.key, zodFor(s)])),
      confidence: z.object(
        Object.fromEntries(
          input.questions
            .filter((s) => s.type !== "free_text")
            .map((s) => [s.key, z.number().min(0).max(1)]),
        ),
      ),
    });

    let parseErrors = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let lastError = "unknown classification failure";
    let lastRawOutput = "";

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const result = await this.chat({
        messages,
        tools: [tool],
        toolChoice: { type: "function", function: { name: toolName } },
        maxTokens: input.maxTokens ?? 4096,
      });
      inputTokens += result.inputTokens;
      outputTokens += result.outputTokens;
      const raw = result.toolArguments ?? result.content ?? "";
      lastRawOutput = raw;

      try {
        if (!raw) throw new LLMParseError("Model returned no tool arguments.", raw);
        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(raw);
        } catch (e) {
          throw new LLMParseError(
            `Tool arguments were not valid JSON: ${(e as Error).message}`,
            raw,
          );
        }
        const validated = schema.safeParse(parsedJson);
        if (!validated.success) {
          throw new LLMParseError(
            `Schema validation failed: ${validated.error.issues
              .map((i) => `${i.path.map(String).join(".")}: ${i.message}`)
              .join("; ")}`,
            raw,
          );
        }
        const data = validated.data as Record<string, unknown> & {
          confidence: Record<string, number>;
        };
        const answers: DecisionOutput["answers"] = {};
        for (const s of input.questions) {
          answers[s.key] = {
            value: data[s.key],
            confidence: s.type === "free_text" ? 0 : (data.confidence[s.key] ?? 0),
          };
        }
        return {
          answers,
          inputTokens,
          outputTokens,
          ms: Math.round(performance.now() - startedAt),
          parseErrors,
        };
      } catch (err) {
        parseErrors += 1;
        lastError = err instanceof Error ? err.message : String(err);
        if (attempt < MAX_RETRIES) {
          messages.push({ role: "assistant", content: raw ? raw : "(empty tool arguments)" });
          messages.push({
            role: "user",
            content:
              `Your previous tool call was invalid: ${lastError}. ` +
              `Call ${toolName} again with corrected arguments satisfying the schema exactly.`,
          });
        }
      }
    }
    throw new LLMParseError(
      `Classification failed after ${MAX_RETRIES + 1} attempts. Last error: ${lastError}`,
      lastRawOutput,
    );
  }

  async runGenerate(input: GenerateInput): Promise<GenerateOutput> {
    const startedAt = performance.now();
    const result = await this.chat({
      messages: [
        ...(input.context ? [{ role: "system" as const, content: input.context }] : []),
        { role: "user" as const, content: input.text },
      ],
      maxTokens: input.maxTokens ?? 3000,
    });
    const text = sanitizeLlmText(result.content);
    if (!text) {
      throw new LLMParseError("Model returned an empty reply.", result.content);
    }
    return {
      text,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      ms: Math.round(performance.now() - startedAt),
    };
  }

  cost(inputTokens: number, outputTokens: number): number {
    return modelCost(this.model, inputTokens, outputTokens);
  }
}

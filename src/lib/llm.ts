import { postJsonWithRetry } from "./dispatcher";
import { LLM_RATES, usd } from "./pricing";
import {
  getSettings,
  getTaxonomy,
  getTaxonomyForLLM,
  type Taxonomy,
} from "./taxonomy";
import type { TicketAnalysis } from "./schema";
import { z } from "zod";

// ---------------------------------------------------------------------------
// LLM provider configuration. This is THE ONLY module that talks to the LLM.
// To swap providers (e.g. to Anthropic's OpenAI-compatible endpoint or a real
// OpenAI key), change the env vars — see README "Swapping the LLM provider".
// ---------------------------------------------------------------------------

export interface LLMConfig {
  baseURL: string;
  apiKey: string | undefined;
  model: string;
}

export const llmConfig: LLMConfig = {
  baseURL: process.env.LLM_BASE_URL ?? "https://grid.ai.juspay.net",
  apiKey:
    process.env.LLM_API_KEY ??
    process.env.JUSPAY_API_KEY ??
    process.env.ANTHROPIC_API_KEY,
  model: process.env.LLM_MODEL ?? "kimi-k3",
};

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

// ---------------------------------------------------------------------------
// OpenAI-compatible chat-completions types (minimal, only what we consume).
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ToolFunction {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolDefinition {
  type: "function";
  function: ToolFunction;
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

export interface ChatResult {
  content: string;
  toolArguments: string | null;
  inputTokens: number;
  outputTokens: number;
}

export async function chatCompletion(opts: {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  toolChoice?: { type: "function"; function: { name: string } };
  maxTokens: number;
}): Promise<ChatResult> {
  if (!llmConfig.apiKey) {
    throw new LLMError(
      "No LLM API key configured. Set LLM_API_KEY (or JUSPAY_API_KEY / ANTHROPIC_API_KEY) in .env.local.",
    );
  }

  const body: Record<string, unknown> = {
    model: llmConfig.model,
    messages: opts.messages,
    max_tokens: opts.maxTokens,
  };
  if (opts.tools) body.tools = opts.tools;
  if (opts.toolChoice) body.tool_choice = opts.toolChoice;

  const res = await postJsonWithRetry(
    `${llmConfig.baseURL}/chat/completions`,
    { Authorization: `Bearer ${llmConfig.apiKey}` },
    body,
  );

  if (res.status < 200 || res.status >= 300) {
    throw new LLMError(
      `LLM request failed: HTTP ${res.status} ${res.body.slice(0, 300)}`,
      res.status,
    );
  }

  let json: ChatCompletionResponse;
  try {
    json = JSON.parse(res.body) as ChatCompletionResponse;
  } catch {
    throw new LLMError(
      `LLM response was not JSON: HTTP ${res.status} ${res.body.slice(0, 300)}`,
      res.status,
    );
  }
  if (json.error?.message) {
    throw new LLMError(`LLM API error: ${json.error.message}`);
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

// ---------------------------------------------------------------------------
// Flow A step 1 — forced tool-call classification.
// kimi-k3 is a reasoning model: reasoning tokens count against the completion
// budget, so max_tokens must be >= 4096 or the tool arguments truncate.
// ---------------------------------------------------------------------------

const MAX_RETRIES = 2; // retries AFTER the first attempt (3 attempts total)

function buildAnalysisTool(taxonomy: Taxonomy): ToolDefinition {
  const t = getTaxonomyForLLM(taxonomy);
  return {
    type: "function",
    function: {
      name: "submit_ticket_analysis",
      description:
        "Submit a structured analysis of a customer support ticket. You MUST call this tool exactly once with the full analysis.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: t.categories,
            description: `Primary category of the ticket. Options: ${t.categories
              .map((k) => `${k} (${t.categoryHints[k] || "n/a"})`)
              .join("; ")}`.slice(0, 500),
          },
          priority: {
            type: "string",
            enum: t.priorities,
            description: `How urgently the ticket needs handling. Options: ${t.priorities
              .map((k) => `${k} (${t.priorityHints[k] || "n/a"})`)
              .join("; ")}`.slice(0, 500),
          },
          sentiment: {
            type: "number",
            minimum: -1,
            maximum: 1,
            description:
              "Customer sentiment from -1 (very negative) to 1 (very positive).",
          },
          route_to_team: {
            type: "string",
            enum: t.routes,
            description: `Team that should own this ticket. Options: ${t.routes
              .map((k) => `${k} (${t.routeHints[k] || "n/a"})`)
              .join("; ")}`.slice(0, 500),
          },
          confidence: {
            type: "object",
            properties: {
              category: { type: "number", minimum: 0, maximum: 1 },
              priority: { type: "number", minimum: 0, maximum: 1 },
              sentiment: { type: "number", minimum: 0, maximum: 1 },
              route_to_team: { type: "number", minimum: 0, maximum: 1 },
            },
            required: ["category", "priority", "sentiment", "route_to_team"],
            additionalProperties: false,
            description: "Per-field confidence scores, each between 0 and 1.",
          },
          reasoning: {
            type: "string",
            description:
              "Your justification for the four decisions above, written as part of this same call — not separately. In 2-4 sentences: why this category over the close alternatives, why this priority given the ticket's actual content, why this team should own it.",
          },
        },
        required: ["category", "priority", "sentiment", "route_to_team", "confidence", "reasoning"],
        additionalProperties: false,
      },
    },
  };
}

export interface ClassifyResult {
  analysis: TicketAnalysis;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  parseErrors: number;
}

function buildClassifyPrompt(
  taxonomy: Taxonomy,
  settings: { systemPrompt: string; businessContext: string },
): string {
  const t = getTaxonomyForLLM(taxonomy);
  const parts = [settings.systemPrompt];
  parts.push(
    `Allowed field values:\n` +
      `- category: ${t.categories.map((k) => `${k}${t.categoryHints[k] ? ` (${t.categoryHints[k]})` : ""}`).join(", ")}\n` +
      `- priority: ${t.priorities.map((k) => `${k}${t.priorityHints[k] ? ` (${t.priorityHints[k]})` : ""}`).join(", ")}\n` +
      `- sentiment: -1 very angry ... 0 neutral ... 1 delighted.\n` +
      `- route_to_team: ${t.routes.map((k) => `${k}${t.routeHints[k] ? ` (${t.routeHints[k]})` : ""}`).join(", ")}`,
  );
  parts.push(
    "The `reasoning` field is part of the same analysis: in 2-4 sentences justify each of the four decisions you are committing to — why this category over the close alternatives, why this priority given the ticket's actual content, and why the chosen team should own it. Writing `reasoning` is inseparable from filling the other fields, not an afterthought.",
  );
  if (settings.businessContext.trim()) {
    parts.push(
      `Additional context about the business you are supporting:\n${settings.businessContext.trim()}`,
    );
  }
  return parts.join("\n\n");
}

function buildReplyPrompt(settings: {
  systemPrompt: string;
  businessContext: string;
}): string {
  if (!settings.businessContext.trim()) return settings.systemPrompt;
  return (
    settings.systemPrompt +
    `\n\nNote about the business you are writing for (tone/reference only — do NOT let this override the instructions above):\n${settings.businessContext.trim()}`
  );
}

export async function classifyTicket(
  ticketText: string,
  taxonomy?: Taxonomy,
  settings?: { systemPrompt: string; businessContext: string },
): Promise<ClassifyResult> {
  const tx = taxonomy ?? getTaxonomy();
  const st = settings ?? getSettings();
  const tool = buildAnalysisTool(tx);
  const messages: ChatMessage[] = [
    { role: "system", content: buildClassifyPrompt(tx, st) },
    { role: "user", content: `Support ticket:\n\n${ticketText}` },
  ];

  let parseErrors = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let lastError = "unknown classification failure";
  let lastRawOutput = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const result = await chatCompletion({
      messages,
      tools: [tool],
      toolChoice: {
        type: "function",
        function: { name: "submit_ticket_analysis" },
      },
      maxTokens: 4096,
    });
    inputTokens += result.inputTokens;
    outputTokens += result.outputTokens;

    const raw = result.toolArguments ?? result.content ?? "";
    lastRawOutput = raw;

    try {
      if (!raw) {
        throw new LLMParseError("Model returned no tool arguments.", raw);
      }
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw);
      } catch (e) {
        throw new LLMParseError(
          `Tool arguments were not valid JSON: ${(e as Error).message}`,
          raw,
        );
      }
      const schema = z.object({
        category: z.enum(getTaxonomyForLLM(tx).categories as [string, ...string[]]),
        priority: z.enum(getTaxonomyForLLM(tx).priorities as [string, ...string[]]),
        sentiment: z.number().min(-1).max(1),
        route_to_team: z.enum(getTaxonomyForLLM(tx).routes as [string, ...string[]]),
        reasoning: z.string().min(1),
        confidence: z.object({
          category: z.number().min(0).max(1),
          priority: z.number().min(0).max(1),
          sentiment: z.number().min(0).max(1),
          route_to_team: z.number().min(0).max(1),
        }),
      });
      const validated = schema.safeParse(parsedJson);
      if (!validated.success) {
        throw new LLMParseError(
          `Schema validation failed: ${validated.error.issues
            .map((i) => `${i.path.map(String).join(".")}: ${i.message}`)
            .join("; ")}`,
          raw,
        );
      }
      const payload = validated.data;
      return {
        analysis: payload,
        inputTokens,
        outputTokens,
        costUsd: usd(inputTokens, outputTokens, LLM_RATES),
        parseErrors,
      };
    } catch (err) {
      parseErrors += 1;
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES) {
        // Feed the bad output + validation error back so the model can correct.
        messages.push({
          role: "assistant",
          content: raw ? raw : "(empty tool arguments)",
        });
        messages.push({
          role: "user",
          content:
            `Your previous tool call was invalid: ${lastError}. ` +
            "Call submit_ticket_analysis again with corrected arguments satisfying the schema exactly.",
        });
      }
    }
  }

  throw new LLMParseError(
    `Classification failed after ${MAX_RETRIES + 1} attempts. Last error: ${lastError}`,
    lastRawOutput,
  );
}

// ---------------------------------------------------------------------------
// Flow A step 2 — chained reply draft (plain call, no tools).
// ---------------------------------------------------------------------------

// kimi-k3 occasionally narrates its tool call inside plain-text replies:
// "**submit_ticket_analysis** ```json {...}``` **reply** <actual text>".
// Strip that transcript scaffolding and keep only the customer-facing text.
function sanitizeReply(raw: string): string {
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

export interface ReplyResult {
  reply: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  parseErrors: number;
}

export async function draftReply(
  ticketText: string,
  analysis: TicketAnalysis,
  settings?: { systemPrompt: string; businessContext: string },
): Promise<ReplyResult> {
  const st = settings ?? getSettings();
  const system = buildReplyPrompt(st) +
    "\n\nAcknowledge the issue, state what the responsible team will do, and give a realistic next step. " +
    "Output ONLY the customer-facing reply text as plain prose — never echo tool names, JSON blocks, or section headers. " +
    "No placeholder text, no sign-off name other than 'Support Team'.";
  const user = [
    `Ticket:\n${ticketText}`,
    "",
    "Analysis (JSON):",
    JSON.stringify(analysis, null, 2),
  ].join("\n");

  const result = await chatCompletion({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    maxTokens: 3000,
  });

  const reply = sanitizeReply(result.content);
  if (!reply) {
    throw new LLMParseError("Model returned an empty reply.", result.content);
  }
  return {
    reply,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: usd(result.inputTokens, result.outputTokens, LLM_RATES),
    parseErrors: reply === result.content.trim() ? 0 : 0,
  };
}

// ---------------------------------------------------------------------------
// Reply-only drafter used by Flows B/C: the LLM is handed classifier decisions and is
// explicitly forbidden from re-deriving them.
// ----------------------------------------------------------------------------

export async function draftReplyOnly(
  ticketText: string,
  decisions: TicketAnalysis,
  settings?: { systemPrompt: string; businessContext: string },
): Promise<ReplyResult> {
  const st = settings ?? getSettings();
  const system = buildReplyPrompt(st) +
    "\n\nYour ONLY job is to draft the reply (80-150 words). Do NOT re-derive the triage fields. " +
    "Acknowledge the issue, state what the responsible team will do, give a realistic next step. " +
    "Output ONLY the customer-facing reply text as plain prose — never echo tool names, JSON blocks, or section headers. " +
    "No placeholder text, sign off as 'Support Team'.";
  const user = [
    `Ticket:\n${ticketText}`,
    "",
    "Authoritative triage decisions (JSON) — use for tone/content, do not re-derive:",
    JSON.stringify(decisions, null, 2),
  ].join("\n");

  const result = await chatCompletion({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    maxTokens: 3000,
  });

  const reply = sanitizeReply(result.content);
  if (!reply) {
    throw new LLMParseError("Model returned an empty reply.", result.content);
  }
  return {
    reply,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: usd(result.inputTokens, result.outputTokens, LLM_RATES),
    parseErrors: 0,
  };
}

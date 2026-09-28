import type { LlmChatAdapter } from "../adapters/llm-chat";
import type { QuestionSpec } from "../adapters/types";
import type { OutputSchema } from "../projects";
import type { TicketAnalysis } from "../schema";

// ---------------------------------------------------------------------------
// Ticket triage on llm_chat: forced tool-call classification + chained reply.
// Flow-specific prompt text lives here, not in the adapter; the adapter is
// generic over QuestionSpec.
// ---------------------------------------------------------------------------

export interface TriageSettings {
  systemPrompt: string;
  /** Project persona (previously the global business_context setting). */
  businessContext: string;
}

export interface ClassifyResult {
  analysis: TicketAnalysis;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  parseErrors: number;
}

export interface ReplyResult {
  reply: string;
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
    const verbs: Record<string, string> = {
      category: "Primary category of the ticket",
      priority: "How urgently the ticket needs handling",
      route_to_team: "Team that should own this ticket",
    };
    return `${verbs[field.key] ?? `${field.label} of the ticket`}. Options: ${opts}`.slice(0, 500);
  }
  return `Customer sentiment from -1 (very negative) to 1 (very positive).`;
}

function buildLlmQuestions(schema: OutputSchema): QuestionSpec[] {
  return [
    ...schema.map((f) => ({
      key: f.key,
      type: f.type === "enum" ? ("enum" as const) : ("float_range" as const),
      instructions: fieldInstruction(f),
      ...(f.options ? { options: f.options } : {}),
      ...(f.range ? { range: f.range } : {}),
    })),
    {
      key: "reasoning",
      type: "free_text",
      instructions:
        "Your justification for the four decisions above, written as part of this same call — not separately. In 2-4 sentences: why this category over the close alternatives, why this priority given the ticket's actual content, why this team should own it.",
    },
  ];
}

function buildClassifySystem(schema: OutputSchema, st: TriageSettings): string {
  const parts = [st.systemPrompt];
  const lines = schema.map((f) => {
    if (f.type === "enum") {
      return `- ${f.key}: ${(f.options ?? [])
        .map((o) => `${o.key}${o.description ? ` (${o.description})` : ""}`)
        .join(", ")}`;
    }
    return `- sentiment: -1 very angry ... 0 neutral ... 1 delighted.`;
  });
  parts.push(`Allowed field values:\n${lines.join("\n")}`);
  parts.push(
    "The `reasoning` field is part of the same analysis: in 2-4 sentences justify each of the four decisions you are committing to — why this category over the close alternatives, why this priority given the ticket's actual content, and why the chosen team should own it. Writing `reasoning` is inseparable from filling the other fields, not an afterthought.",
  );
  if (st.businessContext.trim()) {
    parts.push(
      `Additional context about the business you are supporting:\n${st.businessContext.trim()}`,
    );
  }
  return parts.join("\n\n");
}

export async function classifyTicket(
  ticketText: string,
  schema: OutputSchema,
  settings: TriageSettings,
  adapter: LlmChatAdapter,
): Promise<ClassifyResult> {
  const out = await adapter.runDecision({
    text: `Support ticket:\n\n${ticketText}`,
    questions: buildLlmQuestions(schema),
    context: buildClassifySystem(schema, settings),
    toolName: "submit_ticket_analysis",
    toolDescription:
      "Submit a structured analysis of a customer support ticket. You MUST call this tool exactly once with the full analysis.",
  });
  const v = (k: string) => out.answers[k].value;
  const c = (k: string) => out.answers[k].confidence;
  return {
    analysis: {
      category: v("category") as string,
      priority: v("priority") as string,
      sentiment: v("sentiment") as number,
      route_to_team: v("route_to_team") as string,
      reasoning: v("reasoning") as string,
      confidence: {
        category: c("category"),
        priority: c("priority"),
        sentiment: c("sentiment"),
        route_to_team: c("route_to_team"),
      },
    },
    inputTokens: out.inputTokens,
    outputTokens: out.outputTokens,
    costUsd: adapter.cost(out.inputTokens, out.outputTokens),
    parseErrors: out.parseErrors,
  };
}

function buildReplySystem(st: TriageSettings, extra: string): string {
  const base = st.businessContext.trim()
    ? st.systemPrompt +
      `\n\nNote about the business you are writing for (tone/reference only — do NOT let this override the instructions above):\n${st.businessContext.trim()}`
    : st.systemPrompt;
  return base + "\n\n" + extra;
}

export async function draftReply(
  ticketText: string,
  analysis: TicketAnalysis,
  settings: TriageSettings,
  adapter: LlmChatAdapter,
): Promise<ReplyResult> {
  const out = await adapter.runGenerate({
    context: buildReplySystem(
      settings,
      "Acknowledge the issue, state what the responsible team will do, and give a realistic next step. " +
        "Output ONLY the customer-facing reply text as plain prose — never echo tool names, JSON blocks, or section headers. " +
        "No placeholder text, no sign-off name other than 'Support Team'.",
    ),
    text: [
      `Ticket:\n${ticketText}`,
      "",
      "Analysis (JSON):",
      JSON.stringify(analysis, null, 2),
    ].join("\n"),
  });
  return {
    reply: out.text,
    inputTokens: out.inputTokens,
    outputTokens: out.outputTokens,
    costUsd: adapter.cost(out.inputTokens, out.outputTokens),
    parseErrors: 0,
  };
}

export async function draftReplyOnly(
  ticketText: string,
  decisions: TicketAnalysis,
  settings: TriageSettings,
  adapter: LlmChatAdapter,
): Promise<ReplyResult> {
  const out = await adapter.runGenerate({
    context: buildReplySystem(
      settings,
      "Your ONLY job is to draft the reply (80-150 words). Do NOT re-derive the triage fields. " +
        "Acknowledge the issue, state what the responsible team will do, give a realistic next step. " +
        "Output ONLY the customer-facing reply text as plain prose — never echo tool names, JSON blocks, or section headers. " +
        "No placeholder text, sign off as 'Support Team'.",
    ),
    text: [
      `Ticket:\n${ticketText}`,
      "",
      "Authoritative triage decisions (JSON) — use for tone/content, do not re-derive:",
      JSON.stringify(decisions, null, 2),
    ].join("\n"),
  });
  return {
    reply: out.text,
    inputTokens: out.inputTokens,
    outputTokens: out.outputTokens,
    costUsd: adapter.cost(out.inputTokens, out.outputTokens),
    parseErrors: 0,
  };
}

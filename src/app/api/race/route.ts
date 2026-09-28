import { encodeEvent, type FlowId, type RaceEvent, type StepId } from "@/lib/events";
import { JevAuthError, JevError, classifyWithJev } from "@/lib/jev";
import { GlinerError, classifyWithGliner } from "@/lib/gliner";
import {
  LLMError,
  LLMParseError,
  classifyTicket,
  draftReply,
  draftReplyOnly,
} from "@/lib/llm";
import { saveSession } from "@/lib/sessions";
import { getSettings, getTaxonomy } from "@/lib/taxonomy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/race — streams NDJSON events while running all flows concurrently.
// Errors inside one flow are emitted as flow_error events (data on the wire)
// and never crash the route or the other flow.
// ---------------------------------------------------------------------------

function errorCode(err: unknown): string {
  if (err instanceof JevAuthError) return "jev_auth";
  if (err instanceof JevError) return "jev_http";
  if (err instanceof GlinerError) return "gliner_local";
  if (err instanceof LLMParseError) return "llm_parse";
  if (err instanceof LLMError) return "llm_http";
  return "internal";
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface FlowTotals {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  parseErrors: number;
}

function addStep(
  totals: FlowTotals,
  step: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    parseErrors: number;
  },
): void {
  totals.inputTokens += step.inputTokens;
  totals.outputTokens += step.outputTokens;
  totals.costUsd += step.costUsd;
  totals.parseErrors += step.parseErrors;
}

export async function POST(request: Request): Promise<Response> {
  let text = "";
  try {
    const body = (await request.json()) as { text?: unknown };
    text = typeof body.text === "string" ? body.text.trim() : "";
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  if (!text) {
    return Response.json({ error: "Field `text` is required." }, { status: 400 });
  }
  if (text.length > 20_000) {
    return Response.json(
      { error: "Ticket text is too long (max 20,000 chars)." },
      { status: 413 },
    );
  }

  const encoder = new TextEncoder();
  const ticket = text;

  const taxonomy = getTaxonomy();
  const settings = getSettings();

  interface FlowResult {
    analysis: import("@/lib/schema").TicketAnalysis;
    reply: string;
    totalMs: number;
    totals: FlowTotals;
    classificationMetrics?: FlowTotals;
    classificationMs?: number;
    replyMetrics?: FlowTotals;
    replyMs?: number;
    error?: string;
  }
  const flowResults: Partial<Record<FlowId, FlowResult>> = {};

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (event: RaceEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeEvent(event)));
        } catch {
          // Client disconnected mid-race — mark the stream dead so every later
          // emit no-ops, but let both flows finish so the session is saved whole.
          closed = true;
        }
      };

      const stepStart = (flow: FlowId, step: StepId) =>
        emit({ type: "step_start", flow, step, at: Date.now() });

      const failFlow = (flow: FlowId, step: StepId, err: unknown) =>
        emit({
          type: "flow_error",
          flow,
          step,
          code: errorCode(err),
          message: errorMessage(err),
        });

      async function runFlowA(): Promise<void> {
        const flowStart = performance.now();
        const flow: FlowId = "A";
        const step: StepId = "classification";
        const result: Partial<FlowResult> = {};
        stepStart(flow, step);
        try {
          const t0 = performance.now();
          const cls = await classifyTicket(ticket, taxonomy, settings);
          result.analysis = cls.analysis;
          result.classificationMs = Math.round(performance.now() - t0);
          result.classificationMetrics = {
            inputTokens: cls.inputTokens,
            outputTokens: cls.outputTokens,
            costUsd: cls.costUsd,
            parseErrors: cls.parseErrors,
          };
          emit({
            type: "step_done",
            flow,
            step,
            ms: result.classificationMs,
            data: cls.analysis,
            metrics: result.classificationMetrics,
          });

          const replyStep: StepId = "reply";
          stepStart(flow, replyStep);
          try {
            const r0 = performance.now();
          const rep = await draftReply(ticket, cls.analysis, settings);
          result.reply = rep.reply;
          result.replyMs = Math.round(performance.now() - r0);
          result.replyMetrics = {
            inputTokens: rep.inputTokens,
            outputTokens: rep.outputTokens,
            costUsd: rep.costUsd,
            parseErrors: rep.parseErrors,
          };
          emit({
            type: "step_done",
            flow,
            step: replyStep,
            ms: result.replyMs,
            reply: rep.reply,
            metrics: result.replyMetrics,
          });
          const totals: FlowTotals = {
            inputTokens: 0,
            outputTokens: 0,
            costUsd: 0,
            parseErrors: 0,
          };
          addStep(totals, cls);
          addStep(totals, rep);
          result.totalMs = Math.round(performance.now() - flowStart);
          result.totals = totals;
          emit({
            type: "flow_done",
            flow,
            totalMs: result.totalMs,
            totals,
          });
        } catch (err) {
          result.error = errorMessage(err);
          failFlow(flow, replyStep, err);
        }
      } catch (err) {
        result.error = errorMessage(err);
        failFlow(flow, step, err);
      }
      flowResults[flow] = result as FlowResult;
    }

    async function runFlowB(): Promise<void> {
      const flowStart = performance.now();
      const flow: FlowId = "B";
      const step: StepId = "classification";
      const result: Partial<FlowResult> = {};
      stepStart(flow, step);
        try {
          const t0 = performance.now();
          const cls = await classifyWithJev(ticket, taxonomy, settings);
          result.analysis = cls.analysis;
          result.classificationMs = Math.round(performance.now() - t0);
          result.classificationMetrics = {
            inputTokens: cls.inputTokens,
            outputTokens: cls.outputTokens,
            costUsd: cls.costUsd,
            parseErrors: cls.parseErrors,
          };
          emit({
            type: "step_done",
            flow,
            step,
            ms: result.classificationMs,
            data: cls.analysis,
            metrics: result.classificationMetrics,
          });

          const replyStep: StepId = "reply";
          stepStart(flow, replyStep);
          try {
            const r0 = performance.now();
          const rep = await draftReplyOnly(ticket, cls.analysis, settings);
          result.reply = rep.reply;
          result.replyMs = Math.round(performance.now() - r0);
          result.replyMetrics = {
            inputTokens: rep.inputTokens,
            outputTokens: rep.outputTokens,
            costUsd: rep.costUsd,
            parseErrors: rep.parseErrors,
          };
          emit({
            type: "step_done",
            flow,
            step: replyStep,
            ms: result.replyMs,
            reply: rep.reply,
            metrics: result.replyMetrics,
          });
          const totals: FlowTotals = {
            inputTokens: 0,
            outputTokens: 0,
            costUsd: 0,
            parseErrors: 0,
          };
          addStep(totals, cls);
          addStep(totals, rep);
          result.totalMs = Math.round(performance.now() - flowStart);
          result.totals = totals;
          emit({
            type: "flow_done",
            flow,
            totalMs: result.totalMs,
            totals,
          });
        } catch (err) {
          result.error = errorMessage(err);
          failFlow(flow, replyStep, err);
        }
      } catch (err) {
        result.error = errorMessage(err);
        failFlow(flow, step, err);
      }
      flowResults[flow] = result as FlowResult;
    }

    async function runFlowC(): Promise<void> {
      const flowStart = performance.now();
      const flow: FlowId = "C";
      const step: StepId = "classification";
      const result: Partial<FlowResult> = {};
      stepStart(flow, step);
      try {
        const t0 = performance.now();
        const cls = await classifyWithGliner(ticket, taxonomy, settings);
        result.analysis = cls.analysis;
        result.classificationMs = Math.round(performance.now() - t0);
        result.classificationMetrics = {
          inputTokens: cls.inputTokens,
          outputTokens: cls.outputTokens,
          costUsd: cls.costUsd,
          parseErrors: cls.parseErrors,
        };
        emit({
          type: "step_done",
          flow,
          step,
          ms: result.classificationMs,
          data: cls.analysis,
          metrics: result.classificationMetrics,
        });

        const replyStep: StepId = "reply";
        stepStart(flow, replyStep);
        try {
          const r0 = performance.now();
          const rep = await draftReplyOnly(ticket, cls.analysis, settings);
          result.reply = rep.reply;
          result.replyMs = Math.round(performance.now() - r0);
          result.replyMetrics = {
            inputTokens: rep.inputTokens,
            outputTokens: rep.outputTokens,
            costUsd: rep.costUsd,
            parseErrors: rep.parseErrors,
          };
          emit({
            type: "step_done",
            flow,
            step: replyStep,
            ms: result.replyMs,
            reply: rep.reply,
            metrics: result.replyMetrics,
          });
          const totals: FlowTotals = { inputTokens: 0, outputTokens: 0, costUsd: 0, parseErrors: 0 };
          addStep(totals, cls);
          addStep(totals, rep);
          result.totalMs = Math.round(performance.now() - flowStart);
          result.totals = totals;
          emit({ type: "flow_done", flow, totalMs: result.totalMs, totals });
        } catch (err) {
          result.error = errorMessage(err);
          failFlow(flow, replyStep, err);
        }
      } catch (err) {
        result.error = errorMessage(err);
        failFlow(flow, step, err);
      }
      flowResults[flow] = result as FlowResult;
    }

    await Promise.allSettled([runFlowA(), runFlowB(), runFlowC()]);

    const label = text.slice(0, 50).replace(/\s+/g, " ").trim();
    try {
      saveSession({
        type: "single",
        label,
        input: { text },
        result: { flows: flowResults },
        taxonomySnapshot: taxonomy,
      });
    } catch {
      // Session persistence failure must not break a race response.
    }
    emit({ type: "run_done" });
      closed = true;
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

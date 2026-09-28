import { encodeEvent, type FlowId, type RaceEvent, type StepId } from "@/lib/events";
import { LLMError, LLMParseError, type LlmChatAdapter } from "@/lib/adapters/llm-chat";
import { JevAuthError, JevError, type SystemOneAdapter } from "@/lib/adapters/system-one";
import { decide, generate, generateFrom, type FlowSettings, type GenerateResult } from "@/lib/flows/llmTriage";
import { classifyWithJev } from "@/lib/flows/jevTriage";
import { freeTextFields } from "@/lib/flows/buildQuestions";
import { getDefaultProject, getProject, type Project } from "@/lib/projects";
import { getAdapter } from "@/lib/registry";
import { saveSession } from "@/lib/sessions";
import { getSystemPrompt } from "@/lib/settings";
import type { StepMetrics } from "@/lib/events";
import type { FlowAnalysis } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/race — streams NDJSON events while running both flows concurrently
// against a project's output schema. Field set is fully schema-driven; the two
// flows are the only hardcoded orchestration (llm-only vs jev+llm generative).
// ---------------------------------------------------------------------------

function errorCode(err: unknown): string {
  if (err instanceof JevAuthError) return "jev_auth";
  if (err instanceof JevError) return "jev_http";
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

function emptyTotals(): FlowTotals {
  return { inputTokens: 0, outputTokens: 0, costUsd: 0, parseErrors: 0 };
}

function addMetrics(totals: FlowTotals, m: StepMetrics): void {
  totals.inputTokens += m.inputTokens;
  totals.outputTokens += m.outputTokens;
  totals.costUsd += m.costUsd;
  totals.parseErrors += m.parseErrors;
}

export async function POST(request: Request): Promise<Response> {
  let text = "";
  let projectId: string | null = null;
  try {
    const body = (await request.json()) as { text?: unknown; projectId?: unknown };
    text = typeof body.text === "string" ? body.text.trim() : "";
    projectId = typeof body.projectId === "string" ? body.projectId : null;
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

  const project: Project | null = projectId ? getProject(projectId) : getDefaultProject();
  if (!project) {
    return Response.json({ error: `Project "${projectId}" not found.` }, { status: 404 });
  }
  const schema = project.outputSchema;
  const settings: FlowSettings = { systemPrompt: getSystemPrompt(), project };

  const adapterA = getAdapter("kimi-k3") as LlmChatAdapter;
  const adapterB = getAdapter("jev") as SystemOneAdapter;
  const writer = adapterA;

  interface FlowResult {
    analysis: FlowAnalysis;
    freeText: Record<string, string>;
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
      const encoder = new TextEncoder();
      const emit = (event: RaceEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeEvent(event)));
        } catch {
          // Client disconnected — flows keep running so the session saves whole.
          closed = true;
        }
      };

      const stepStart = (flow: FlowId, step: StepId) =>
        emit({ type: "step_start", flow, step, at: Date.now() });

      const failFlow = (flow: FlowId, step: StepId, err: unknown) =>
        emit({ type: "flow_error", flow, step, code: errorCode(err), message: errorMessage(err) });

      async function runFlow(flow: FlowId, clsDecide: () => Promise<{
        analysis: FlowAnalysis;
        inputTokens: number;
        outputTokens: number;
        costUsd: number;
        parseErrors: number;
      }>): Promise<void> {
        const flowStart = performance.now();
        const step: StepId = "classification";
        const result: Partial<FlowResult> = { freeText: {} };
        stepStart(flow, step);
        try {
          const t0 = performance.now();
          const cls = await clsDecide();
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
            const genResults: GenerateResult[] = [];
            for (const f of freeTextFields(schema)) {
              genResults.push(
                flow === "A"
                  ? await generate(text, f.key, cls.analysis, settings, schema, writer)
                  : await generateFrom(text, f.key, cls.analysis, settings, schema, writer),
              );
            }
            const repMetrics: FlowTotals = emptyTotals();
            for (const g of genResults) {
              addMetrics(repMetrics, g);
              result.freeText![g.fieldKey] = g.text;
            }
            result.replyMs = Math.round(performance.now() - r0);
            result.replyMetrics = repMetrics;
            if (result.analysis) result.analysis.freeText = result.freeText!;
            emit({
              type: "step_done",
              flow,
              step: replyStep,
              ms: result.replyMs,
              freeText: result.freeText!,
              metrics: repMetrics,
            });
            const totals = emptyTotals();
            addMetrics(totals, result.classificationMetrics);
            addMetrics(totals, repMetrics);
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

      const aDecide = () => decide(text, schema, settings, adapterA);
      const bDecide = () => classifyWithJev(text, schema, settings, adapterB);

      await Promise.allSettled([runFlow("A", aDecide), runFlow("B", bDecide)]);

      const label = text.slice(0, 50).replace(/\s+/g, " ").trim();
      try {
        saveSession({
          type: "single",
          label,
          projectId: project.id,
          input: { text },
          result: { flows: flowResults },
          schemaSnapshot: schema,
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

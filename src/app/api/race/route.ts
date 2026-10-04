import { encodeEvent, type RaceEvent } from "@/lib/events";
import { runFlowDefinition, type FlowResult } from "@/lib/flow-runner";
import { getFlow, validateFlow, type Flow } from "@/lib/flows";
import { listModels } from "@/lib/models";
import { getDefaultProject, getProject } from "@/lib/projects";
import { saveSession } from "@/lib/sessions";
import { getSystemPrompt } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return Response.json({ error: "Request body must be JSON." }, { status: 400 }); }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return Response.json({ error: "Field `text` is required." }, { status: 400 });
  if (text.length > 20_000) return Response.json({ error: "Ticket text is too long (max 20,000 chars)." }, { status: 413 });
  const project = typeof body.projectId === "string" ? getProject(body.projectId) : getDefaultProject();
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

  const ids = body.flowIds;
  if (!Array.isArray(ids) || ids.length < 2 || ids.some((id) => typeof id !== "string") || new Set(ids).size !== ids.length) {
    return Response.json({ error: "Select at least two distinct flow ids." }, { status: 400 });
  }
  const flows = ids.map((id) => getFlow(id as string));
  if (flows.some((flow) => !flow || flow.projectId !== project.id)) {
    return Response.json({ error: "Every selected flow must belong to this project." }, { status: 400 });
  }
  const selected = flows as Flow[];
  for (const flow of selected) {
    const errors = validateFlow(flow.steps, project.outputSchema, listModels());
    if (errors.length) return Response.json({ error: `Flow "${flow.name}" must be updated: ${errors.join(" ")}` }, { status: 400 });
  }

  const settings = { systemPrompt: getSystemPrompt(), project };
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const encoder = new TextEncoder();
      const emit = (event: RaceEvent) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(encodeEvent(event))); }
        catch { closed = true; }
      };
      const results: Record<string, FlowResult> = {};
      await Promise.all(selected.map(async (flow) => {
        try { results[flow.id] = await runFlowDefinition(flow, text, settings, emit); }
        catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          results[flow.id] = { analysis: { schemaVersion: 2, values: {}, freeText: {} }, freeText: {}, steps: [], error: message };
          emit({ type: "flow_error", flow: flow.id, stepId: flow.steps[0]?.id ?? "", stepIndex: 0, code: "internal", message });
        }
      }));
      try {
        saveSession({
          type: "single",
          label: text.slice(0, 50).replace(/\s+/g, " ").trim(),
          projectId: project.id,
          input: { text },
          result: { flowIds: ids, flowSnapshot: selected, flows: results },
          schemaSnapshot: project.outputSchema,
        });
      } catch { /* Persistence failure does not interrupt a completed race. */ }
      emit({ type: "run_done" });
      closed = true;
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}

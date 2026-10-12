import { deleteEvaluation, getEvaluation, setEvaluationStatus } from "@/lib/evaluations";
import { JSON_LIMITS, readJsonObject } from "@/lib/api-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const run = getEvaluation((await params).id);
  return run ? Response.json({ run }) : Response.json({ error: "Evaluation run not found." }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const run = getEvaluation(id);
  if (!run) return Response.json({ error: "Evaluation run not found." }, { status: 404 });
  const parsed = await readJsonObject(request, JSON_LIMITS.evaluation);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.value;
  if (body.cancel !== true) return Response.json({ error: "Only cancel: true is supported." }, { status: 400 });
  if (run.status === "queued" || run.status === "running") setEvaluationStatus(id, "cancel_requested");
  return Response.json({ run: getEvaluation(id) });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const run = getEvaluation(id);
  if (!run) return Response.json({ error: "Evaluation run not found." }, { status: 404 });
  if (["queued", "running", "cancel_requested"].includes(run.status)) return Response.json({ error: "Cancel and finish the run before deleting it." }, { status: 409 });
  deleteEvaluation(id);
  return Response.json({ ok: true });
}

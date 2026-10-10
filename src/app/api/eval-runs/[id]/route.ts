import { deleteEvaluation, getEvaluation, setEvaluationStatus } from "@/lib/evaluations";

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
  let body: { cancel?: unknown };
  try { body = await request.json() as { cancel?: unknown }; }
  catch { return Response.json({ error: "Request body must be JSON." }, { status: 400 }); }
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

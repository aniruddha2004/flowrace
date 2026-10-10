import { listEvaluations } from "@/lib/evaluations";
import { getProject } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!getProject(id)) return Response.json({ error: "Project not found." }, { status: 404 });
  return Response.json({ runs: listEvaluations(id).map((run) => ({ id: run.id, projectId: run.projectId, datasetId: run.datasetId,
    datasetName: run.result.datasetName, status: run.status, completed: run.result.completed, total: run.result.total,
    flowNames: run.result.flowSnapshot.map((flow) => flow.name), createdAt: run.createdAt })) });
}

import { getProject } from "@/lib/projects";
import { createDataset, listDatasets } from "@/lib/datasets";
import { validateDatasetItems, type DatasetItem } from "@/lib/dataset-format";
import { JSON_LIMITS, readJsonObject } from "@/lib/api-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!getProject(id)) return Response.json({ error: "Project not found." }, { status: 404 });
  return Response.json({ datasets: listDatasets(id) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
  const parsed = await readJsonObject(request, JSON_LIMITS.dataset);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.value;
  if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 100) return Response.json({ error: "Dataset name must be 1–100 characters." }, { status: 400 });
  const issues = validateDatasetItems(body.items, project.outputSchema);
  if (issues.length) return Response.json({ error: "Dataset items need corrections.", issues }, { status: 400 });
  return Response.json({ dataset: createDataset(id, body.name, body.items as DatasetItem[]) }, { status: 201 });
}

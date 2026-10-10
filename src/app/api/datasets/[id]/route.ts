import { deleteDataset, getDataset, updateDataset } from "@/lib/datasets";
import { validateDatasetItems, type DatasetItem } from "@/lib/dataset-format";
import { getProject } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const dataset = getDataset((await params).id);
  return dataset ? Response.json({ dataset }) : Response.json({ error: "Dataset not found." }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const previous = getDataset(id);
  if (!previous) return Response.json({ error: "Dataset not found." }, { status: 404 });
  let patch: Record<string, unknown>;
  try { patch = await request.json() as Record<string, unknown>; }
  catch { return Response.json({ error: "Request body must be JSON." }, { status: 400 }); }
  const name = patch.name ?? previous.name;
  const items = patch.items ?? previous.items;
  if (typeof name !== "string" || !name.trim() || name.length > 100) return Response.json({ error: "Dataset name must be 1–100 characters." }, { status: 400 });
  const schema = getProject(previous.projectId)?.outputSchema ?? [];
  const issues = validateDatasetItems(items, schema);
  if (issues.length) return Response.json({ error: "Dataset items need corrections.", issues }, { status: 400 });
  return Response.json({ dataset: updateDataset(id, name, items as DatasetItem[]) });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const id = (await params).id;
  if (!getDataset(id)) return Response.json({ error: "Dataset not found." }, { status: 404 });
  deleteDataset(id);
  return Response.json({ ok: true });
}

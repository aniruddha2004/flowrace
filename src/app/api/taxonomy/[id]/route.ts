import { NextResponse } from "next/server";
import { deleteTaxonomyOption, getDefaultProject, updateTaxonomyOption } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const patch = body as { label?: unknown; description?: unknown; sortOrder?: unknown };
  const result = updateTaxonomyOption(getDefaultProject().id, id, {
    label: typeof patch.label === "string" ? patch.label : undefined,
    description: typeof patch.description === "string" ? patch.description : undefined,
    sortOrder: typeof patch.sortOrder === "number" ? patch.sortOrder : undefined,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const result = deleteTaxonomyOption(getDefaultProject().id, id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

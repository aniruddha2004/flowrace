import { NextResponse } from "next/server";
import { deleteTaxonomyOption, getDefaultProject, updateTaxonomyOption } from "@/lib/projects";
import { JSON_LIMITS, readJsonObject } from "@/lib/api-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const parsed = await readJsonObject(request, JSON_LIMITS.settings);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const patch = parsed.value;
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

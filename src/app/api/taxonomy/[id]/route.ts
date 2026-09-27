import { NextResponse } from "next/server";
import { deleteTaxonomyOption, updateTaxonomyOption } from "@/lib/taxonomy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const patch = body as {
    key?: unknown;
    label?: unknown;
    description?: unknown;
    sortOrder?: unknown;
  };
  const result = updateTaxonomyOption(id, {
    key: typeof patch.key === "string" ? patch.key : undefined,
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
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }
  const result = deleteTaxonomyOption(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

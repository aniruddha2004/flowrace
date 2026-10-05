import { NextResponse } from "next/server";
import { deleteModel, getModel, updateModel, validateModelInput } from "@/lib/models";

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
  const b = body as Record<string, unknown>;
  const existing = getModel(id);
  if (!existing) return NextResponse.json({ error: "Model not found." }, { status: 404 });
  const check = validateModelInput({
    name: b.name ?? existing.name,
    adapterType: b.adapterType ?? existing.adapterType,
    providerId: b.providerId ?? existing.providerId,
    apiConfig: b.apiConfig ?? existing.apiConfig,
    pricing: b.pricing ?? existing.pricing,
  });
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
  const result = updateModel(id, b as never);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const result = deleteModel(id);
  if (!result.ok) return NextResponse.json({ error: result.error, flows: result.references }, { status: result.references ? 409 : 404 });
  return NextResponse.json({ ok: true });
}

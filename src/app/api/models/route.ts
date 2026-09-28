import { NextResponse } from "next/server";
import { createModel, listModels, validateModelInput, type AdapterType } from "@/lib/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ models: listModels() });
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const check = validateModelInput({
    id: b.id,
    name: b.name,
    adapterType: b.adapterType,
    apiConfig: b.apiConfig,
    pricing: b.pricing,
  });
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
  if (typeof b.id !== "string") {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }
  const result = createModel({
    id: b.id,
    name: String(b.name),
    adapterType: b.adapterType as AdapterType,
    apiConfig: b.apiConfig as never,
    pricing: b.pricing as never,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ model: result.model }, { status: 201 });
}

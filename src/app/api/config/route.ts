import { NextResponse } from "next/server";
import { getConfig, updateSettings } from "@/lib/taxonomy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(getConfig());
}

export async function PATCH(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const { businessContext, systemPrompt } = body as {
    businessContext?: unknown;
    systemPrompt?: unknown;
  };
  const patch: { businessContext?: string; systemPrompt?: string } = {};
  if (businessContext !== undefined) {
    if (typeof businessContext !== "string") {
      return NextResponse.json(
        { error: "businessContext must be a string." },
        { status: 400 },
      );
    }
    patch.businessContext = businessContext;
  }
  if (systemPrompt !== undefined) {
    if (typeof systemPrompt !== "string") {
      return NextResponse.json(
        { error: "systemPrompt must be a string." },
        { status: 400 },
      );
    }
    patch.systemPrompt = systemPrompt;
  }
  const updated = updateSettings(patch);
  return NextResponse.json({ settings: updated });
}

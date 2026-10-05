import { NextResponse } from "next/server";
import { discoverModels, getProvider } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const provider = getProvider(id);
  if (!provider) return NextResponse.json({ error: "Provider not found." }, { status: 404 });
  try { return NextResponse.json({ models: await discoverModels(provider) }); }
  catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Model discovery failed." }, { status: 502 }); }
}

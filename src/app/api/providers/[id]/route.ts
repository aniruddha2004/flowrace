import { NextResponse } from "next/server";
import type { ProviderProtocol } from "@/lib/provider-catalog";
import { deleteProvider, getProvider, updateProvider, validateProvider } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const existing = getProvider(id);
  if (!existing) return NextResponse.json({ error: "Provider not found." }, { status: 404 });
  let patch: Record<string, unknown>;
  try { patch = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 }); }
  if (patch.clearKey !== undefined && typeof patch.clearKey !== "boolean") return NextResponse.json({ error: "clearKey must be boolean." }, { status: 400 });
  const input = { name: patch.name ?? existing.name, protocol: patch.protocol ?? existing.protocol, apiBase: patch.apiBase ?? existing.apiBase, apiKeyEnvVar: patch.apiKeyEnvVar ?? existing.apiKeyEnvVar, apiKey: patch.apiKey, clearKey: patch.clearKey };
  const error = validateProvider(input);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const provider = updateProvider(id, input as { name: string; protocol: ProviderProtocol; apiBase: string; apiKeyEnvVar: string; apiKey?: string; clearKey?: boolean });
  return NextResponse.json({ provider });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const result = deleteProvider(id);
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: result.status });
}

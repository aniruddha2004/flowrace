import { NextResponse } from "next/server";
import { PROVIDER_PRESETS, type ProviderProtocol } from "@/lib/provider-catalog";
import { createProvider, listProviders, validateProvider } from "@/lib/providers";
import { JSON_LIMITS, readJsonObject } from "@/lib/api-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ providers: listProviders(), presets: PROVIDER_PRESETS });
}

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = await readJsonObject(request, JSON_LIMITS.provider);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const input = parsed.value;
  const error = validateProvider(input);
  if (error || typeof input.id !== "string") return NextResponse.json({ error: error ?? "Provider ID is required." }, { status: 400 });
  try {
    const provider = createProvider({ id: input.id, name: input.name as string, protocol: input.protocol as ProviderProtocol, apiBase: input.apiBase as string, apiKeyEnvVar: input.apiKeyEnvVar as string, apiKey: input.apiKey as string | undefined });
    return NextResponse.json({ provider }, { status: 201 });
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes("UNIQUE constraint")) return NextResponse.json({ error: "Provider ID already exists." }, { status: 409 });
    throw cause;
  }
}

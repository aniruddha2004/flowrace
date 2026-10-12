import { NextResponse } from "next/server";
import { listSessions, deleteSessions } from "@/lib/sessions";
import { JSON_LIMITS, readJsonObject } from "@/lib/api-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const projectId = new URL(request.url).searchParams.get("project") ?? undefined;
  return NextResponse.json({ sessions: listSessions(projectId) });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const parsed = await readJsonObject(request, JSON_LIMITS.sessionDelete);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const ids = parsed.value.ids;
  if (Array.isArray(ids) && ids.every((id) => typeof id === "string") && ids.length <= 100) {
    const deleted = deleteSessions(ids);
    return NextResponse.json({ deleted });
  }
  return NextResponse.json({ error: "Body must be { ids: string[] } with at most 100 IDs." }, { status: 400 });
}

import { NextResponse } from "next/server";
import { listSessions, deleteSessions } from "@/lib/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ sessions: listSessions() });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as { ids?: string[] } | null;
  if (body?.ids && Array.isArray(body.ids) && body.ids.every((i) => typeof i === "string")) {
    const deleted = deleteSessions(body.ids);
    return NextResponse.json({ deleted });
  }
  return NextResponse.json({ error: "POST body must be { ids: string[] }" }, { status: 400 });
}

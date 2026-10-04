import { NextResponse } from "next/server";
import { createFlow, listFlows, type FlowStep } from "@/lib/flows";
import { getProject } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context): Promise<NextResponse> {
  const { id } = await params;
  if (!getProject(id)) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json({ flows: listFlows(id) });
}

export async function POST(request: Request, { params }: Context): Promise<NextResponse> {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 }); }
  const result = createFlow({ projectId: id, name: body.name as string, steps: body.steps as FlowStep[] });
  if (!result.ok) return NextResponse.json({ error: result.errors.join(" "), errors: result.errors }, { status: getProject(id) ? 400 : 404 });
  return NextResponse.json({ flow: result.flow }, { status: 201 });
}

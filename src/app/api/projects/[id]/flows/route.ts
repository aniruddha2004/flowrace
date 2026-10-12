import { NextResponse } from "next/server";
import { createFlow, listFlows, type FlowStep } from "@/lib/flows";
import { getProject } from "@/lib/projects";
import { JSON_LIMITS, readJsonObject } from "@/lib/api-json";

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
  const parsed = await readJsonObject(request, JSON_LIMITS.project);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.value;
  const result = createFlow({ projectId: id, name: body.name as string, steps: body.steps as FlowStep[] });
  if (!result.ok) return NextResponse.json({ error: result.errors.join(" "), errors: result.errors }, { status: getProject(id) ? 400 : 404 });
  return NextResponse.json({ flow: result.flow }, { status: 201 });
}

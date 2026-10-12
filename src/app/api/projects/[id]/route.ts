import { NextResponse } from "next/server";
import { deleteProject, getProject, updateProject, type OutputSchema } from "@/lib/projects";
import { JSON_LIMITS, readJsonObject } from "@/lib/api-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json({ project });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const parsed = await readJsonObject(request, JSON_LIMITS.project);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const b = parsed.value;
  const result = updateProject(id, {
    name: typeof b.name === "string" ? b.name : undefined,
    outputSchema: Array.isArray(b.outputSchema) ? (b.outputSchema as OutputSchema) : undefined,
    personaContext: typeof b.personaContext === "string" ? b.personaContext : undefined,
    taskDescription: typeof b.taskDescription === "string" ? b.taskDescription : undefined,
    inputLabel: typeof b.inputLabel === "string" ? b.inputLabel : undefined,
    crossCuttingClues: Array.isArray(b.crossCuttingClues) ? (b.crossCuttingClues as never) : undefined,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error === "Project not found." ? 404 : 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const result = deleteProject(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ ok: true });
}

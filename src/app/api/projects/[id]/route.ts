import { NextResponse } from "next/server";
import { deleteProject, getProject, updateProject, type OutputSchema } from "@/lib/projects";

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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const b = body as { name?: unknown; outputSchema?: unknown; personaContext?: unknown; taskDescription?: unknown; inputLabel?: unknown; crossCuttingClues?: unknown };
  const result = updateProject(id, {
    name: typeof b.name === "string" ? b.name : undefined,
    outputSchema: Array.isArray(b.outputSchema) ? (b.outputSchema as OutputSchema) : undefined,
    personaContext: typeof b.personaContext === "string" ? b.personaContext : undefined,
    taskDescription: typeof b.taskDescription === "string" ? b.taskDescription : undefined,
    inputLabel: typeof b.inputLabel === "string" ? b.inputLabel : undefined,
    crossCuttingClues: Array.isArray(b.crossCuttingClues) ? (b.crossCuttingClues as never) : undefined,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
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

import { NextResponse } from "next/server";
import { createProject, listProjects, type OutputSchema } from "@/lib/projects";
import { JSON_LIMITS, readJsonObject } from "@/lib/api-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ projects: listProjects() });
}

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = await readJsonObject(request, JSON_LIMITS.project);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const b = parsed.value;
  if (typeof b.id !== "string" || typeof b.name !== "string" || !Array.isArray(b.outputSchema)) {
    return NextResponse.json(
      { error: "id (string), name (string) and outputSchema (array) are required." },
      { status: 400 },
    );
  }
  const result = createProject({
    id: b.id,
    name: b.name,
    outputSchema: b.outputSchema as OutputSchema,
    personaContext: typeof b.personaContext === "string" ? b.personaContext : undefined,
    taskDescription: typeof b.taskDescription === "string" ? b.taskDescription : undefined,
    inputLabel: typeof b.inputLabel === "string" ? b.inputLabel : undefined,
    crossCuttingClues: Array.isArray(b.crossCuttingClues) ? (b.crossCuttingClues as never) : undefined,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ project: result.project }, { status: 201 });
}

import { NextResponse } from "next/server";
import { createProject, listProjects, type OutputSchema } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ projects: listProjects() });
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const b = body as { id?: unknown; name?: unknown; outputSchema?: unknown; personaContext?: unknown };
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
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ project: result.project }, { status: 201 });
}

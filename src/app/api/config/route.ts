import { NextResponse } from "next/server";
import { getSystemPrompt, setSystemPrompt } from "@/lib/settings";
import { getDefaultProject, taxonomyFromProject, updateProject } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/config — settings UI payload. businessContext now reads the
// seeded project's persona_context.

export async function GET(): Promise<NextResponse> {
  const project = getDefaultProject();
  return NextResponse.json({
    settings: {
      businessContext: project.personaContext,
      systemPrompt: getSystemPrompt(),
    },
    taxonomy: taxonomyFromProject(project),
  });
}

export async function PATCH(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const { businessContext, systemPrompt } = body as {
    businessContext?: unknown;
    systemPrompt?: unknown;
  };
  if (businessContext !== undefined) {
    if (typeof businessContext !== "string") {
      return NextResponse.json({ error: "businessContext must be a string." }, { status: 400 });
    }
    updateProject(getDefaultProject().id, { personaContext: businessContext });
  }
  if (systemPrompt !== undefined) {
    if (typeof systemPrompt !== "string") {
      return NextResponse.json({ error: "systemPrompt must be a string." }, { status: 400 });
    }
    setSystemPrompt(systemPrompt);
  }
  const project = getDefaultProject();
  return NextResponse.json({
    settings: {
      businessContext: project.personaContext,
      systemPrompt: getSystemPrompt(),
    },
  });
}

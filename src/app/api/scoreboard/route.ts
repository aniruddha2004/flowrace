import { computeScoreboard } from "@/lib/scoreboard";
import { getDefaultProject } from "@/lib/projects";

export const runtime = "nodejs";

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("project") ?? getDefaultProject().id;
  return Response.json(computeScoreboard(projectId));
}

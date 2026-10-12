import { prepareEvaluation } from "@/lib/evaluation-input";
import { JSON_LIMITS, readJsonObject } from "@/lib/api-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const parsed = await readJsonObject(request, JSON_LIMITS.evaluation);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.value;
  const prepared = prepareEvaluation(body);
  if ("error" in prepared) return Response.json({ error: prepared.error, issues: "issues" in prepared ? prepared.issues : undefined }, { status: prepared.status });
  return Response.json({ estimate: prepared.estimate, items: prepared.dataset.items.length, flows: prepared.flows.length, repeats: prepared.options.repeats });
}

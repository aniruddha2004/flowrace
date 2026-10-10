import { prepareEvaluation } from "@/lib/evaluation-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return Response.json({ error: "Request body must be JSON." }, { status: 400 }); }
  const prepared = prepareEvaluation(body);
  if ("error" in prepared) return Response.json({ error: prepared.error, issues: "issues" in prepared ? prepared.issues : undefined }, { status: prepared.status });
  return Response.json({ estimate: prepared.estimate, items: prepared.dataset.items.length, flows: prepared.flows.length, repeats: prepared.options.repeats });
}

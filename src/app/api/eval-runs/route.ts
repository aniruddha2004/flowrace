import { prepareEvaluation } from "@/lib/evaluation-input";
import { startEvaluation } from "@/lib/evaluation-runner";
import type { EvaluationResult } from "@/lib/evaluations";
import { getSystemPrompt } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return Response.json({ error: "Request body must be JSON." }, { status: 400 }); }
  const prepared = prepareEvaluation(body);
  if ("error" in prepared) return Response.json({ error: prepared.error, issues: "issues" in prepared ? prepared.issues : undefined }, { status: prepared.status });
  const { project, dataset, flows, options, estimate } = prepared;
  if (estimate.requiresConfirmation && body.confirmCost !== true) return Response.json({ error: "Confirm the estimated cost before starting.", estimate }, { status: 409 });
  const result: EvaluationResult = {
    datasetName: dataset.name, items: structuredClone(dataset.items), schemaSnapshot: structuredClone(project.outputSchema), flowSnapshot: structuredClone(flows),
    options, estimate, completed: 0, total: dataset.items.length * options.repeats * flows.length,
    perFlow: Object.fromEntries(flows.map((flow) => [flow.id, 0])), entries: [],
  };
  const run = startEvaluation(project.id, dataset.id, flows.map((flow) => flow.id), result, { project, systemPrompt: getSystemPrompt() });
  return Response.json({ run }, { status: 202 });
}

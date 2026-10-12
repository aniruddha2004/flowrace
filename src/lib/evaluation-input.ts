import { validateDatasetItems } from "./dataset-format";
import { getDataset } from "./datasets";
import { estimateEvaluation, type EvaluationOptions } from "./evaluations";
import { getFlow, validateFlow, type Flow } from "./flows";
import { listModels } from "./models";
import { getProject } from "./projects";

export function prepareEvaluation(body: Record<string, unknown>) {
  if (typeof body.projectId !== "string") return { error: "Project ID is required.", status: 400 } as const;
  const project = getProject(body.projectId);
  if (!project) return { error: "Project not found.", status: 404 } as const;
  if (typeof body.datasetId !== "string") return { error: "Dataset ID is required.", status: 400 } as const;
  const dataset = getDataset(body.datasetId);
  if (!dataset || dataset.projectId !== project.id) return { error: "Dataset not found in this project.", status: 404 } as const;
  const issues = validateDatasetItems(dataset.items, project.outputSchema);
  if (issues.length) return { error: "Dataset needs corrections before evaluation.", issues, status: 400 } as const;
  if (!Array.isArray(body.flowIds) || body.flowIds.length < 2 || body.flowIds.length > 8 || body.flowIds.some((id) => typeof id !== "string") || new Set(body.flowIds).size !== body.flowIds.length) return { error: "Select 2–8 distinct flows.", status: 400 } as const;
  const flows = body.flowIds.map((id) => getFlow(id as string));
  if (flows.some((flow) => !flow || flow.projectId !== project.id)) return { error: "All selected flows must belong to this project.", status: 400 } as const;
  const selected = flows as Flow[];
  const models = listModels();
  for (const flow of selected) {
    const errors = validateFlow(flow.steps, project.outputSchema, models);
    if (errors.length) return { error: `Flow "${flow.name}" must be fixed: ${errors.join(" ")}`, status: 400 } as const;
  }
  const repeats = body.repeats ?? 1, concurrency = body.concurrency ?? 3;
  if (!Number.isInteger(repeats) || Number(repeats) < 1 || Number(repeats) > 5) return { error: "Repeats must be an integer from 1 to 5.", status: 400 } as const;
  if (!Number.isInteger(concurrency) || Number(concurrency) < 1 || Number(concurrency) > 5) return { error: "Concurrency must be an integer from 1 to 5.", status: 400 } as const;
  const options: EvaluationOptions = { repeats: Number(repeats), concurrency: Number(concurrency) };
  let estimate;
  try { estimate = estimateEvaluation(project, selected, models, dataset.items, options.repeats); }
  catch (error) { return { error: error instanceof Error ? error.message : "Invalid evaluation configuration.", status: 503 } as const; }
  if (estimate.calls > 3000) return { error: "This run exceeds 3,000 estimated model calls. Reduce flows, repeats, or dataset size.", status: 400 } as const;
  return { project, dataset, flows: selected, options, estimate } as const;
}

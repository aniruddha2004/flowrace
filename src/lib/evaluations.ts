import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import type { DatasetItem } from "./dataset-format";
import type { Flow } from "./flows";
import type { FlowResult } from "./flow-runner";
import { modelCost, type ModelRow } from "./models";
import type { OutputSchema, Project } from "./projects";
import { nonnegativeEnvNumber } from "./server-config";

export type EvaluationStatus = "queued" | "running" | "cancel_requested" | "cancelled" | "completed" | "failed";
export interface EvaluationOptions { repeats: number; concurrency: number }
export interface EvaluationEstimate { calls: number; costUsd: number; thresholdUsd: number; requiresConfirmation: boolean }
export interface EvaluationEntry { itemId: string; repeat: number; flowId: string; result: FlowResult }
export interface EvaluationResult {
  datasetName: string;
  items: DatasetItem[];
  schemaSnapshot: OutputSchema;
  flowSnapshot: Flow[];
  options: EvaluationOptions;
  estimate: EvaluationEstimate;
  completed: number;
  total: number;
  perFlow: Record<string, number>;
  entries: EvaluationEntry[];
}
export interface EvaluationRun {
  id: string;
  projectId: string;
  datasetId: string;
  flowIds: string[];
  status: EvaluationStatus;
  result: EvaluationResult;
  createdAt: string;
}

function toRun(row: { id: string; project_id: string; dataset_id: string; flow_ids_json: string; status: EvaluationStatus; result_json: string; created_at: string }): EvaluationRun {
  return { id: row.id, projectId: row.project_id, datasetId: row.dataset_id, flowIds: JSON.parse(row.flow_ids_json) as string[], status: row.status, result: JSON.parse(row.result_json) as EvaluationResult, createdAt: row.created_at };
}

export function getEvaluation(id: string): EvaluationRun | null {
  const row = getDb().prepare("SELECT * FROM eval_runs WHERE id = ?").get(id) as Parameters<typeof toRun>[0] | undefined;
  return row ? toRun(row) : null;
}
export function listEvaluations(projectId: string): EvaluationRun[] {
  return (getDb().prepare("SELECT * FROM eval_runs WHERE project_id = ? ORDER BY created_at DESC, id DESC LIMIT 100").all(projectId) as Parameters<typeof toRun>[0][]).map(toRun);
}
export function createEvaluation(projectId: string, datasetId: string, flowIds: string[], result: EvaluationResult): EvaluationRun {
  const id = randomUUID();
  getDb().prepare("INSERT INTO eval_runs (id, project_id, dataset_id, flow_ids_json, status, result_json) VALUES (?, ?, ?, ?, 'queued', ?)")
    .run(id, projectId, datasetId, JSON.stringify(flowIds), JSON.stringify(result));
  return getEvaluation(id)!;
}
export function setEvaluationStatus(id: string, status: EvaluationStatus): void {
  getDb().prepare("UPDATE eval_runs SET status = ? WHERE id = ?").run(status, id);
}
export function saveEvaluationProgress(id: string, result: EvaluationResult): void {
  getDb().prepare("UPDATE eval_runs SET result_json = ? WHERE id = ?").run(JSON.stringify(result), id);
}
export function deleteEvaluation(id: string): boolean {
  return getDb().prepare("DELETE FROM eval_runs WHERE id = ?").run(id).changes > 0;
}

export function estimateEvaluation(project: Project, flows: Flow[], models: ModelRow[], items: DatasetItem[], repeats: number): EvaluationEstimate {
  let calls = 0, costUsd = 0;
  for (const item of items) for (const flow of flows) for (const step of flow.steps) {
    const model = models.find((candidate) => candidate.id === step.modelId);
    if (!model) continue;
    const contextSize = project.personaContext.length + (step.promptOverride?.length ?? 0) + 500;
    const inputTokens = Math.ceil((item.input.length + contextSize + (step.seesPriorStepOutput ? 800 : 0)) / 4);
    const outputTokens = step.role === "decide" ? 150 + step.ownsFields.length * 60 : 512 * Math.max(1, step.ownsFields.length);
    const count = Math.max(1, step.role === "generate" ? step.ownsFields.length : 1);
    calls += repeats * count;
    costUsd += repeats * count * modelCost(model, inputTokens, outputTokens);
  }
  const thresholdUsd = nonnegativeEnvNumber("EVAL_CONFIRM_THRESHOLD_USD", 2, 100_000);
  return { calls, costUsd, thresholdUsd, requiresConfirmation: costUsd > thresholdUsd };
}

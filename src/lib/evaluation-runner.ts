import { createEvaluation, getEvaluation, saveEvaluationProgress, setEvaluationStatus, type EvaluationEntry, type EvaluationResult, type EvaluationRun } from "./evaluations";
import { runFlowDefinition, type FlowResult } from "./flow-runner";
import type { FlowSettings } from "./flows/llmTriage";
import { SCHEMA_VERSION } from "./schema";

function failed(error: unknown): FlowResult {
  return { analysis: { schemaVersion: SCHEMA_VERSION, values: {}, freeText: {} }, freeText: {}, steps: [], error: error instanceof Error ? error.message : String(error) };
}

/** An in-process bounded queue. Progress and cancellation flags are persisted
 * in SQLite, so subscribers can reconnect and see partial results. */
export async function executeEvaluation(id: string, settings: FlowSettings): Promise<void> {
  const run = getEvaluation(id);
  if (!run) return;
  const result = run.result;
  const tasks = result.items.flatMap((item) => Array.from({ length: result.options.repeats }, (_, repeat) => ({ item, repeat })));
  let next = 0;
  if (getEvaluation(id)?.status === "cancel_requested") { setEvaluationStatus(id, "cancelled"); return; }
  setEvaluationStatus(id, "running");
  const work = async () => {
    while (next < tasks.length) {
      if (getEvaluation(id)?.status === "cancel_requested") break;
      const task = tasks[next++];
      await Promise.all(result.flowSnapshot.map(async (flow) => {
        let output: FlowResult;
        try { output = await runFlowDefinition(flow, task.item.input, settings, () => {}); }
        catch (error) { output = failed(error); }
        const entry: EvaluationEntry = { itemId: task.item.id, repeat: task.repeat, flowId: flow.id, result: output };
        result.entries.push(entry);
        result.completed++;
        result.perFlow[flow.id] = (result.perFlow[flow.id] ?? 0) + 1;
        saveEvaluationProgress(id, result);
      }));
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(result.options.concurrency, tasks.length) }, () => work()));
    setEvaluationStatus(id, getEvaluation(id)?.status === "cancel_requested" ? "cancelled" : "completed");
  } catch {
    setEvaluationStatus(id, "failed");
  }
}

export function startEvaluation(projectId: string, datasetId: string, flowIds: string[], result: EvaluationResult, settings: FlowSettings): EvaluationRun {
  const run = createEvaluation(projectId, datasetId, flowIds, result);
  void executeEvaluation(run.id, settings);
  return run;
}

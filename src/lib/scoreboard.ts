import { agreementRatio, bestIds } from "./compare";
import { getDb } from "./db";
import { listFlows } from "./flows";
import { getProject } from "./projects";
import { normalizeAnalysis } from "./schema";

export interface MetricTally { byFlow: Record<string, number>; tie: number }
export interface ScoreboardPayload {
  projectId: string;
  runs: number;
  flowNames: Record<string, string>;
  latency: MetricTally;
  cost: MetricTally;
  parseErrors: MetricTally;
  agreementSum: number;
  agreementCount: number;
}

interface StoredFlow { analysis?: unknown; totalMs?: number; totals?: { costUsd?: number; parseErrors?: number } }

function tally(metric: MetricTally, values: Array<[string, number]>): void {
  const winners = bestIds(values);
  if (winners.length === 1) metric.byFlow[winners[0]] = (metric.byFlow[winners[0]] ?? 0) + 1;
  else metric.tie += 1;
}

export function computeScoreboard(projectId: string): ScoreboardPayload {
  const result: ScoreboardPayload = {
    projectId, runs: 0,
    flowNames: Object.fromEntries(listFlows(projectId).map((flow) => [flow.id, flow.name])),
    latency: { byFlow: {}, tie: 0 }, cost: { byFlow: {}, tie: 0 }, parseErrors: { byFlow: {}, tie: 0 },
    agreementSum: 0, agreementCount: 0,
  };
  const schema = getProject(projectId)?.outputSchema ?? [];
  const rows = getDb().prepare("SELECT result FROM sessions WHERE type = 'single' AND project_id = ?").all(projectId) as { result: string }[];
  for (const row of rows) {
    let saved: { flowIds?: string[]; flowSnapshot?: Array<{ id: string; name: string }>; flows?: Record<string, StoredFlow> };
    try { saved = JSON.parse(row.result); } catch { continue; }
    const ids = saved.flowIds ?? (saved.flows?.A && saved.flows?.B ? ["A", "B"] : []);
    const complete = ids.filter((id) => {
      const f = saved.flows?.[id];
      return typeof f?.totalMs === "number" && typeof f.totals?.costUsd === "number";
    });
    if (complete.length < 2) continue;
    for (const flow of saved.flowSnapshot ?? []) result.flowNames[flow.id] ??= flow.name;
    if (complete.includes("A")) result.flowNames.A ??= "LLM only";
    if (complete.includes("B")) result.flowNames.B ??= "Jev hybrid";
    result.runs++;
    tally(result.latency, complete.map((id) => [id, saved.flows![id].totalMs!]));
    tally(result.cost, complete.map((id) => [id, saved.flows![id].totals!.costUsd!]));
    tally(result.parseErrors, complete.map((id) => [id, saved.flows![id].totals!.parseErrors ?? 0]));
    const analyzed = complete.filter((id) => saved.flows?.[id].analysis);
    for (let a = 0; a < analyzed.length; a++) for (let b = a + 1; b < analyzed.length; b++) {
      result.agreementSum += agreementRatio(schema, normalizeAnalysis(saved.flows![analyzed[a]].analysis), normalizeAnalysis(saved.flows![analyzed[b]].analysis));
      result.agreementCount++;
    }
  }
  return result;
}

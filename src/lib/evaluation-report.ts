import { bestIds, compareFields, valuesAgree } from "./compare";
import { csvCell, type DatasetItem } from "./dataset-format";
import type { EvaluationEntry, EvaluationRun } from "./evaluations";
import type { OutputField } from "./projects";

export interface FieldScore { key: string; label: string; type: OutputField["type"]; total: number; correct: number; accuracy: number | null; mae: number | null; withinTolerance: number | null }
export interface CalibrationBucket { label: string; total: number; meanConfidence: number | null; accuracy: number | null }
export interface SignalSummary { contested: number; clean: number; labeledContested: number; labeledClean: number; contestedAccuracy: number | null; cleanAccuracy: number | null }
export interface FlowEvaluation {
  id: string; name: string; fields: FieldScore[]; overall: { correct: number; total: number; accuracy: number | null };
  latencyP50: number | null; latencyP95: number | null; totalCost: number; meanCost: number | null;
  parseErrors: number; schemaErrors: number; failed: number; completed: number;
  calibration: CalibrationBucket[]; signals: SignalSummary | null; consistency: number | null; consistencyItems: number;
}
export interface EvaluationReport { flows: FlowEvaluation[]; best: Record<string, string[]>; fieldWinners: Array<{ label: string; winners: string[]; score: number | null }> }

function percentile(values: number[], ratio: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * ratio) - 1];
}

function firstEntry(entries: EvaluationEntry[], itemId: string, flowId: string): EvaluationEntry | undefined {
  return entries.find((entry) => entry.itemId === itemId && entry.flowId === flowId && entry.repeat === 0);
}

export function itemHasDisagreement(run: EvaluationRun, item: DatasetItem, tolerance: number): boolean {
  const fields = compareFields(run.result.schemaSnapshot);
  const attempts = run.flowIds.map((id) => firstEntry(run.result.entries, item.id, id)).filter((entry): entry is EvaluationEntry => Boolean(entry));
  if (attempts.some((entry) => Boolean(entry.result.error)) && attempts.some((entry) => !entry.result.error)) return true;
  const rows = run.flowIds.map((id) => firstEntry(run.result.entries, item.id, id)).filter((entry): entry is EvaluationEntry => Boolean(entry && !entry.result.error));
  return fields.some((field) => rows.some((row, index) => rows.slice(index + 1).some((other) => !valuesAgree(field, row.result.analysis.values[field.key]?.value, other.result.analysis.values[field.key]?.value, tolerance))));
}

export function itemHasWrongAnswer(run: EvaluationRun, item: DatasetItem, tolerance: number): boolean {
  if (!item.expected || !Object.keys(item.expected).length) return false;
  return run.result.entries.some((entry) => entry.itemId === item.id && (Boolean(entry.result.error) || compareFields(run.result.schemaSnapshot).some((field) => Object.hasOwn(item.expected!, field.key) && !valuesAgree(field, entry.result.analysis.values[field.key]?.value, item.expected![field.key], tolerance))));
}

export function computeEvaluationReport(run: EvaluationRun, tolerance = 0.2): EvaluationReport {
  const fields = compareFields(run.result.schemaSnapshot);
  const byItem = new Map(run.result.items.map((item) => [item.id, item]));
  const flows = run.result.flowSnapshot.map((flow): FlowEvaluation => {
    const entries = run.result.entries.filter((entry) => entry.flowId === flow.id);
    const complete = entries.filter((entry) => !entry.result.error && typeof entry.result.totalMs === "number");
    const fieldScores = fields.map((field): FieldScore => {
      let total = 0, correct = 0, distance = 0, measured = 0;
      for (const entry of entries) {
        const expected = byItem.get(entry.itemId)?.expected;
        if (!expected || !Object.hasOwn(expected, field.key)) continue;
        total++;
        const actual = entry.result.analysis.values[field.key]?.value;
        if (valuesAgree(field, actual, expected[field.key], tolerance)) correct++;
        if (field.type === "float_range" && typeof actual === "number" && Number.isFinite(actual)) { distance += Math.abs(actual - Number(expected[field.key])); measured++; }
      }
      return { key: field.key, label: field.label, type: field.type, total, correct,
        accuracy: total && field.type !== "float_range" ? correct / total : null,
        mae: measured && field.type === "float_range" ? distance / measured : null,
        withinTolerance: total && field.type === "float_range" ? correct / total : null };
    });
    const buckets = Array.from({ length: 5 }, (_, index) => ({ label: `${index * 20}–${(index + 1) * 20}%`, count: 0, conf: 0, correct: 0 }));
    let contested = 0, clean = 0, labeledContested = 0, labeledClean = 0, contestedCorrect = 0, cleanCorrect = 0, signalSeen = false;
    for (const entry of entries) {
      const expected = byItem.get(entry.itemId)?.expected;
      if (entry.result.analysis.signals || entry.result.analysis.signalMismatch) signalSeen = true;
      for (const field of fields) {
        const actual = entry.result.analysis.values[field.key];
        const hasSignals = Boolean(entry.result.analysis.signals || entry.result.analysis.signalMismatch);
        const isContested = Boolean(entry.result.analysis.signalMismatch?.[field.key]);
        if (hasSignals && actual) { if (isContested) contested++; else clean++; }
        if (!expected || !Object.hasOwn(expected, field.key)) continue;
        const correct = valuesAgree(field, actual?.value, expected[field.key], tolerance);
        const confidence = actual?.confidence;
        if (typeof confidence === "number" && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1) {
          const bucket = buckets[Math.min(4, Math.floor(confidence * 5))];
          bucket.count++; bucket.conf += confidence; if (correct) bucket.correct++;
        }
        if (hasSignals) {
          if (isContested) { labeledContested++; if (correct) contestedCorrect++; }
          else { labeledClean++; if (correct) cleanCorrect++; }
        }
      }
    }
    let consistencyItems = 0, changedItems = 0;
    if (run.result.options.repeats > 1) for (const item of run.result.items) {
      const repeats = entries.filter((entry) => entry.itemId === item.id && !entry.result.error);
      if (repeats.length < 2) continue;
      consistencyItems++;
      if (fields.some((field) => repeats.slice(1).some((entry) => !valuesAgree(field, repeats[0].result.analysis.values[field.key]?.value, entry.result.analysis.values[field.key]?.value, tolerance)))) changedItems++;
    }
    const total = fieldScores.reduce((sum, field) => sum + field.total, 0);
    const correct = fieldScores.reduce((sum, field) => sum + field.correct, 0);
    const totalCost = entries.reduce((sum, entry) => sum + (entry.result.totals?.costUsd ?? entry.result.steps.reduce((stepSum, step) => stepSum + step.metrics.costUsd, 0)), 0);
    return {
      id: flow.id, name: flow.name, fields: fieldScores, overall: { correct, total, accuracy: total ? correct / total : null },
      latencyP50: percentile(complete.map((entry) => entry.result.totalMs!), 0.5), latencyP95: percentile(complete.map((entry) => entry.result.totalMs!), 0.95),
      totalCost, meanCost: entries.length ? totalCost / entries.length : null,
      parseErrors: entries.reduce((sum, entry) => sum + (entry.result.totals?.parseErrors ?? entry.result.steps.reduce((stepSum, step) => stepSum + step.metrics.parseErrors, 0)), 0),
      schemaErrors: entries.reduce((sum, entry) => sum + (entry.result.error ? 0 : fields.filter((field) => {
        const value = entry.result.analysis.values[field.key]?.value;
        return value === undefined || (field.type === "enum" && !field.options?.some((option) => option.key === value)) || (field.type === "boolean" && typeof value !== "boolean") || (field.type === "float_range" && (typeof value !== "number" || value < (field.range?.min ?? 0) || value > (field.range?.max ?? 1)));
      }).length), 0),
      failed: entries.filter((entry) => entry.result.error).length, completed: entries.length,
      calibration: buckets.map((bucket) => ({ label: bucket.label, total: bucket.count, meanConfidence: bucket.count ? bucket.conf / bucket.count : null, accuracy: bucket.count ? bucket.correct / bucket.count : null })),
      signals: signalSeen ? { contested, clean, labeledContested, labeledClean, contestedAccuracy: labeledContested ? contestedCorrect / labeledContested : null, cleanAccuracy: labeledClean ? cleanCorrect / labeledClean : null } : null,
      consistency: consistencyItems ? changedItems / consistencyItems : null, consistencyItems,
    };
  });
  const best: EvaluationReport["best"] = {};
  const expectedCount = run.result.items.length * run.result.options.repeats;
  const eligible = (key: keyof FlowEvaluation, direction: "min" | "max") => bestIds(flows.filter((flow) => flow.completed === expectedCount && !flow.failed && typeof flow[key] === "number").map((flow) => [flow.id, flow[key] as number]), direction);
  best.accuracy = bestIds(flows.filter((flow) => flow.completed === expectedCount && flow.overall.accuracy !== null).map((flow) => [flow.id, flow.overall.accuracy!]), "max");
  best.latencyP50 = eligible("latencyP50", "min"); best.latencyP95 = eligible("latencyP95", "min");
  best.totalCost = eligible("totalCost", "min");
  best.parseErrors = bestIds(flows.filter((flow) => flow.completed === expectedCount).map((flow) => [flow.id, flow.parseErrors + flow.schemaErrors]));
  best.meanCost = eligible("meanCost", "min"); best.consistency = eligible("consistency", "min");
  const fieldWinners = fields.map((field) => {
    const scores = flows.map((flow) => ({ id: flow.id, value: flow.fields.find((score) => score.key === field.key) }));
    const metric = field.type === "float_range" ? "mae" : "accuracy";
    const values = scores.filter((row) => row.value && row.value[metric] !== null).map((row) => [row.id, row.value![metric]!] as [string, number]);
    const winners = bestIds(values, field.type === "float_range" ? "min" : "max");
    return { label: field.label, winners, score: values.find(([id]) => id === winners[0])?.[1] ?? null };
  });
  return { flows, best, fieldWinners };
}

export function evaluationCsv(run: EvaluationRun, tolerance = 0.2): string {
  const fields = compareFields(run.result.schemaSnapshot);
  const header = ["item_id", "repeat", "flow_id", "flow_name", "input", "ground_truth", "error", "latency_ms", "cost_usd", ...fields.flatMap((field) => [`expected.${field.key}`, `actual.${field.key}`, `hit.${field.key}`])];
  const rows = run.result.entries.map((entry) => {
    const item = run.result.items.find((candidate) => candidate.id === entry.itemId)!;
    const values: unknown[] = [entry.itemId, entry.repeat + 1, entry.flowId, run.result.flowSnapshot.find((flow) => flow.id === entry.flowId)?.name ?? entry.flowId, item.input,
      item.expected && Object.keys(item.expected).length ? "yes" : "no", entry.result.error ?? "", entry.result.totalMs ?? "", entry.result.totals?.costUsd ?? "",
      ...fields.flatMap((field) => [item.expected?.[field.key] ?? "", entry.result.analysis.values[field.key]?.value ?? "", Object.hasOwn(item.expected ?? {}, field.key) ? valuesAgree(field, entry.result.analysis.values[field.key]?.value, item.expected![field.key], tolerance) : ""])];
    return values.map((value) => csvCell(String(value))).join(",");
  });
  return [header.join(","), ...rows].join("\r\n");
}

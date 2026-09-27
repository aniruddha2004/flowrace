"use client";

import { COMPARE_FIELDS, costWinner, fieldsAgree, latencyWinner } from "@/lib/compare";
import { fmtCost, fmtMs } from "@/lib/format";
import type { FlowState } from "@/lib/race-state";
import { FIELD_LABELS } from "@/lib/schema";

interface ComparisonStripProps {
  flowA: FlowState;
  flowB: FlowState;
}

interface RowData {
  label: string;
  dot: string;
  latency: string;
  latencyWin: boolean;
  cost: string;
  costWin: boolean;
  fields: { field: (typeof COMPARE_FIELDS)[number]; value: string; agree: boolean }[];
}

function computeComparison(filteredFlowA: FlowState, flowB: FlowState): RowData[] | null {
  if (!filteredFlowA.totals || !flowB.totals || !filteredFlowA.analysis || !flowB.analysis) {
    return null;
  }
  return ([filteredFlowA as FlowState, flowB] as const).map((f, i) => {
    const latW = latencyWinner(filteredFlowA.totalMs ?? 0, flowB.totalMs ?? 0);
    const costW = costWinner(filteredFlowA.totals!.costUsd, flowB.totals!.costUsd);
    const other = i === 0 ? flowB.analysis! : filteredFlowA.analysis!;
    return {
      label: `Flow ${i === 0 ? "A" : "B"}`,
      dot: i === 0 ? "bg-accent-a" : "bg-accent-b",
      latency: fmtMs(f.totalMs ?? 0),
      latencyWin: (i === 0) === (latW === "A") && latW !== "tie",
      cost: fmtCost(f.totals!.costUsd),
      costWin: (i === 0) === (costW === "A") && costW !== "tie",
      fields: COMPARE_FIELDS.map((field) => ({
        field,
        value:
          field === "sentiment"
            ? f.analysis!.sentiment.toFixed(2)
            : String(f.analysis![field as "category"]),
        agree: fieldsAgree(f.analysis!, other, field),
      })),
    };
  });
}

function WinnerChip() {
  return (
    <span className="ml-1.5 inline-flex items-center gap-0.5 font-mono text-[10px] font-semibold uppercase text-emerald-600 dark:text-emerald-300">
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20 6L9 17l-5-5" />
      </svg>
      winner
    </span>
  );
}

export function ComparisonStrip({ flowA, flowB }: ComparisonStripProps) {
  const rows = computeComparison(flowA, flowB);
  if (!rows) return null;

  const tie = latencyWinner(flowA.totalMs ?? 0, flowB.totalMs ?? 0) === "tie"
    && costWinner(flowA.totals!.costUsd, flowB.totals!.costUsd) === "tie";
  const metricCols = 2 + COMPARE_FIELDS.length;

  return (
    <div className="animate-rise">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-muted">At a glance</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[540px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-line font-mono text-[10px] uppercase tracking-wide text-muted">
              <th className="pb-2 pr-4 font-medium" />
              {["Latency", "Cost", ...COMPARE_FIELDS.map((f) => FIELD_LABELS[f])].map((h) => (
                <th key={h} className="whitespace-nowrap pb-2 pr-4 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-line/60 last:border-b-0 align-top">
                <th className="py-2 pr-4 text-left font-mono text-xs font-medium text-ink-soft whitespace-nowrap">
                  <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${r.dot}`} aria-hidden />
                  {r.label}
                </th>
                <td className="py-2 pr-4 font-mono text-xs tabular-nums text-ink">
                  {r.latency}{r.latencyWin && <WinnerChip />}
                </td>
                <td className="py-2 pr-4 font-mono text-xs tabular-nums text-ink">
                  {r.cost}{r.costWin && <WinnerChip />}
                </td>
                {r.fields.map(({ field, value, agree }) => (
                  <td key={field} className="py-2 pr-4 text-xs">
                    <span
                      className={`inline-flex max-w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 font-mono text-[11px] ${
                        agree
                          ? "bg-emerald-100/70 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                          : "bg-rose-100/70 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300"
                      }`}
                      title={`${FIELD_LABELS[field]}: ${agree ? "flows agree" : "flows differ"} — ${value}`}
                    >
                      {value}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!(tie && rows.every((r) => r.fields.every((f) => f.agree))) && (
        <p className="mt-2 text-xs text-muted">
          {tie ? "Latency and cost tied" : `Flow ${latencyWinner(flowA.totalMs ?? 0, flowB.totalMs ?? 0) === "A" ? "A" : "B"} fastest · Flow ${costWinner(flowA.totals!.costUsd, flowB.totals!.costUsd) === "A" ? "A" : "B"} cheapest`}{" "}
          · {rows[0].fields.filter((f) => f.agree).length}/{metricCols - 2} fields agree.
        </p>
      )}
    </div>
  );
}

"use client";

import {
  COMPARE_FIELDS, costTied, costWinner, fieldsAgree, latencyTied, latencyWinner, threeWayWinner,
  type ThreeWayWinner,
} from "@/lib/compare";
import { fmtCost, fmtMs } from "@/lib/format";
import type { FlowState } from "@/lib/race-state";
import { FIELD_LABELS } from "@/lib/schema";

interface ComparisonStripProps {
  flowA: FlowState;
  flowB: FlowState;
  flowC?: FlowState;
}

type FlowKey = "A" | "B" | "C";

interface RowData {
  label: string;
  dot: string;
  latency: string;
  latencyWin: boolean;
  cost: string;
  costWin: boolean;
  fields: { field: (typeof COMPARE_FIELDS)[number]; value: string; agree: boolean }[];
}

function computeComparison({ flowA, flowB, flowC }: ComparisonStripProps):
  { rows: RowData[]; latencyWin: ThreeWayWinner; costWin: ThreeWayWinner } | null {
  if (!flowA.totals || !flowB.totals || !flowA.analysis || !flowB.analysis) return null;
  const flows: { key: FlowKey; state: FlowState; dot: string }[] = [
    { key: "A", state: flowA, dot: "bg-accent-a" },
    { key: "B", state: flowB, dot: "bg-accent-b" },
  ];
  if (flowC?.totals && flowC.analysis) flows.push({ key: "C", state: flowC, dot: "bg-accent-c" });

  const latencyWin: ThreeWayWinner = flows.length === 3
    ? threeWayWinner({ A: flowA.totalMs ?? 0, B: flowB.totalMs ?? 0, C: flowC!.totalMs ?? 0 }, latencyTied)
    : latencyWinner(flowA.totalMs ?? 0, flowB.totalMs ?? 0);
  const costWin: ThreeWayWinner = flows.length === 3
    ? threeWayWinner({ A: flowA.totals.costUsd, B: flowB.totals.costUsd, C: flowC!.totals!.costUsd }, costTied)
    : costWinner(flowA.totals.costUsd, flowB.totals.costUsd);

  const agreed = (field: (typeof COMPARE_FIELDS)[number]): boolean =>
    flows.every((a, i) => flows.slice(i + 1).every((b) => fieldsAgree(a.state.analysis!, b.state.analysis!, field)));

  return {
    latencyWin,
    costWin,
    rows: flows.map(({ key, state, dot }) => ({
      label: `Flow ${key}`,
      dot,
      latency: fmtMs(state.totalMs ?? 0),
      latencyWin: latencyWin === key,
      cost: fmtCost(state.totals!.costUsd),
      costWin: costWin === key,
      fields: COMPARE_FIELDS.map((field) => ({
        field,
        value: field === "sentiment" ? state.analysis!.sentiment.toFixed(2) : String(state.analysis![field]),
        agree: agreed(field),
      })),
    })),
  };
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

export function ComparisonStrip(props: ComparisonStripProps) {
  const comparison = computeComparison(props);
  if (!comparison) return null;
  const { rows, latencyWin, costWin } = comparison;

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
      <p className="mt-2 text-xs text-muted">
        {latencyWin === "tie" ? "Latency tied" : `Flow ${latencyWin} fastest`} ·{" "}
        {costWin === "tie" ? "Cost tied" : `Flow ${costWin} cheapest`} ·{" "}
        {rows[0].fields.filter((f) => f.agree).length}/{COMPARE_FIELDS.length} fields agree.
      </p>
    </div>
  );
}

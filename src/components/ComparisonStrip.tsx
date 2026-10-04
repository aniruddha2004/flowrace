"use client";

import { fmtCost, fmtMs } from "@/lib/format";
import type { Flow } from "@/lib/flows";
import type { OutputField } from "@/lib/projects";
import type { FlowState } from "@/lib/race-state";
import { formatValue } from "./FieldRow";

const GROUP_COLORS = [
  "bg-emerald-100/70 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  "bg-amber-100/70 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  "bg-sky-100/70 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  "bg-violet-100/70 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  "bg-rose-100/70 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
];

export function ComparisonStrip({ flows, fields }: { flows: Array<{ flow: Flow; state: FlowState }>; fields: OutputField[] }) {
  if (flows.length < 2 || flows.some(({ state }) => !state.totals || !state.analysis)) return null;
  const fastest = Math.min(...flows.map(({ state }) => state.totalMs ?? Infinity));
  const cheapest = Math.min(...flows.map(({ state }) => state.totals!.costUsd));
  const groups = Object.fromEntries(fields.map((field) => {
    const values = [...new Set(flows.map(({ state }) => formatValue(field, state.analysis!.values[field.key]?.value)))];
    return [field.key, values];
  })) as Record<string, string[]>;

  return <div className="animate-rise">
    <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-muted">At a glance · matching colors indicate the same value</p>
    <div className="overflow-x-auto"><table className="w-full min-w-[540px] border-collapse text-left text-sm">
      <thead><tr className="border-b border-line font-mono text-[10px] uppercase tracking-wide text-muted">
        <th className="pb-2 pr-4 font-medium">Flow</th>
        { ["Latency", "Cost", ...fields.map((field) => field.label)].map((label) => <th key={label} className="whitespace-nowrap pb-2 pr-4 font-medium">{label}</th>) }
      </tr></thead>
      <tbody>{flows.map(({ flow, state }) => <tr key={flow.id} className="border-b border-line/60 last:border-b-0 align-top">
        <th className="whitespace-nowrap py-2 pr-4 text-left font-mono text-xs font-medium text-ink-soft">{flow.name}</th>
        <td className="py-2 pr-4 font-mono text-xs tabular-nums text-ink">{fmtMs(state.totalMs ?? 0)}{state.totalMs === fastest && <span className="ml-1 text-emerald-600">★ fastest</span>}</td>
        <td className="py-2 pr-4 font-mono text-xs tabular-nums text-ink">{fmtCost(state.totals!.costUsd)}{state.totals!.costUsd === cheapest && <span className="ml-1 text-emerald-600">★ cheapest</span>}</td>
        {fields.map((field) => {
          const value = formatValue(field, state.analysis!.values[field.key]?.value);
          const group = groups[field.key].indexOf(value);
          return <td key={field.key} className="py-2 pr-4 text-xs"><span className={`inline-flex max-w-full items-center truncate rounded-md px-1.5 py-0.5 font-mono text-[11px] ${GROUP_COLORS[group % GROUP_COLORS.length]}`} title={`${field.label}: ${value} · group ${group + 1}`}>{value}</span></td>;
        })}
      </tr>)}</tbody>
    </table></div>
  </div>;
}

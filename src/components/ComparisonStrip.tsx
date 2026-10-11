"use client";

import { fmtCost, fmtMs } from "@/lib/format";
import type { Flow } from "@/lib/flows";
import type { OutputField } from "@/lib/projects";
import type { FlowState } from "@/lib/race-state";
import { bestIds } from "@/lib/compare";
import { formatValue } from "./FieldRow";

const GROUP_COLORS = [
  "bg-decide-soft text-decide",
  "bg-generate-soft text-generate",
  "bg-sky-100/70 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  "bg-violet-100/70 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  "bg-bad-soft text-bad",
];

export function ComparisonStrip({ flows, fields }: { flows: Array<{ flow: Flow; state: FlowState }>; fields: OutputField[] }) {
  if (flows.length < 2 || flows.some(({ state }) => !state.totals || !state.analysis)) return null;
  const fastest = bestIds(flows.map(({ flow, state }) => [flow.id, state.totalMs ?? Infinity]));
  const cheapest = bestIds(flows.map(({ flow, state }) => [flow.id, state.totals!.costUsd]));
  const groups = Object.fromEntries(fields.map((field) => {
    const values = [...new Set(flows.map(({ state }) => formatValue(field, state.analysis!.values[field.key]?.value)))];
    return [field.key, values];
  })) as Record<string, string[]>;

  return <section className="ui-surface animate-rise overflow-hidden">
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-4"><h2 className="font-display text-base font-semibold text-ink">Side-by-side comparison</h2><p className="text-xs text-ink-soft">Matching colors mean matching values · Best latency and cost are marked</p></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[660px] border-collapse text-left text-sm">
      <thead><tr className="border-b border-line bg-track/40 text-xs text-ink-soft">
        <th className="whitespace-nowrap px-5 py-3 font-medium">Flow</th>
        { ["Latency", "Cost", ...fields.map((field) => field.label)].map((label) => <th key={label} className="whitespace-nowrap px-4 py-3 font-medium">{label}</th>) }
      </tr></thead>
      <tbody>{flows.map(({ flow, state }) => <tr key={flow.id} className="border-b border-line/60 align-top last:border-b-0 hover:bg-track/20">
        <th className="whitespace-nowrap px-5 py-4 text-left text-xs font-semibold text-ink">{flow.name}</th>
        <td className="px-4 py-4 font-mono text-xs tabular-nums text-ink">{fmtMs(state.totalMs ?? 0)}{fastest.includes(flow.id) && <span className="ml-2 inline-flex rounded bg-good-soft px-1.5 py-0.5 font-sans text-[10px] font-semibold text-good">Fastest</span>}</td>
        <td className="px-4 py-4 font-mono text-xs tabular-nums text-ink">{fmtCost(state.totals!.costUsd)}{cheapest.includes(flow.id) && <span className="ml-2 inline-flex rounded bg-good-soft px-1.5 py-0.5 font-sans text-[10px] font-semibold text-good">Lowest cost</span>}</td>
        {fields.map((field) => {
          const value = formatValue(field, state.analysis!.values[field.key]?.value);
          const group = groups[field.key].indexOf(value);
          return <td key={field.key} className="px-4 py-4 text-xs"><span className={`inline-flex max-w-full items-center truncate rounded-[5px] px-2 py-1 font-mono text-[11px] ${GROUP_COLORS[group % GROUP_COLORS.length]}`} title={`${field.label}: ${value} · group ${group + 1}`}>{value}</span></td>;
        })}
      </tr>)}</tbody>
    </table></div>
  </section>;
}

"use client";

import { COMPARE_FIELDS, costWinner, fieldsAgree, latencyWinner, type Winner } from "@/lib/compare";
import { fmtCost, fmtMs } from "@/lib/format";
import type { FlowState } from "@/lib/race-state";
import { FIELD_LABELS } from "@/lib/schema";

interface ComparisonStripProps {
  flowA: FlowState;
  flowB: FlowState;
}

function WinnerMark({ winner }: { winner: Winner }) {
  if (winner === "tie") {
    return (
      <span className="rounded-md bg-track px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-ink-soft">
        tie
      </span>
    );
  }
  const isA = winner === "A";
  return (
    <span
      className={`animate-pop rounded-md px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${
        isA ? "bg-accent-a-soft text-accent-a" : "bg-accent-b-soft text-accent-b"
      }`}
    >
      Flow {winner} wins
    </span>
  );
}

export function ComparisonStrip({ flowA, flowB }: ComparisonStripProps) {
  if (!flowA.totals || !flowB.totals || !flowA.analysis || !flowB.analysis) {
    return null;
  }

  const latW = latencyWinner(flowA.totalMs ?? 0, flowB.totalMs ?? 0);
  const costW = costWinner(flowA.totals.costUsd, flowB.totals.costUsd);

  return (
    <section className="animate-rise rounded-xl border border-line bg-panel p-5">
      <h2 className="mb-4 font-display text-sm font-semibold text-ink">Head to head</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-paper p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-ink-soft">Total latency</span>
            <WinnerMark winner={latW} />
          </div>
          <div className="flex items-baseline gap-4 font-mono text-sm tabular-nums">
            <span className="text-accent-a">A {fmtMs(flowA.totalMs ?? 0)}</span>
            <span className="text-muted">|</span>
            <span className="text-accent-b">B {fmtMs(flowB.totalMs ?? 0)}</span>
          </div>
        </div>
        <div className="rounded-lg bg-paper p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-ink-soft">Total cost</span>
            <WinnerMark winner={costW} />
          </div>
          <div className="flex items-baseline gap-4 font-mono text-sm tabular-nums">
            <span className="text-accent-a">A {fmtCost(flowA.totals.costUsd)}</span>
            <span className="text-muted">|</span>
            <span className="text-accent-b">B {fmtCost(flowB.totals.costUsd)}</span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            Flow B pays LLM rates only for the reply — Jev&rsquo;s classification pass is ~71x cheaper per input token, with no output cost.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-medium text-ink-soft">Field agreement</span>
        {COMPARE_FIELDS.map((field) => {
          const agree = fieldsAgree(flowA.analysis!, flowB.analysis!, field);
          return (
            <span
              key={field}
              className={`rounded-md px-2.5 py-1 font-mono text-[10px] font-semibold ${
                agree
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300"
                  : "bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300"
              }`}
            >
              {FIELD_LABELS[field]}: {agree ? "agree" : "diff"}
            </span>
          );
        })}
      </div>
    </section>
  );
}

"use client";

import type { Winner } from "@/lib/compare";
import { fmtPercent } from "@/lib/format";

export interface MetricTally {
  a: number;
  tie: number;
  b: number;
  c: number;
}

export interface ScoreboardData {
  runs: number;
  threeWayRuns: number;
  latency: MetricTally;
  cost: MetricTally;
  parseErrors: MetricTally;
  agreementSum: number;
  agreementCount: number;
}

export function emptyScoreboard(): ScoreboardData {
  return {
    runs: 0,
    threeWayRuns: 0,
    latency: { a: 0, tie: 0, b: 0, c: 0 },
    cost: { a: 0, tie: 0, b: 0, c: 0 },
    parseErrors: { a: 0, tie: 0, b: 0, c: 0 },
    agreementSum: 0,
    agreementCount: 0,
  };
}

export function tallyWinner(tally: MetricTally, winner: Winner): MetricTally {
  if (winner === "A") return { ...tally, a: tally.a + 1 };
  if (winner === "B") return { ...tally, b: tally.b + 1 };
  return { ...tally, tie: tally.tie + 1 };
}

function TallyRow({ label, tally }: { label: string; tally: MetricTally }) {
  const total = Math.max(1, tally.a + tally.tie + tally.b + (tally.c ?? 0));
  return (
    <div className="py-2.5">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3">
        <span className="min-w-0 break-words text-xs font-medium text-ink-soft">{label}</span>
        <div className="flex items-center gap-3 font-mono text-xs tabular-nums">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent-a" aria-hidden />
            <span className="text-ink">{tally.a}</span>
          </span>
          <span className="text-muted">ties {tally.tie}</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent-b" aria-hidden />
            <span className="text-ink">{tally.b}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent-c" aria-hidden />
            <span className="text-ink">{tally.c ?? 0}</span>
          </span>
        </div>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-track">
        <div
          className="bg-accent-a transition-[width] duration-500"
          style={{ width: `${(tally.a / total) * 100}%` }}
        />
        <div
          className="bg-muted/40 transition-[width] duration-500"
          style={{ width: `${(tally.tie / total) * 100}%` }}
        />
        <div
          className="bg-accent-b transition-[width] duration-500"
          style={{ width: `${(tally.b / total) * 100}%` }}
        />
        <div
          className="bg-accent-c transition-[width] duration-500"
          style={{ width: `${((tally.c ?? 0) / total) * 100}%` }}
        />
      </div>
    </div>
  );
}

export function Scoreboard({ data }: { data: ScoreboardData }) {
  const avgAgreement = data.agreementCount > 0 ? data.agreementSum / data.agreementCount : null;

  return (
    <section className="rounded-xl border border-line bg-panel p-5">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="min-w-0 font-display text-sm font-semibold text-ink">Session scoreboard</h2>
        <span className="font-mono text-xs tabular-nums text-muted">
          {data.runs} {data.runs === 1 ? "race" : "races"}
        </span>
      </div>
      {data.runs === 0 ? (
        <p className="pt-2 text-sm text-muted">
          No single-flow races yet — wins, ties, and agreement accumulate here.
        </p>
      ) : (
        <div className="divide-y divide-line">
          <TallyRow label="Latency (lower wins)" tally={data.latency} />
          <TallyRow label="Cost (lower wins)" tally={data.cost} />
          <TallyRow label="Parse errors (fewer wins)" tally={data.parseErrors} />
          <div className="flex items-center justify-between pt-3">
            <span className="text-xs font-medium text-ink-soft">Avg field agreement</span>
            <span className="font-mono text-sm tabular-nums text-ink">
              {avgAgreement !== null ? fmtPercent(avgAgreement) : "—"}
            </span>
          </div>
          <p className="pt-2 font-mono text-[10px] text-muted">
            {data.threeWayRuns ?? 0} three-way races · older sessions compare A and B
          </p>
        </div>
      )}
    </section>
  );
}

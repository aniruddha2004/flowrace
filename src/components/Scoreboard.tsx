"use client";

import { fmtPercent } from "@/lib/format";
import type { MetricTally, ScoreboardPayload } from "@/lib/scoreboard";

export type ScoreboardData = ScoreboardPayload;

export function emptyScoreboard(projectId = ""): ScoreboardData {
  return {
    projectId, runs: 0, flowNames: {},
    latency: { byFlow: {}, tie: 0 }, cost: { byFlow: {}, tie: 0 }, parseErrors: { byFlow: {}, tie: 0 },
    agreementSum: 0, agreementCount: 0,
  };
}

function TallyRow({ label, tally, names }: { label: string; tally: MetricTally; names: Record<string, string> }) {
  const total = Math.max(1, Object.values(tally.byFlow).reduce((a, b) => a + b, 0) + tally.tie);
  const colors = ["bg-accent-a", "bg-accent-b", "bg-generate", "bg-violet-500", "bg-bad"];
  return <div className="min-w-0 border-t border-line px-5 py-5 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0">
    <p className="mb-4 text-xs font-semibold text-ink">{label}</p>
    <div className="flex flex-wrap gap-x-4 gap-y-2 font-mono text-[11px] text-ink-soft">
      {Object.entries(names).map(([id, name], i) => <span key={id} className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${colors[i % colors.length]}`} />{name} {tally.byFlow[id] ?? 0}</span>)}
      <span className="text-muted">ties {tally.tie}</span>
    </div>
    <div className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-track">
      {Object.keys(names).map((id, i) => <div key={id} className={colors[i % colors.length]} style={{ width: `${((tally.byFlow[id] ?? 0) / total) * 100}%` }} />)}
      <div className="bg-muted/40" style={{ width: `${(tally.tie / total) * 100}%` }} />
    </div>
  </div>;
}

export function Scoreboard({ data }: { data: ScoreboardData }) {
  const avg = data.agreementCount ? data.agreementSum / data.agreementCount : null;
  return <section className="ui-surface overflow-hidden">
    <div className="flex items-baseline justify-between gap-2 border-b border-line px-5 py-4"><h2 className="font-display text-base font-semibold text-ink">Project scoreboard</h2><span className="font-mono text-xs text-muted">{data.runs} {data.runs === 1 ? "race" : "races"}</span></div>
    {data.runs === 0 ? <p className="p-5 text-sm text-muted">No completed multi-flow races yet.</p> : <div className="grid sm:grid-cols-3">
      <TallyRow label="Latency (lower wins)" tally={data.latency} names={data.flowNames} />
      <TallyRow label="Cost (lower wins)" tally={data.cost} names={data.flowNames} />
      <TallyRow label="Parse errors (fewer wins)" tally={data.parseErrors} names={data.flowNames} />
      <div className="flex justify-between gap-4 border-t border-line bg-track/30 px-5 py-4 text-xs text-ink-soft sm:col-span-3"><span>Average pairwise field agreement</span><span className="font-mono font-semibold text-ink">{avg === null ? "—" : fmtPercent(avg)}</span></div>
    </div>}
  </section>;
}

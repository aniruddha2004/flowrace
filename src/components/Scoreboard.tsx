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
  const colors = ["bg-accent-a", "bg-accent-b", "bg-sky-500", "bg-violet-500", "bg-rose-500"];
  return <div className="py-3">
    <p className="mb-2 text-xs font-medium text-ink-soft">{label}</p>
    <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-ink">
      {Object.entries(names).map(([id, name], i) => <span key={id} className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${colors[i % colors.length]}`} />{name} {tally.byFlow[id] ?? 0}</span>)}
      <span className="text-muted">ties {tally.tie}</span>
    </div>
    <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-track">
      {Object.keys(names).map((id, i) => <div key={id} className={colors[i % colors.length]} style={{ width: `${((tally.byFlow[id] ?? 0) / total) * 100}%` }} />)}
      <div className="bg-muted/40" style={{ width: `${(tally.tie / total) * 100}%` }} />
    </div>
  </div>;
}

export function Scoreboard({ data }: { data: ScoreboardData }) {
  const avg = data.agreementCount ? data.agreementSum / data.agreementCount : null;
  return <section className="rounded-xl border border-line bg-panel p-5">
    <div className="flex items-baseline justify-between"><h2 className="font-display text-sm font-semibold text-ink">Project scoreboard</h2><span className="font-mono text-xs text-muted">{data.runs} {data.runs === 1 ? "race" : "races"}</span></div>
    {data.runs === 0 ? <p className="pt-2 text-sm text-muted">No completed multi-flow races yet.</p> : <div className="divide-y divide-line">
      <TallyRow label="Latency (lower wins)" tally={data.latency} names={data.flowNames} />
      <TallyRow label="Cost (lower wins)" tally={data.cost} names={data.flowNames} />
      <TallyRow label="Parse errors (fewer wins)" tally={data.parseErrors} names={data.flowNames} />
      <div className="flex justify-between pt-3 text-xs text-ink-soft"><span>Avg pairwise field agreement</span><span className="font-mono text-ink">{avg === null ? "—" : fmtPercent(avg)}</span></div>
    </div>}
  </section>;
}

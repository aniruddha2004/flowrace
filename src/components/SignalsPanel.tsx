"use client";

import { useState } from "react";
import type { SignalMismatch, TicketSignals } from "@/lib/schema";
import { ACCENT, type Accent } from "./FieldRow";

// Independent content checks, collapsed to winner + runner-up per field.

const CROSS_LABELS: Record<string, string> = {
  multiple_distinct_issues_present: "multiple distinct issues",
  explicit_deadline_mentioned: "explicit deadline",
  threatens_to_cancel_or_leave: "threatens to leave",
};

const PRIORITY_CLUE_LABELS: Record<string, string> = {
  outage_or_emergency: "live outage / security / financial emergency",
  blocked_from_work: "blocked from doing their work",
  strong_frustration: "strong frustration or anger, in their own words",
  minor_no_pressure: "minor inconvenience, no real time pressure",
};

function SignalBar({
  label,
  confidence,
  highlight,
  accent,
}: {
  label: string;
  confidence: number;
  highlight: boolean;
  accent: Accent;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, confidence)) * 100);
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span
        className={`min-w-0 flex-1 text-[11px] leading-snug break-words ${
          highlight ? "font-semibold text-ink" : "text-muted"
        }`}
        title={label}
      >
        {label}
      </span>
      <div className="relative mt-1 h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-track sm:w-20">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out ${
             highlight ? ACCENT[accent].barBg : "bg-ink/20"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-ink-soft">
        {pct}
      </span>
    </div>
  );
}

function FieldSignals({
  field,
  label,
  signals,
  winners,
  mismatch,
  accent,
}: {
  field: "category" | "priority" | "route_to_team";
  label: string;
  signals: TicketSignals;
  winners: Record<string, string>;
  mismatch: SignalMismatch;
  accent: Accent;
}) {
  const [showAll, setShowAll] = useState(false);
  const entries = Object.entries(signals[field]);
  if (entries.length === 0) return null;
  const sorted = [...entries].sort(([, a], [, b]) => b.confidence - a.confidence);
  const winner = winners[field];
  // Priority signals are evidence clues (not keyed by option) so the winner
  // key won't be found there — fall back to the strongest clue.
  const winnerEntry = entries.find(([k]) => k === winner) ?? sorted[0];
  if (!winnerEntry) return null;
  const runnerUp = sorted.find(([k]) => k !== winnerEntry[0]);
  const rows: [string, { match: boolean; confidence: number }][] = [winnerEntry];
  if (runnerUp) rows.push(runnerUp);
  const hidden = sorted.filter(([k]) => !rows.some(([rk]) => rk === k));
  const contested = mismatch[field];
  const pretty = (k: string) => PRIORITY_CLUE_LABELS[k] ?? k;

  return (
    <div
      className={`py-2 pl-3 ${
        contested ? "border-l-[3px] border-amber-500" : "border-l border-line"
      }`}
    >
      <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
          {label}
        </span>
        {contested && (
          <span className="font-mono text-[10px] text-amber-600 dark:text-amber-400">
            closely contested — see runner-up below
          </span>
        )}
      </div>
      {rows.map(([key, sig]) => (
        <SignalBar key={key} label={pretty(key)} confidence={sig.confidence} highlight={key === winnerEntry[0]} accent={accent} />
      ))}
      {showAll &&
        hidden.map(([key, sig]) => (
          <SignalBar key={key} label={pretty(key)} confidence={sig.confidence} highlight={false} accent={accent} />
        ))}
      {hidden.length > 0 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-1 font-mono text-[10px] uppercase tracking-wide text-accent-b hover:opacity-80"
        >
          {showAll ? "Show fewer" : `Show all ${entries.length}`}
        </button>
      )}
    </div>
  );
}

export function SignalsPanel({
  signals,
  winners,
  mismatch,
  accent,
}: {
  signals: TicketSignals;
  winners: Record<string, string>;
  mismatch: SignalMismatch;
  accent: Accent;
}) {
  const cross = Object.entries(signals.cross_cutting);
  return (
    <div className="divide-y divide-line rounded-lg border border-line bg-paper px-4 py-2">
      {(
        [
          ["category", "Category"],
          ["priority", "Priority"],
          ["route_to_team", "Route to team"],
        ] as const
      ).map(([field, label]) => (
        <FieldSignals
          key={field}
          field={field}
          label={label}
          signals={signals}
          winners={winners}
          mismatch={mismatch}
          accent={accent}
        />
      ))}
      {cross.length > 0 && (
        <div className="py-2 pl-3">
          <div className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
            Cross-cutting
          </div>
          {cross.map(([key, sig]) => (
            <SignalBar
              key={key}
              label={CROSS_LABELS[key] ?? key}
              confidence={sig.confidence}
              highlight={sig.match}
              accent={accent}
            />
          ))}
        </div>
      )}
      <span aria-hidden className={`mt-1 block h-0.5 w-6 rounded-full ${ACCENT[accent].barBg}`} />
    </div>
  );
}

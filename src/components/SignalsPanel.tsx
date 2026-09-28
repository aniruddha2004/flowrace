"use client";

import { useState } from "react";
import type { OutputField, Project } from "@/lib/projects";
import type { FieldSignal } from "@/lib/schema";
import { ACCENT, type Accent } from "./FieldRow";

// Jev's native "why": per-clue match probabilities (noul answers), plus the
// project's cross-cutting probes. Sections come from the project's schema —
// one per enum field carrying signals, then cross-cutting.

function SignalBar({
  label,
  confidence,
  highlight,
}: {
  label: string;
  confidence: number;
  highlight: boolean;
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
            highlight ? ACCENT.b.barBg : "bg-ink/20"
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

/** Older sessions stored clue keys where newer ones store labels — resolve
 * display text through the schema's clues, falling back to the stored key. */
function clueLabelFor(field: OutputField | null, key: string, project: Project | null): string {
  const lab = field?.clues?.find((c) => c.key === key || c.label === key)?.label;
  if (lab) return lab;
  const cross = project?.crossCuttingClues.find((c) => c.key === key || c.label === key)?.label;
  return cross ?? key;
}

function FieldSignals({
  field,
  project,
  signals,
  winners,
  mismatch,
}: {
  field: OutputField;
  project: Project | null;
  signals: Record<string, FieldSignal>;
  winners: Record<string, string>;
  mismatch: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const entries = Object.entries(signals);
  if (entries.length === 0) return null;
  const sorted = [...entries].sort(([, a], [, b]) => b.confidence - a.confidence);
  const winner = winners[field.key];
  const pretty = (k: string) => clueLabelFor(field, k, project);
  const winnerEntry =
    entries.find(([k]) => k === winner || pretty(k) === pretty(winner)) ?? sorted[0];
  if (!winnerEntry) return null;
  const runnerUp = sorted.find(([k]) => k !== winnerEntry[0]);
  const rows: [string, FieldSignal][] = [winnerEntry];
  if (runnerUp) rows.push(runnerUp);
  const hidden = sorted.filter(([k]) => !rows.some(([rk]) => rk === k));

  return (
    <div
      className={`py-2 pl-3 ${
        mismatch ? "border-l-[3px] border-amber-500" : "border-l border-line"
      }`}
    >
      <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
          {field.label}
        </span>
        {mismatch && (
          <span className="font-mono text-[10px] text-amber-600 dark:text-amber-400">
            closely contested — see runner-up below
          </span>
        )}
      </div>
      {rows.map(([key, sig]) => (
        <SignalBar key={key} label={pretty(key)} confidence={sig.confidence} highlight={key === winnerEntry[0]} />
      ))}
      {showAll &&
        hidden.map(([key, sig]) => (
          <SignalBar key={key} label={pretty(key)} confidence={sig.confidence} highlight={false} />
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
  fields,
  project,
}: {
  signals: Record<string, Record<string, FieldSignal>>;
  winners: Record<string, string>;
  mismatch: Record<string, boolean>;
  accent: Accent;
  fields: OutputField[];
  project: Project | null;
}) {
  const sections = fields.filter((f) => f.type === "enum" && (signals[f.key] ?? null) !== null);
  const cross = Object.entries(signals.cross_cutting ?? {});
  return (
    <div className="divide-y divide-line rounded-lg border border-line bg-paper px-4 py-2">
      {sections.map((field) => (
        <FieldSignals
          key={field.key}
          field={field}
          project={project}
          signals={signals[field.key] ?? {}}
          winners={winners}
          mismatch={mismatch[field.key] ?? false}
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
              label={clueLabelFor(null, key, project)}
              confidence={sig.confidence}
              highlight={sig.match}
            />
          ))}
        </div>
      )}
      <span aria-hidden className={`mt-1 block h-0.5 w-6 rounded-full ${ACCENT[accent].barBg}`} />
    </div>
  );
}

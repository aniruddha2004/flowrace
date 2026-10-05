"use client";

import { useEffect, useState } from "react";
import type { OutputField } from "@/lib/projects";
import type { FlowAnalysis } from "@/lib/schema";

export type Accent = "a" | "b" | "c" | "d" | "e";
export const FLOW_ACCENTS: Accent[] = ["a", "b", "c", "d", "e"];

export const ACCENT: Record<
  Accent,
  {
    text: string;
    softBg: string;
    barBg: string;
    chipBorder: string;
    dotBg: string;
  }
> = {
  a: {
    text: "text-accent-a",
    softBg: "bg-accent-a-soft",
    barBg: "bg-accent-a",
    chipBorder: "border-accent-a/30",
    dotBg: "bg-accent-a",
  },
  b: {
    text: "text-accent-b",
    softBg: "bg-accent-b-soft",
    barBg: "bg-accent-b",
    chipBorder: "border-accent-b/30",
    dotBg: "bg-accent-b",
  },
  c: { text: "text-violet-600 dark:text-violet-300", softBg: "bg-violet-100 dark:bg-violet-900/40", barBg: "bg-violet-500", chipBorder: "border-violet-500/30", dotBg: "bg-violet-500" },
  d: { text: "text-sky-600 dark:text-sky-300", softBg: "bg-sky-100 dark:bg-sky-900/40", barBg: "bg-sky-500", chipBorder: "border-sky-500/30", dotBg: "bg-sky-500" },
  e: { text: "text-rose-600 dark:text-rose-300", softBg: "bg-rose-100 dark:bg-rose-900/40", barBg: "bg-rose-500", chipBorder: "border-rose-500/30", dotBg: "bg-rose-500" },
};

interface FieldRowProps {
  label: string;
  value: string;
  confidence: number;
  accent: Accent;
  agree?: boolean | null;
}

export function FieldRow({ label, value, confidence, accent, agree }: FieldRowProps) {
  const a = ACCENT[accent];
  const target = Math.round(Math.min(1, Math.max(0, confidence)) * 100);

  // Animate the bar in from 0 on mount/update rather than snapping straight
  // to its resting width.
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setPct(target));
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return (
    <div className="field-arrive grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 py-3.5">
      <span className="min-w-0 truncate text-xs text-ink-soft" title={label}>{label}</span>
      <span
        className={`max-w-full min-w-0 truncate rounded-[5px] border ${a.chipBorder} ${a.softBg} ${a.text} px-2.5 py-1 text-xs font-semibold`}
        title={value}
      >
        {value}
      </span>
      <div className="relative h-1 min-w-0 self-center overflow-hidden rounded-full bg-track">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${a.barBg} transition-[width] duration-700 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-right font-mono text-[11px] tabular-nums text-ink-soft">
        {target}%
      </span>
      {agree !== undefined && agree !== null && (
        <span
          key={String(agree)}
          className={`animate-pop col-span-2 w-fit shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold ${
            agree
              ? "bg-good-soft text-good"
              : "bg-bad-soft text-bad"
          }`}
        >
          {agree ? "agree" : "diff"}
        </span>
      )}
    </div>
  );
}

export function FieldSkeleton({ labels }: { labels: string[] }) {
  return (
    <div className="space-y-2">
      {labels.map((label) => (
        <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 py-3.5">
          <span className="min-w-0 truncate text-xs text-muted">{label}</span>
          <span className="skeleton-shimmer h-6 w-16 rounded-md" />
          <div className="skeleton-shimmer col-span-2 h-1 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function formatValue(field: OutputField, value: string | number | boolean | undefined): string {
  if (value === undefined) return "—";
  if (field.type === "float_range") return Number(value).toFixed(2);
  if (field.type === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function fieldValue(analysis: FlowAnalysis, field: OutputField): string {
  return formatValue(field, analysis.values[field.key]?.value);
}

export function fieldConfidence(analysis: FlowAnalysis, field: OutputField): number {
  return analysis.values[field.key]?.confidence ?? 0;
}

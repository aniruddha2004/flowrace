"use client";

import { useEffect, useState } from "react";
import type { TicketAnalysis } from "@/lib/schema";

export type Accent = "a" | "b" | "c";

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
  c: {
    text: "text-accent-c",
    softBg: "bg-accent-c-soft",
    barBg: "bg-accent-c",
    chipBorder: "border-accent-c/30",
    dotBg: "bg-accent-c",
  },
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
      <span className="w-20 shrink-0 truncate text-[13px] text-ink-soft" title={label}>{label}</span>
      <span
        className={`max-w-full min-w-0 truncate rounded-md border ${a.chipBorder} ${a.softBg} ${a.text} px-2.5 py-1 text-xs font-medium`}
        title={value}
      >
        {value}
      </span>
      <div className="relative h-1.5 min-w-0 w-16 overflow-hidden rounded-full bg-track flex-1">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${a.barBg} transition-[width] duration-700 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-ink-soft">
        {target}
      </span>
      {agree !== undefined && agree !== null && (
        <span
          key={String(agree)}
          className={`animate-pop shrink-0 rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${
            agree
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300"
              : "bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300"
          }`}
        >
          {agree ? "agree" : "diff"}
        </span>
      )}
    </div>
  );
}

const SKELETON_FIELDS = ["Category", "Priority", "Sentiment", "Route to team"];

export function FieldSkeleton() {
  return (
    <div className="space-y-2">
      {SKELETON_FIELDS.map((label) => (
        <div key={label} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
          <span className="w-20 shrink-0 truncate text-[13px] text-muted">{label}</span>
          <span className="skeleton-shimmer h-6 w-16 rounded-md" />
          <div className="skeleton-shimmer h-1.5 w-16 flex-1 rounded-full" />
          <span className="w-9 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function fieldValue(analysis: TicketAnalysis, field: string): string {
  switch (field) {
    case "category":
      return analysis.category;
    case "priority":
      return analysis.priority;
    case "sentiment":
      return analysis.sentiment.toFixed(2);
    case "route_to_team":
      return analysis.route_to_team;
    default:
      return "";
  }
}

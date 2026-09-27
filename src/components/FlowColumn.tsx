"use client";

import { useState } from "react";
import { fmtCost, fmtMs, fmtTokens } from "@/lib/format";
import type { FlowState, StepState } from "@/lib/race-state";
import { FIELD_LABELS } from "@/lib/schema";
import { PRICING } from "@/lib/pricing";
import { ACCENT, type Accent, FieldRow, FieldSkeleton, fieldValue } from "./FieldRow";
import { SignalsPanel } from "./SignalsPanel";

interface FlowColumnProps {
  accent: Accent;
  title: string;
  subtitle: string;
  state: FlowState;
  compareAgainst?: FlowState;
  fieldsAgree?: Record<string, boolean> | null;
}

function StepNode({ step, label, accent }: { step: StepState; label: string; accent: Accent }) {
  const a = ACCENT[accent];
  return (
    <div className="flex items-center gap-2">
      {step.status === "running" ? (
        <span
          aria-hidden
          className={`h-3.5 w-3.5 animate-spin rounded-full border-2 border-track border-t-current ${a.text}`}
        />
      ) : (
        <span
          aria-hidden
          className={`h-2.5 w-2.5 rounded-full transition-colors duration-300 ${
            step.status === "done"
              ? a.dotBg
              : step.status === "error"
                ? "bg-rose-500"
                : "bg-track"
          }`}
        />
      )}
      <span className="font-mono text-[11px] text-ink-soft">{label}</span>
      {typeof step.ms === "number" && (
        <span className="font-mono text-[11px] tabular-nums text-ink">· {fmtMs(step.ms)}</span>
      )}
    </div>
  );
}

function StatusChip({ state }: { state: FlowState }) {
  if (state.error) {
    return (
      <span className="rounded-md bg-rose-100 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-rose-700 dark:bg-rose-900/50 dark:text-rose-300">
        error
      </span>
    );
  }
  if (state.totals) {
    return (
      <span className="rounded-md bg-emerald-100 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
        done
      </span>
    );
  }
  const anyRunning =
    state.classification.status === "running" || state.reply.status === "running";
  if (anyRunning) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-track px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden />
        running
      </span>
    );
  }
  return (
    <span className="rounded-md bg-track px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted">
      idle
    </span>
  );
}

function ErrorCard({ state }: { state: FlowState }) {
  if (!state.error) return null;
  const isAuth = state.error.code === "jev_auth";
  return (
    <div className="animate-rise rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-800 dark:bg-rose-950/40">
      <div className="mb-1 flex items-center gap-2">
        <svg
          className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 6a1 1 0 112 0v5a1 1 0 11-2 0V6zm1 9a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5z"
            clipRule="evenodd"
          />
        </svg>
        <span className="font-display text-sm font-semibold text-rose-800 dark:text-rose-300">
          {isAuth ? "TypeSafe API key needed" : "Flow failed at this step"}
        </span>
        <span className="rounded-md border border-rose-200 bg-rose-100 px-2 py-0.5 font-mono text-[10px] uppercase text-rose-600 dark:border-rose-800 dark:bg-rose-900 dark:text-rose-300">
          {state.error.step} · {state.error.code}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-rose-700 dark:text-rose-400">{state.error.message}</p>
      {isAuth && (
        <p className="mt-2 font-mono text-xs text-rose-600 dark:text-rose-400">
          add TYPESAFE_API_KEY to .env.local → restart the dev server
        </p>
      )}
    </div>
  );
}

function SignalsExplainer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="How to read these signals"
    >
      <div className="animate-modal w-full max-w-md rounded-xl border border-line bg-panel shadow-elevated">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-display text-sm font-semibold text-ink">How to read these signals</h2>
          <button
            onClick={onClose}
            aria-label="Close explainer"
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-track hover:text-ink"
          >
            ✕
          </button>
        </div>
        <ul className="list-disc space-y-2 px-5 py-4 pl-9 text-sm leading-relaxed text-ink-soft">
          <li>
            <strong className="text-ink">Each row</strong> is an independent
            yes/no check against the ticket&apos;s actual content — not a vote
            for the final answer.
          </li>
          <li>
            <strong className="text-ink">The number (0–100)</strong> is how
            confident Jev is that this specific clue is true of the ticket —
            not its confidence in the overall category / priority / route.
          </li>
          <li>
            <strong className="text-ink">Closely contested</strong> (amber
            flag) means the selected value&apos;s supporting clue and the
            closest runner-up were within a small margin — a genuinely harder
            call, not a clean one.
          </li>
          <li>
            <strong className="text-ink">Cross-cutting</strong> clues are
            not tied to any one field — they add context that matters to all
            of them (e.g. whether multiple issues are bundled in one ticket).
          </li>
        </ul>
        <p className="border-t border-line px-5 py-3 font-mono text-[11px] leading-relaxed text-muted">
          These are Jev&apos;s native per-question answers from the same pass
          that made the decision — real independent checks, not text
          generated to sound like reasoning.
        </p>
      </div>
    </div>
  );
}

// Flow-native "why": Flow A renders the LLM's own prose rationale; Flow B
// renders Jev's calibrated signals. Never both — guarded per field.
function WhySection({ accent, state }: { accent: Accent; state: FlowState }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(false);
  const reasoning = state.analysis?.reasoning;
  const signals = state.analysis?.signals;
  const mismatch = state.analysis?.signalMismatch;
  if (!reasoning && !signals) return null;

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 font-mono text-xs font-medium text-accent-b transition-colors hover:opacity-80"
          aria-expanded={open}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform duration-200 ${open ? "rotate-90" : ""}`}
            aria-hidden
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
          Why{open ? "" : " — how this classification was reached"}
        </button>
        {signals && (
          <button
            onClick={() => setInfo(true)}
            aria-label="How to read these signals"
            title="How to read these signals"
            className="flex h-4.5 w-4.5 items-center justify-center rounded-full border border-line font-mono text-[10px] text-muted transition-colors hover:border-accent-b hover:text-accent-b"
          >
            i
          </button>
        )}
      </div>
      {signals && <SignalsExplainer open={info} onClose={() => setInfo(false)} />}
      {open && (
        <div className="animate-rise mt-2">
          {reasoning ? (
            <div className="rounded-lg border border-line bg-paper p-4 text-sm leading-relaxed text-ink">
              {reasoning}
            </div>
          ) : signals && state.analysis ? (
            <SignalsPanel
              signals={signals}
              winners={{
                category: state.analysis.category,
                priority: state.analysis.priority,
                route_to_team: state.analysis.route_to_team,
              }}
              mismatch={
                mismatch ?? { category: false, priority: false, route_to_team: false }
              }
              accent={accent}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function ReplyBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.trim().split("\n").length > 6 || text.length > 420;
  return (
    <div className="animate-rise rounded-lg border border-line bg-paper">
      <div className="relative overflow-hidden p-4">
        <p
          className={`text-sm leading-relaxed break-words text-ink ${
            expanded ? "" : "max-h-[7.5rem]"
          } overflow-hidden`}
        >
          {text}
        </p>
        {!expanded && long && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-paper to-transparent"
          />
        )}
      </div>
      {long && (
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="border-t border-line px-4 py-2 font-mono text-[10px] uppercase tracking-wide text-accent-b transition-colors hover:opacity-80"
        >
          {expanded ? "Show less" : "Show full reply"}
        </button>
      )}
    </div>
  );
}

export function FlowColumn({ accent, title, subtitle, state, fieldsAgree }: FlowColumnProps) {
  const a = ACCENT[accent];
  const started =
    state.classification.status !== "idle" ||
    state.reply.status !== "idle" ||
    Boolean(state.error) ||
    Boolean(state.analysis);

  const fields: Array<{ key: string; label: string }> = [
    { key: "category", label: FIELD_LABELS.category },
    { key: "priority", label: FIELD_LABELS.priority },
    { key: "sentiment", label: FIELD_LABELS.sentiment },
    { key: "route_to_team", label: FIELD_LABELS.route_to_team },
  ];

  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-line bg-panel">
      <header className={`flex items-start justify-between gap-3 border-b border-line p-5 ${accent === "a" ? "bg-accent-a-soft/40" : "bg-accent-b-soft/40"}`}>
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${a.dotBg}`} />
          <div className="min-w-0">
            <h2 className={`font-display text-base font-semibold break-words ${a.text}`}>{title}</h2>
            <p className="mt-0.5 max-w-sm text-xs leading-relaxed text-ink-soft">{subtitle}</p>
          </div>
        </div>
        <StatusChip state={state} />
      </header>

      {!started ? (
        <div className="m-5 flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-line p-10 text-center">
          <p className="font-display text-sm font-medium text-muted">Awaiting a run</p>
          <p className="mt-1 max-w-56 text-xs leading-relaxed text-muted">
            Paste a ticket above and press Run Race — this column fills in live.
          </p>
        </div>
      ) : (
        <div className="animate-rise flex flex-1 flex-col gap-6 p-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-paper px-4 py-3">
            <StepNode step={state.classification} label="classification" accent={accent} />
            <span aria-hidden className="hidden h-px min-w-6 flex-1 bg-line sm:block" />
            <StepNode step={state.reply} label="reply" accent={accent} />
          </div>

          {state.error && state.error.step === "classification" && <ErrorCard state={state} />}

          <div>
            <h3 className="mb-1 font-display text-sm font-medium text-ink">Classification</h3>
            {state.analysis ? (
              <div className="divide-y divide-line">
                {fields.map(({ key, label }) => (
                  <FieldRow
                    key={key}
                    accent={accent}
                    label={label}
                    value={fieldValue(state.analysis!, key)}
                    confidence={
                      state.analysis!.confidence[key as keyof typeof state.analysis.confidence]
                    }
                    agree={fieldsAgree ? fieldsAgree[key] : null}
                  />
                ))}
              </div>
            ) : state.classification.status === "running" ? (
              <FieldSkeleton />
            ) : (
              <p className="py-2 text-xs text-muted">—</p>
            )}
          </div>

          <WhySection accent={accent} state={state} />

          <div>
            <h3 className="mb-1 font-display text-sm font-medium text-ink">Drafted reply</h3>
            {state.replyText ? (
              <ReplyBlock text={state.replyText} />
            ) : state.reply.status === "running" ? (
              <div className="space-y-2 rounded-lg border border-line p-4">
                <div className="skeleton-shimmer h-3 w-full rounded" />
                <div className="skeleton-shimmer h-3 w-11/12 rounded" />
                <div className="skeleton-shimmer h-3 w-4/5 rounded" />
              </div>
            ) : state.error && state.error.step === "reply" ? (
              <ErrorCard state={state} />
            ) : (
              <p className="py-2 text-xs text-muted">—</p>
            )}
          </div>
        </div>
      )}

      <footer className="mt-auto border-t border-line bg-paper px-5 py-3">
        {(state.classificationMetrics || state.replyMetrics) && (
          <div className="mb-2 space-y-0.5 border-b border-line pb-2 font-mono text-[11px] tabular-nums">
            {state.classificationMetrics && (
              <MetricLine
                engine={accent === "b" ? "Jev" : "LLM"}
                step="classify"
                ms={state.classification.ms}
                metrics={state.classificationMetrics}
                highlight={accent}
              />
            )}
            {state.replyMetrics && (
              <MetricLine
                engine="LLM"
                step="reply"
                ms={state.reply.ms}
                metrics={state.replyMetrics}
                highlight={accent}
              />
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs tabular-nums text-ink-soft">
          <span>
            latency <span className="text-ink">{state.totals ? fmtMs(state.totalMs ?? 0) : "—"}</span>
          </span>
          <span>
            tokens{" "}
            <span className="text-ink">
              {state.totals
                ? `${fmtTokens(state.totals.inputTokens)} in / ${fmtTokens(state.totals.outputTokens)} out`
                : "—"}
            </span>
          </span>
          <span>
            cost <span className="text-ink">{state.totals ? fmtCost(state.totals.costUsd) : "—"}</span>
            <RatesInfo accent={accent} />
          </span>
          <span>
            parseErrors <span className="text-ink">{state.totals ? state.totals.parseErrors : "—"}</span>
          </span>
        </div>
      </footer>
    </section>
  );
}

// Per-step breakdown: which engine produced which tokens, and how long it took.
function MetricLine({
  engine,
  step,
  ms,
  metrics,
  highlight,
}: {
  engine: "Jev" | "LLM";
  step: "classify" | "reply";
  ms?: number;
  metrics: { inputTokens: number; outputTokens: number; costUsd: number };
  highlight: Accent;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-ink-soft">
      <span
        className={`shrink-0 rounded px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide ${
          engine === "Jev" ? "bg-accent-b-soft text-accent-b" : `${ACCENT[highlight].softBg} ${ACCENT[highlight].text}`
        }`}
      >
        {engine}
      </span>
      <span className="w-14 shrink-0 text-muted sm:w-16">{step}</span>
      <span className="min-w-0 break-words text-ink">
        {fmtTokens(metrics.inputTokens)} in / {fmtTokens(metrics.outputTokens)} out
      </span>
      <span className="text-muted">·</span>
      <span className="text-ink">{fmtCost(metrics.costUsd)}</span>
      <span className="text-muted">·</span>
      <span className="text-ink">{typeof ms === "number" ? fmtMs(ms) : "—"}</span>
    </div>
  );
}

function RatesInfo({ accent }: { accent: Accent }) {
  const k = PRICING.kimi_k3;
  const j = PRICING.jev;
  const lines =
    accent === "b"
      ? [`Jev — $${j.inputPerM}/M in · free out`, `kimi-k3 (reply only) — $${k.inputPerM}/M in · $${k.outputPerM}/M out`]
      : [`kimi-k3 — $${k.inputPerM}/M in · $${k.outputPerM}/M out`];
  return (
    <span
      title={lines.join("\n")}
      aria-label={`Rates used: ${lines.join("; ")}`}
      className="ml-1 inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-line text-[9px] text-muted transition-colors hover:border-accent-b hover:text-accent-b"
    >
      i
    </span>
  );
}

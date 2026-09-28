"use client";

import { useCallback, useRef, useState } from "react";
import { COMPARE_FIELDS, fieldsAgree } from "@/lib/compare";
import type { FlowId, RaceEvent, StepMetrics } from "@/lib/events";
import { emptyFlowState, flowProgress, type FlowState } from "@/lib/race-state";
import { asTicketAnalysis, type TicketAnalysis } from "@/lib/schema";
import type { SessionFull } from "@/lib/sessions";

import { ComparisonStrip } from "@/components/ComparisonStrip";
import { FlowColumn } from "@/components/FlowColumn";
import { InputCard } from "@/components/InputCard";
import { Scoreboard, emptyScoreboard, type ScoreboardData } from "@/components/Scoreboard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SettingsModal } from "@/components/SettingsModal";
import { SessionSidebar } from "@/components/SessionSidebar";

interface CompletedFlow {
  totalMs: number;
  totals: StepMetrics;
  analysis: TicketAnalysis;
}

// Three independent progress lanes remain legible when all flows run at once.
function RaceTrack({ flowA, flowB, flowC }: { flowA: FlowState; flowB: FlowState; flowC: FlowState }) {
  return (
    <div className="flex h-[3px] w-full gap-px">
      {([flowA, flowB, flowC] as const).map((flow, i) => (
        <div key={i} className="h-full flex-1 bg-track">
          <div
            className={`h-full transition-[width] duration-500 ease-out ${["bg-accent-a", "bg-accent-b", "bg-accent-c"][i]}`}
            style={{ width: `${flowProgress(flow) * 100}%` }}
          />
        </div>
      ))}
    </div>
  );
}

interface AppShellProps {
  children: React.ReactNode;
  onOpenSettings: () => void;
  trackFlowA?: FlowState;
  trackFlowB?: FlowState;
  trackFlowC?: FlowState;
}

function AppShell({ children, onOpenSettings, trackFlowA, trackFlowB, trackFlowC }: AppShellProps) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="shrink-0 border-b border-line bg-panel">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6">
          <div className="flex items-baseline gap-2.5">
            <h1 className="font-display text-base font-bold tracking-tight text-ink">Flow Race</h1>
            <span className="hidden font-mono text-xs text-muted sm:inline">LLM vs Jev vs local GLiNER</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={onOpenSettings}
              title="Settings"
              aria-label="Settings"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-panel text-ink-soft transition-colors hover:border-ink/20 hover:text-ink active:scale-95"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1-.33 1.82V9c.67.6 1.51 1 1.51 1h.09a2 2 0 0 1 0 4z" />
              </svg>
            </button>
            <ThemeToggle />
          </div>
        </div>
        {trackFlowA && trackFlowB && trackFlowC && <RaceTrack flowA={trackFlowA} flowB={trackFlowB} flowC={trackFlowC} />}
      </header>
      <div className="flex flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

export default function Home() {
  const [viewingSession, setViewingSession] = useState<SessionFull | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [singleText, setSingleText] = useState("");
  const [singleRunning, setSingleRunning] = useState(false);
  const [flowA, setFlowA] = useState<FlowState>(emptyFlowState);
  const [flowB, setFlowB] = useState<FlowState>(emptyFlowState);
  const [flowC, setFlowC] = useState<FlowState>(emptyFlowState);
  const [scoreboard, setScoreboard] = useState<ScoreboardData>(emptyScoreboard);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const completedRef = useRef<Partial<Record<FlowId, CompletedFlow>>>({});
  const [historyVersion, setHistoryVersion] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Scoreboard is fully server-derived from persisted sessions — the client
  // never tallies locally, so counts can never drift after a reload.
  const refreshScoreboard = useCallback(() => {
    fetch("/api/scoreboard")
      .then((res) => res.json())
      .then((data: ScoreboardData) => {
        setScoreboard(data);
        setHistoryVersion((v) => v + 1);
      })
      .catch(() => {});
  }, []);

  // The scoreboard is intentionally NOT fetched on mount — a fresh page
  // load shows an empty board; it fills only when a race completes
  // (run_done). History remains queryable via /api/scoreboard.

  const readStream = useCallback(
    async <T,>(
      url: string,
      body: Record<string, unknown>,
      onEvent: (e: T) => void,
      onDone?: () => void,
    ) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            onEvent(JSON.parse(trimmed) as T);
          } catch {
            // ignore unparseable lines
          }
        }
      }
      if (buffer.trim()) {
        try {
          onEvent(JSON.parse(buffer) as T);
        } catch {
          // ignore
        }
      }
      onDone?.();
    },
    [],
  );

  const applyRaceEvent = useCallback((event: RaceEvent) => {
    const setFlow = (flow: FlowId) => ({ A: setFlowA, B: setFlowB, C: setFlowC })[flow];
    switch (event.type) {
      case "step_start": {
        setFlow(event.flow)((prev) => ({
          ...prev,
          [event.step]: { status: "running", startedAt: event.at },
        }));
        break;
      }
      case "step_done": {
        if (event.step === "classification") {
          setFlow(event.flow)((prev) => ({
            ...prev,
            classification: { status: "done", ms: event.ms },
            analysis: event.data,
            classificationMetrics: event.metrics,
          }));
          const bucket = completedRef.current;
          bucket[event.flow] = {
            totalMs: bucket[event.flow]?.totalMs ?? 0,
            totals: bucket[event.flow]?.totals ?? event.metrics,
            analysis: event.data,
          };
        } else {
          setFlow(event.flow)((prev) => ({
            ...prev,
            reply: { status: "done", ms: event.ms },
            replyText: event.reply,
            replyMetrics: event.metrics,
          }));
        }
        break;
      }
      case "flow_done": {
        setFlow(event.flow)((prev) => ({ ...prev, totalMs: event.totalMs, totals: event.totals }));
        const bucket = completedRef.current[event.flow];
        if (bucket) {
          bucket.totalMs = event.totalMs;
          bucket.totals = event.totals;
        }
        break;
      }
      case "flow_error": {
        setFlow(event.flow)((prev) => ({
          ...prev,
          [event.step]: { status: "error" },
          error: { step: event.step, code: event.code, message: event.message },
        }));
        break;
      }
      case "run_done": {
        setSingleRunning(false);
        void refreshScoreboard();
        break;
      }
    }
  }, [refreshScoreboard]);

  const runSingleRace = useCallback(async () => {
    if (singleRunning || !singleText.trim()) return;
    setSingleRunning(true);
    setBannerError(null);
    completedRef.current = {};
    setFlowA(emptyFlowState());
    setFlowB(emptyFlowState());
    setFlowC(emptyFlowState());
    setViewingSession(null);

    try {
      await readStream<RaceEvent>(
        "/api/race",
        { action: "run", text: singleText.trim() },
        applyRaceEvent,
      );
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : String(err));
      setSingleRunning(false);
    }
  }, [singleRunning, singleText, applyRaceEvent, readStream]);

  const loadSession = useCallback((session: SessionFull) => {
    if (session.type !== "single") return;
    setViewingSession(session);
    setBannerError(null);
    setSidebarOpen(false);
    const result = session.result as {
      flows?: Partial<Record<FlowId, {
        analysis?: unknown;
        reply?: string;
        freeText?: Record<string, string>;
        totalMs?: number;
        totals?: StepMetrics;
        classificationMetrics?: StepMetrics;
        classificationMs?: number;
        replyMetrics?: StepMetrics;
        replyMs?: number;
        error?: string;
      }>>;
    };
    const a = result.flows?.A ?? {};
    const b = result.flows?.B ?? {};
    const c = result.flows?.C ?? {};
    const hydrate = (f: typeof a): FlowState => {
      const analysis = asTicketAnalysis(f.analysis);
      const storedAnalysis = f.analysis as { freeText?: Record<string, string> } | undefined;
      const reply = f.reply ?? f.freeText?.reply ?? storedAnalysis?.freeText?.reply;
      return {
        classification: analysis
          ? { status: "done", ms: f.classificationMs ?? f.totalMs }
          : { status: "idle" },
        reply: reply
          ? { status: "done", ms: f.replyMs ?? f.totalMs }
          : { status: "idle" },
        analysis,
        classificationMetrics: f.classificationMetrics,
        replyText: reply,
        replyMetrics: f.replyMetrics,
        totalMs: f.totalMs,
        totals: f.totals,
        error: f.error ? { step: "reply", code: "internal", message: f.error } : undefined,
      };
    };
    setFlowA(hydrate(a));
    setFlowB(hydrate(b));
    setFlowC(hydrate(c));
  }, []);

  const agreeMap: Record<string, boolean> | null = flowA.analysis && flowB.analysis
    ? Object.fromEntries(COMPARE_FIELDS.map((f) => [f,
      fieldsAgree(flowA.analysis!, flowB.analysis!, f)
      && (!flowC.analysis || (fieldsAgree(flowA.analysis!, flowC.analysis, f)
        && fieldsAgree(flowB.analysis!, flowC.analysis, f))),
    ]))
    : null;

  const resetLiveView = useCallback((clearText: boolean) => {
    setViewingSession(null);
    setBannerError(null);
    completedRef.current = {};
    setFlowA(emptyFlowState());
    setFlowB(emptyFlowState());
    setFlowC(emptyFlowState());
    setScoreboard(emptyScoreboard());
    if (clearText) setSingleText("");
    setSidebarOpen(false);
  }, []);

  const sidebar = (
    <SessionSidebar
      activeId={viewingSession?.id ?? null}
      onSelect={loadSession}
      onNew={() => resetLiveView(true)}
      refreshKey={historyVersion}
    />
  );

  if (viewingSession) {
    const hasFlowC = Boolean((viewingSession.result as { flows?: { C?: unknown } }).flows?.C);
    return (
      <AppShell onOpenSettings={() => setSettingsOpen(true)}>
        <div className="hidden min-h-0 sm:flex sm:items-stretch">{sidebar}</div>
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1700px] px-6 pb-16 pt-8 sm:px-10 lg:px-8">
            <button
              onClick={() => resetLiveView(false)}
              className="mb-6 inline-flex items-center gap-1.5 font-mono text-xs text-accent-b hover:opacity-80"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Back to live race
            </button>
            <div className="animate-rise mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-display text-xl font-semibold break-words text-ink">{viewingSession.label}</h2>
                <p className="mt-1 font-mono text-xs text-muted">
                  {viewingSession.type} · {new Date(viewingSession.createdAt).toLocaleString()}
                </p>
              </div>
            </div>

            <div className="mb-6 rounded-xl border border-line bg-panel p-5">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-muted">Ticket</p>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">
                {typeof viewingSession.input === "string"
                  ? viewingSession.input
                  : (viewingSession.input as { text?: string })?.text ?? ""}
              </p>
            </div>

            <div className={`grid grid-cols-1 gap-6 lg:grid-cols-2 ${hasFlowC ? "xl:grid-cols-3" : ""}`}>
              <FlowColumn
                accent="a"
                title="Flow A — LLM tool-call"
                subtitle="kimi-k3 classifies via forced submit_ticket_analysis tool-call (zod-validated, retried), then drafts the reply."
                state={flowA}
                fieldsAgree={agreeMap}
              />
              <FlowColumn
                accent="b"
                title="Flow B — Jev + LLM hybrid"
                subtitle="Jev (TypeSafe System One) classifies with rubric questions; the LLM only drafts the reply from those decisions."
                state={flowB}
                fieldsAgree={agreeMap}
              />
              {hasFlowC && <FlowColumn
                accent="c"
                title="Flow C — GLiNER + LLM hybrid"
                subtitle="GLiNER2.5-Decide classifies locally; the LLM only drafts the reply from its decisions."
                state={flowC}
                fieldsAgree={agreeMap}
              />}
            </div>
            <div className="mt-6">
              <ComparisonStrip flowA={flowA} flowB={flowB} flowC={hasFlowC ? flowC : undefined} />
            </div>
          </div>
        </div>

        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </AppShell>
    );
  }

  return (
    <AppShell
      onOpenSettings={() => setSettingsOpen(true)}
      trackFlowA={flowA}
      trackFlowB={flowB}
      trackFlowC={flowC}
    >
      <div className="hidden min-h-0 sm:flex sm:items-stretch">{sidebar}</div>

      {/* Mobile sidebar drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 sm:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setSidebarOpen(false)} />
          <div className="animate-modal absolute inset-y-0 left-0">{sidebar}</div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1700px] px-6 pb-16 pt-8 sm:px-10 lg:px-8">
          <div className="mb-6 flex items-center justify-between gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-panel text-ink-soft sm:hidden"
              aria-label="Open history"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>

          {bannerError && (
            <div className="animate-rise mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
              {bannerError}
            </div>
          )}

          <div className="space-y-6">
            <InputCard text={singleText} running={singleRunning} onTextChange={setSingleText} onRun={runSingleRace} />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
              <FlowColumn
                accent="a"
                title="Flow A — LLM tool-call"
                subtitle="kimi-k3 classifies via forced submit_ticket_analysis tool-call (zod-validated, retried), then drafts the reply."
                state={flowA}
                fieldsAgree={agreeMap}
              />
              <FlowColumn
                accent="b"
                title="Flow B — Jev + LLM hybrid"
                subtitle="Jev (TypeSafe System One) classifies with rubric questions; the LLM only drafts the reply from those decisions."
                state={flowB}
                fieldsAgree={agreeMap}
              />
              <FlowColumn
                accent="c"
                title="Flow C — GLiNER + LLM hybrid"
                subtitle="GLiNER2.5-Decide classifies locally; the LLM only drafts the reply from its decisions."
                state={flowC}
                fieldsAgree={agreeMap}
              />
            </div>
            <ComparisonStrip flowA={flowA} flowB={flowB} flowC={flowC} />
            <Scoreboard data={scoreboard} />
          </div>

          <footer className="mt-12 border-t border-line pt-6 text-center font-mono text-xs text-muted">
            Flow A: forced tool-calling · Flow B: Jev System One + reply-only · Flow C: local GLiNER + reply-only
          </footer>
        </div>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </AppShell>
  );
}

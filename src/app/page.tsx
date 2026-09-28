"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { compareFields, fieldAgree } from "@/lib/compare";
import type { RaceEvent, StepMetrics } from "@/lib/events";
import { emptyFlowState, flowProgress, type FlowState } from "@/lib/race-state";
import type { FlowAnalysis } from "@/lib/schema";
import type { Project } from "@/lib/projects";
import type { SessionFull } from "@/lib/sessions";

import { ComparisonStrip } from "@/components/ComparisonStrip";
import { FlowColumn } from "@/components/FlowColumn";
import { InputCard } from "@/components/InputCard";
import { Scoreboard, emptyScoreboard, type ScoreboardData } from "@/components/Scoreboard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SettingsModal } from "@/components/SettingsModal";
import { SessionSidebar } from "@/components/SessionSidebar";
import { NewProjectModal } from "@/components/NewProjectModal";

interface CompletedFlow {
  totalMs: number;
  totals: StepMetrics;
  analysis: FlowAnalysis;
}

// Header race track — both flows' live progress made literal.
function RaceTrack({ flowA, flowB }: { flowA: FlowState; flowB: FlowState }) {
  const pa = flowProgress(flowA) * 100;
  const pb = flowProgress(flowB) * 100;
  return (
    <div className="h-[3px] w-full bg-track">
      <div className="relative h-full w-full">
        <div
          className="absolute inset-y-0 left-0 bg-accent-a transition-[width] duration-500 ease-out"
          style={{ width: `${pa}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 bg-accent-b/70 transition-[width] duration-500 ease-out"
          style={{ width: `${pb}%`, mixBlendMode: "multiply" }}
        />
      </div>
    </div>
  );
}

interface AppShellProps {
  children: React.ReactNode;
  onOpenSettings: () => void;
  trackFlowA?: FlowState;
  trackFlowB?: FlowState;
  projects: Project[];
  currentProjectId?: string;
  onProjectSelect: (id: string) => void;
  onNewProject: () => void;
}

function AppShell({ children, onOpenSettings, trackFlowA, trackFlowB, projects, currentProjectId, onProjectSelect, onNewProject }: AppShellProps) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="shrink-0 border-b border-line bg-panel">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6">
          <div className="flex min-w-0 items-baseline gap-2.5">
            <h1 className="font-display text-base font-bold tracking-tight text-ink">Flow Race</h1>
            <span className="hidden font-mono text-xs text-muted sm:inline">LLM vs Jev</span>
            {projects.length > 0 && (
              <span className="hidden min-w-0 items-baseline gap-1.5 md:inline-flex">
                <select
                  value={currentProjectId ?? ""}
                  onChange={(e) => onProjectSelect(e.target.value)}
                  aria-label="Current project"
                  className="max-w-44 truncate rounded-md border border-line bg-paper px-2 py-1 font-mono text-xs text-ink-soft focus:border-accent-b/50 focus:outline-none"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  onClick={onNewProject}
                  title="New project"
                  aria-label="New project"
                  className="flex h-6 w-6 items-center justify-center rounded-md border border-line font-mono text-xs text-ink-soft transition-colors hover:border-accent-b hover:text-accent-b"
                >
                  +
                </button>
              </span>
            )}
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
        {trackFlowA && trackFlowB && <RaceTrack flowA={trackFlowA} flowB={trackFlowB} />}
      </header>
      <div className="flex flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

export default function Home() {
  const [viewingSession, setViewingSession] = useState<SessionFull | null>(null);
  const [viewingSchema, setViewingSchema] = useState<import("@/lib/projects").OutputSchema | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [singleText, setSingleText] = useState("");
  const [singleRunning, setSingleRunning] = useState(false);
  const [flowA, setFlowA] = useState<FlowState>(emptyFlowState);
  const [flowB, setFlowB] = useState<FlowState>(emptyFlowState);
  const [scoreboard, setScoreboard] = useState<ScoreboardData>(emptyScoreboard);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const completedRef = useRef<{ A?: CompletedFlow; B?: CompletedFlow }>({});
  const [historyVersion, setHistoryVersion] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [project, setProject] = useState<Project | null>(null);

  const loadProject = useCallback(async (id: string) => {
    const res = await fetch(`/api/projects/${id}`).then((r) => r.json());
    return res.project as Project | undefined;
  }, []);

  const switchProject = useCallback(async (id: string) => {
    const p = await loadProject(id);
    if (!p) return;
    projectIdRef.current = p.id;
    setProject(p);
    setViewingSession(null);
    setViewingSchema(null);
    setBannerError(null);
    completedRef.current = {};
    setFlowA(emptyFlowState());
    setFlowB(emptyFlowState());
    setScoreboard(emptyScoreboard());
    setHistoryVersion((v) => v + 1);
    setSingleText("");
  }, [loadProject]);

  const projectIdRef = useRef<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  const refreshProjects = useCallback(async (selectId?: string) => {
    const data = await fetch("/api/projects").then((r) => r.json());
    const list = (data.projects ?? []) as Project[];
    setProjects(list);
    const target = list.find((p) => p.id === (selectId ?? projectIdRef.current)) ?? list[0];
    if (target) {
      projectIdRef.current = target.id;
      setProject(target);
    }
  }, []);

  useEffect(() => {
    if (projectIdRef.current) return;
    projectIdRef.current = "pending";
    void refreshProjects();
  }, [refreshProjects]);

  // Scoreboard is fully server-derived from persisted sessions — the client
  // never tallies locally, so counts can never drift after a reload.
  const refreshScoreboard = useCallback((projectId?: string) => {
    const q = projectId ? `?project=${encodeURIComponent(projectId)}` : "";
    fetch(`/api/scoreboard${q}`)
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
    switch (event.type) {
      case "step_start": {
        const setFlow = event.flow === "A" ? setFlowA : setFlowB;
        setFlow((prev) => ({
          ...prev,
          [event.step]: { status: "running", startedAt: event.at },
        }));
        break;
      }
      case "step_done": {
        const setFlow = event.flow === "A" ? setFlowA : setFlowB;
        if (event.step === "classification") {
          setFlow((prev) => ({
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
          setFlow((prev) => ({
            ...prev,
            reply: { status: "done", ms: event.ms },
            freeText: event.freeText,
            replyMetrics: event.metrics,
          }));
        }
        break;
      }
      case "flow_done": {
        const setFlow = event.flow === "A" ? setFlowA : setFlowB;
        setFlow((prev) => ({ ...prev, totalMs: event.totalMs, totals: event.totals }));
        const bucket = completedRef.current[event.flow];
        if (bucket) {
          bucket.totalMs = event.totalMs;
          bucket.totals = event.totals;
        }
        break;
      }
      case "flow_error": {
        const setFlow = event.flow === "A" ? setFlowA : setFlowB;
        setFlow((prev) => ({
          ...prev,
          [event.step]: { status: "error" },
          error: { step: event.step, code: event.code, message: event.message },
        }));
        break;
      }
      case "run_done": {
        setSingleRunning(false);
        void refreshScoreboard(projectIdRef.current ?? project?.id);
        break;
      }
    }
  }, [refreshScoreboard, project?.id]);

  const runSingleRace = useCallback(async () => {
    if (singleRunning || !singleText.trim()) return;
    setSingleRunning(true);
    setBannerError(null);
    completedRef.current = {};
    setFlowA(emptyFlowState());
    setFlowB(emptyFlowState());
    setViewingSession(null);

    try {
      await readStream<RaceEvent>(
        "/api/race",
        { action: "run", text: singleText.trim(), projectId: project?.id },
        applyRaceEvent,
      );
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : String(err));
      setSingleRunning(false);
    }
  }, [singleRunning, singleText, applyRaceEvent, readStream, project?.id]);

  const loadSession = useCallback((session: SessionFull) => {
    if (session.type !== "single") return;
    setViewingSession(session);
    setBannerError(null);
    setSidebarOpen(false);
    const result = session.result as {
      schemaVersion?: number;
      flows?: Partial<Record<"A" | "B", {
        analysis?: FlowAnalysis;
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
    const hydrate = (f: typeof a): FlowState => ({
      classification: f.analysis
        ? { status: "done", ms: f.classificationMs ?? f.totalMs }
        : { status: "idle" },
      reply: Object.keys(f.freeText ?? {}).length > 0 || f.replyMs
        ? { status: "done", ms: f.replyMs ?? f.totalMs }
        : { status: "idle" },
      analysis: f.analysis,
      classificationMetrics: f.classificationMetrics,
      freeText: f.freeText ?? f.analysis?.freeText ?? {},
      replyMetrics: f.replyMetrics,
      totalMs: f.totalMs,
      totals: f.totals,
      error: f.error ? { step: "reply", code: "internal", message: f.error } : undefined,
    });
    setFlowA(hydrate(a));
    setFlowB(hydrate(b));
    setViewingSchema(Array.isArray(session.schemaSnapshot) ? session.schemaSnapshot : null);
    if (session.projectId) void loadProject(session.projectId);
  }, [loadProject]);

  const activeSchema = viewingSchema ?? project?.outputSchema ?? [];
  const cmpFields = compareFields(activeSchema);
  const agreeMap: Record<string, boolean> | null =
    flowA.analysis && flowB.analysis
      ? Object.fromEntries(
          cmpFields.map((f) => [f.key, fieldAgree(f, flowA.analysis!, flowB.analysis!)]),
        )
      : null;

  const resetLiveView = useCallback((clearText: boolean) => {
    setViewingSession(null);
    setViewingSchema(null);
    setBannerError(null);
    completedRef.current = {};
    setFlowA(emptyFlowState());
    setFlowB(emptyFlowState());
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
      projectId={project?.id}
    />
  );

  if (viewingSession) {
    return (
      <AppShell
        onOpenSettings={() => setSettingsOpen(true)}
        projects={projects}
        currentProjectId={project?.id}
        onProjectSelect={(id) => void switchProject(id)}
        onNewProject={() => setNewProjectOpen(true)}
      >
        <div className="hidden min-h-0 sm:flex sm:items-stretch">{sidebar}</div>
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1400px] px-6 pb-16 pt-8 sm:px-10 lg:px-16">
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

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <FlowColumn
                accent="a"
                title="Flow A — LLM tool-call"
                subtitle="kimi-k3 classifies via forced submit_analysis tool-call (zod-validated, retried), then drafts the reply."
                state={flowA}
                schema={viewingSchema ?? activeSchema}
                project={project}
                fieldsAgree={agreeMap}
              />
              <FlowColumn
                accent="b"
                title="Flow B — Jev + LLM hybrid"
                subtitle="Jev (TypeSafe System One) classifies with rubric questions; the LLM only drafts the reply from those decisions."
                state={flowB}
                schema={viewingSchema ?? activeSchema}
                project={project}
                fieldsAgree={agreeMap}
              />
            </div>
            <div className="mt-6">
              <ComparisonStrip
                flowA={flowA}
                flowB={flowB}
                fields={compareFields(viewingSchema ?? activeSchema)}
              />
            </div>
          </div>
        </div>

        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} project={project} onProjectChange={() => void refreshProjects()} />
      </AppShell>
    );
  }

  return (
    <AppShell
      onOpenSettings={() => setSettingsOpen(true)}
      trackFlowA={flowA}
      trackFlowB={flowB}
      projects={projects}
      currentProjectId={project?.id}
      onProjectSelect={(id) => void switchProject(id)}
      onNewProject={() => setNewProjectOpen(true)}
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
        <div className="mx-auto max-w-[1400px] px-6 pb-16 pt-8 sm:px-10 lg:px-16">
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
            <InputCard text={singleText} running={singleRunning} onTextChange={setSingleText} onRun={runSingleRace} inputLabel={project?.inputLabel} />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <FlowColumn
                accent="a"
                title="Flow A — LLM tool-call"
                subtitle="kimi-k3 classifies via forced submit_analysis tool-call (zod-validated, retried), then drafts the reply."
                state={flowA}
                schema={activeSchema}
                project={project}
                fieldsAgree={agreeMap}
              />
              <FlowColumn
                accent="b"
                title="Flow B — Jev + LLM hybrid"
                subtitle="Jev (TypeSafe System One) classifies with rubric questions; the LLM only drafts the reply from those decisions."
                state={flowB}
                schema={activeSchema}
                project={project}
                fieldsAgree={agreeMap}
              />
            </div>
            <ComparisonStrip flowA={flowA} flowB={flowB} fields={cmpFields} />
            <Scoreboard data={scoreboard} />
          </div>

          <footer className="mt-12 border-t border-line pt-6 text-center font-mono text-xs text-muted">
            Flow A: forced tool-calling · Flow B: Jev System One + reply-only · all metrics are real API usage
          </footer>
        </div>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} project={project} onProjectChange={() => void refreshProjects()} />
      <NewProjectModal
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        onCreated={(id) => void refreshProjects(id)}
      />
    </AppShell>
  );
}

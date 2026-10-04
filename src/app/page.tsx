"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RaceEvent, StepMetrics } from "@/lib/events";
import type { Flow } from "@/lib/flows";
import type { StoredStep } from "@/lib/flow-runner";
import type { ModelRow } from "@/lib/models";
import { compareFields } from "@/lib/compare";
import { emptyFlowState, flowProgress, type FlowState } from "@/lib/race-state";
import type { Project, OutputSchema } from "@/lib/projects";
import type { FlowAnalysis } from "@/lib/schema";
import type { SessionFull } from "@/lib/sessions";
import { ComparisonStrip } from "@/components/ComparisonStrip";
import { FLOW_ACCENTS, ACCENT } from "@/components/FieldRow";
import { FlowColumn } from "@/components/FlowColumn";
import { FlowManager } from "@/components/FlowManager";
import { InputCard } from "@/components/InputCard";
import { NewProjectModal } from "@/components/NewProjectModal";
import { Scoreboard, emptyScoreboard, type ScoreboardData } from "@/components/Scoreboard";
import { SessionSidebar } from "@/components/SessionSidebar";
import { SettingsModal } from "@/components/SettingsModal";
import { ThemeToggle } from "@/components/ThemeToggle";

interface SavedFlow {
  analysis?: FlowAnalysis;
  freeText?: Record<string, string>;
  steps?: StoredStep[];
  totalMs?: number;
  totals?: StepMetrics;
  classificationMetrics?: StepMetrics;
  classificationMs?: number;
  replyMetrics?: StepMetrics;
  replyMs?: number;
  error?: string;
}

function legacyFlow(id: string, schema: OutputSchema, projectId: string, createdAt: string): Flow {
  const decide = id === "A" ? "kimi-k3" : "jev";
  return {
    id, name: id === "A" ? "LLM only" : "Jev hybrid", projectId, createdAt,
    steps: [
      { id: "decide", modelId: decide, role: "decide", ownsFields: schema.filter((field) => field.type !== "free_text").map((field) => field.key), seesPriorStepOutput: false },
      { id: "generate", modelId: "kimi-k3", role: "generate", ownsFields: schema.filter((field) => field.type === "free_text").map((field) => field.key), seesPriorStepOutput: true },
    ],
  };
}

function hydrate(flow: Flow, saved?: SavedFlow): FlowState {
  const state = emptyFlowState(flow);
  if (!saved) return state;
  state.analysis = saved.analysis;
  state.freeText = saved.freeText ?? saved.analysis?.freeText;
  state.totals = saved.totals;
  state.totalMs = saved.totalMs;
  state.classificationMetrics = saved.classificationMetrics;
  state.replyMetrics = saved.replyMetrics;
  state.steps = flow.steps.map((step, stepIndex) => {
    const stored = saved.steps?.find((item) => item.stepIndex === stepIndex && item.stepId === step.id);
    const legacyDone = step.role === "decide" ? Boolean(saved.analysis) : Boolean(saved.freeText && Object.keys(saved.freeText).length);
    return {
      stepIndex, stepId: step.id, role: step.role,
      modelName: stored?.modelName ?? step.modelId,
      status: stored || legacyDone ? "done" as const : "idle" as const,
      ms: stored?.ms ?? (step.role === "decide" ? saved.classificationMs : saved.replyMs),
      metrics: stored?.metrics ?? (step.role === "decide" ? saved.classificationMetrics : saved.replyMetrics),
    };
  });
  if (saved.error) state.error = { step: "", code: "internal", message: saved.error };
  return state;
}

function RaceTrack({ flows, states }: { flows: Flow[]; states: Record<string, FlowState> }) {
  return <div className="flex h-[3px] w-full gap-px">{flows.map((flow, i) => <div key={flow.id} className="h-full flex-1 bg-track"><div className={`h-full ${ACCENT[FLOW_ACCENTS[i % FLOW_ACCENTS.length]].barBg} transition-[width] duration-500`} style={{ width: `${flowProgress(states[flow.id] ?? emptyFlowState(flow)) * 100}%` }} /></div>)}</div>;
}

function AppShell({ children, projects, projectId, onProjectSelect, onNewProject, onManageFlows, onSettings, tracked, states }: {
  children: React.ReactNode; projects: Project[]; projectId?: string; onProjectSelect: (id: string) => void;
  onNewProject: () => void; onManageFlows: () => void; onSettings: () => void;
  tracked?: Flow[]; states: Record<string, FlowState>;
}) {
  return <div className="flex h-dvh flex-col overflow-hidden">
    <header className="shrink-0 border-b border-line bg-panel">
      <div className="flex h-14 items-center justify-between gap-2 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="shrink-0 font-display text-base font-bold text-ink">Flow Race</h1>
          {projects.length > 0 && <>
            <select aria-label="Current project" value={projectId ?? ""} onChange={(e) => onProjectSelect(e.target.value)} className="max-w-32 min-w-0 truncate rounded-md border border-line bg-paper px-2 py-1 font-mono text-xs text-ink-soft sm:max-w-48">{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <button onClick={onNewProject} aria-label="New project" className="rounded border border-line px-1.5 text-sm text-ink-soft">+</button>
            <button onClick={onManageFlows} className="whitespace-nowrap rounded border border-line px-2 py-1 font-mono text-[11px] text-accent-b">Manage flows</button>
          </>}
        </div>
        <div className="flex gap-2"><button onClick={onSettings} aria-label="Settings" className="rounded-lg border border-line px-2 py-1 text-sm text-ink-soft">Settings</button><ThemeToggle /></div>
      </div>
      {tracked && <RaceTrack flows={tracked} states={states} />}
    </header>
    <div className="flex min-h-0 flex-1 overflow-hidden">{children}</div>
  </div>;
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [states, setStates] = useState<Record<string, FlowState>>({});
  const [viewingSession, setViewingSession] = useState<SessionFull | null>(null);
  const [viewingFlows, setViewingFlows] = useState<Flow[]>([]);
  const [viewingSchema, setViewingSchema] = useState<OutputSchema | null>(null);
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [scoreboard, setScoreboard] = useState<ScoreboardData>(emptyScoreboard);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const projectIdRef = useRef<string | null>(null);

  const loadFlows = useCallback(async (projectId: string) => {
    const data = await fetch(`/api/projects/${encodeURIComponent(projectId)}/flows`).then((res) => res.json());
    const list = (data.flows ?? []) as Flow[];
    setFlows(list);
    let saved: string[] | null = null;
    try { saved = JSON.parse(localStorage.getItem(`flow-race:selected:${projectId}`) ?? "null") as string[] | null; }
    catch { /* Invalid local preference: use all project flows. */ }
    const valid = Array.isArray(saved) ? saved.filter((id) => list.some((flow) => flow.id === id)) : [];
    setSelectedIds(valid.length >= 2 ? valid : list.map((flow) => flow.id));
    setStates(Object.fromEntries(list.map((flow) => [flow.id, emptyFlowState(flow)])));
  }, []);

  const loadProjects = useCallback(async (preferId?: string) => {
    const data = await fetch("/api/projects").then((res) => res.json());
    const list = (data.projects ?? []) as Project[];
    setProjects(list);
    const active = list.find((item) => item.id === (preferId ?? projectIdRef.current)) ?? list[0];
    if (active) { projectIdRef.current = active.id; setProject(active); await loadFlows(active.id); }
  }, [loadFlows]);

  useEffect(() => {
    const timer = setTimeout(() => { void loadProjects(); }, 0);
    void fetch("/api/models").then((res) => res.json()).then((data) => setModels(data.models ?? []));
    return () => clearTimeout(timer);
  }, [loadProjects]);

  const switchProject = async (id: string) => {
    const p = projects.find((item) => item.id === id);
    if (!p) return;
    projectIdRef.current = id;
    setProject(p); setViewingSession(null); setViewingSchema(null); setText(""); setError(""); setScoreboard(emptyScoreboard(id));
    setHistoryVersion((v) => v + 1);
    await loadFlows(id);
  };

  const applyEvent = (event: RaceEvent) => {
    if (event.type === "run_done") {
      setRunning(false);
      void fetch(`/api/scoreboard?project=${encodeURIComponent(projectIdRef.current ?? "")}`).then((r) => r.json()).then(setScoreboard);
      setHistoryVersion((v) => v + 1);
      return;
    }
    setStates((current) => {
      const previous = current[event.flow];
      if (!previous) return current;
      let updated: FlowState = { ...previous };
      if (event.type === "step_start") {
        updated.steps = previous.steps.map((step) => step.stepIndex === event.stepIndex ? { ...step, status: "running", modelName: event.modelName, startedAt: event.at } : step);
      } else if (event.type === "step_done") {
        updated.steps = previous.steps.map((step) => step.stepIndex === event.stepIndex ? { ...step, status: "done", ms: event.ms, metrics: event.metrics } : step);
        if (event.role === "decide") { updated.analysis = event.data; updated.classification = { status: "done", ms: event.ms }; }
        else { updated.freeText = { ...updated.freeText, ...event.freeText }; updated.reply = { status: "done", ms: event.ms }; }
      } else if (event.type === "flow_done") {
        updated = { ...updated, totalMs: event.totalMs, totals: event.totals };
      } else if (event.type === "flow_error") {
        updated.steps = previous.steps.map((step) => step.stepIndex === event.stepIndex ? { ...step, status: "error" } : step);
        updated.error = { step: event.stepId, code: event.code, message: event.message };
      }
      return { ...current, [event.flow]: updated };
    });
  };

  const run = async () => {
    if (!project || running || !text.trim() || selectedIds.length < 2) return;
    setRunning(true); setError(""); setViewingSession(null);
    const selected = flows.filter((flow) => selectedIds.includes(flow.id));
    setStates(Object.fromEntries(selected.map((flow) => [flow.id, emptyFlowState(flow)])));
    localStorage.setItem(`flow-race:selected:${project.id}`, JSON.stringify(selectedIds));
    try {
      const res = await fetch("/api/race", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text.trim(), projectId: project.id, flowIds: selectedIds }) });
      if (!res.ok || !res.body) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) applyEvent(JSON.parse(line) as RaceEvent);
      }
      if (buffer.trim()) applyEvent(JSON.parse(buffer) as RaceEvent);
      setRunning(false);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setRunning(false); }
  };

  const loadSession = (session: SessionFull) => {
    if (session.type !== "single") return;
    const schema = session.schemaSnapshot ?? project?.outputSchema ?? [];
    const result = session.result as { flowIds?: string[]; flowSnapshot?: Flow[]; flows?: Record<string, SavedFlow> };
    const ids = result.flowIds ?? Object.keys(result.flows ?? {});
    const shown = ids.map((id) => result.flowSnapshot?.find((flow) => flow.id === id)
      ?? flows.find((flow) => flow.id === id)
      ?? legacyFlow(id, schema, session.projectId ?? project?.id ?? "", session.createdAt));
    setViewingSession(session); setViewingSchema(schema); setViewingFlows(shown);
    setStates(Object.fromEntries(shown.map((flow) => [flow.id, hydrate(flow, result.flows?.[flow.id])])));
    setSidebarOpen(false); setError("");
  };

  const reset = (clearText = false) => {
    setViewingSession(null); setViewingSchema(null); setViewingFlows([]); setStates(Object.fromEntries(flows.map((flow) => [flow.id, emptyFlowState(flow)])));
    setScoreboard(emptyScoreboard(project?.id)); setError(""); if (clearText) setText(""); setSidebarOpen(false);
  };

  const shown = viewingSession ? viewingFlows : flows.filter((flow) => selectedIds.includes(flow.id));
  const schema = viewingSchema ?? project?.outputSchema ?? [];
  const rows = shown.map((flow) => ({ flow, state: states[flow.id] ?? emptyFlowState(flow) }));
  const sidebar = <SessionSidebar activeId={viewingSession?.id ?? null} onSelect={loadSession} onNew={() => reset(true)} refreshKey={historyVersion} projectId={project?.id} />;

  return <AppShell projects={projects} projectId={project?.id} onProjectSelect={(id) => void switchProject(id)} onNewProject={() => setNewProjectOpen(true)} onManageFlows={() => setManagerOpen(true)} onSettings={() => setSettingsOpen(true)} tracked={viewingSession ? undefined : shown} states={states}>
    <div className="hidden min-h-0 sm:flex sm:items-stretch">{sidebar}</div>
    {sidebarOpen && <div className="fixed inset-0 z-40 sm:hidden"><div className="absolute inset-0 bg-ink/40" onClick={() => setSidebarOpen(false)} /><div className="animate-modal absolute inset-y-0 left-0">{sidebar}</div></div>}
    <main className="min-w-0 flex-1 overflow-y-auto"><div className="mx-auto max-w-[1600px] space-y-6 px-6 pb-16 pt-8 sm:px-10 lg:px-12">
      {viewingSession ? <>
        <button className="font-mono text-xs text-accent-b" onClick={() => reset()}>← Back to live race</button>
        <div><h2 className="font-display text-xl font-semibold text-ink">{viewingSession.label}</h2><p className="font-mono text-xs text-muted">{new Date(viewingSession.createdAt).toLocaleString()}</p></div>
        <div className="rounded-xl border border-line bg-panel p-5 text-sm text-ink"><p className="mb-2 font-mono text-[10px] uppercase text-muted">Input</p>{(viewingSession.input as { text?: string })?.text ?? ""}</div>
      </> : <>
        <button className="rounded-md border border-line px-3 py-1 text-xs text-ink sm:hidden" onClick={() => setSidebarOpen(true)}>History</button>
        <section className="rounded-xl border border-line bg-panel p-4"><div className="mb-3 flex items-center justify-between gap-2"><h2 className="font-display text-sm font-semibold text-ink">Select flows to race</h2><span className="font-mono text-xs text-muted">{selectedIds.length} selected · minimum 2</span></div>
          {flows.length === 0 ? <p className="text-sm text-muted">No flows yet. Open Manage flows to create one.</p> : <div className="flex flex-wrap gap-2">{flows.map((flow) => <label key={flow.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink"><input type="checkbox" checked={selectedIds.includes(flow.id)} disabled={running} onChange={(e) => setSelectedIds((prev) => e.target.checked ? [...prev, flow.id] : prev.filter((id) => id !== flow.id))} />{flow.name}</label>)}</div>}
        </section>
        <InputCard text={text} running={running} onTextChange={setText} onRun={() => void run()} inputLabel={project?.inputLabel} selectedCount={selectedIds.length} />
      </>}
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">{rows.map(({ flow, state }, i) => <FlowColumn key={flow.id} accent={FLOW_ACCENTS[i % FLOW_ACCENTS.length]} title={flow.name} subtitle={flow.steps.map((step) => `${step.modelId} — ${step.role}`).join(" → ")} state={state} schema={schema} project={project} flow={flow} models={models} />)}</div>
      <ComparisonStrip flows={rows} fields={compareFields(schema)} />
      {!viewingSession && <Scoreboard data={scoreboard} />}
    </div></main>
    <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} project={project} onProjectChange={() => void loadProjects()} />
    <FlowManager open={managerOpen} project={project} onClose={() => setManagerOpen(false)} onChange={() => { if (project) void loadFlows(project.id); }} />
    <NewProjectModal open={newProjectOpen} onClose={() => setNewProjectOpen(false)} onCreated={(id) => {
      setViewingSession(null); setViewingSchema(null); setText(""); setError(""); setScoreboard(emptyScoreboard(id));
      setHistoryVersion((v) => v + 1); void loadProjects(id);
    }} />
  </AppShell>;
}

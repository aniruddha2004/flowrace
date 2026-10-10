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
import type { SessionFull, SessionSummary } from "@/lib/sessions";
import { ComparisonStrip } from "@/components/ComparisonStrip";
import { FLOW_ACCENTS, ACCENT } from "@/components/FieldRow";
import { FlowColumn } from "@/components/FlowColumn";
import { FlowManager } from "@/components/FlowManager";
import { InputCard } from "@/components/InputCard";
import { ModelsRegistry } from "@/components/ModelsRegistry";
import { NewProjectModal } from "@/components/NewProjectModal";
import { Scoreboard, emptyScoreboard, type ScoreboardData } from "@/components/Scoreboard";
import { SessionSidebar } from "@/components/SessionSidebar";
import { SettingsPanel } from "@/components/SettingsPanel";
import { WorkbenchShell, type WorkbenchView } from "@/components/WorkbenchShell";
import { ProjectsHome, ProjectOverview } from "@/components/WorkspaceViews";
import { DatasetsWorkspace } from "@/components/DatasetsWorkspace";
import { EvaluationWorkspace } from "@/components/EvaluationWorkspace";
import type { Dataset } from "@/lib/datasets";

interface SavedFlow {
  analysis?: FlowAnalysis; freeText?: Record<string, string>; steps?: StoredStep[]; totalMs?: number;
  totals?: StepMetrics; classificationMetrics?: StepMetrics; classificationMs?: number;
  replyMetrics?: StepMetrics; replyMs?: number; error?: string;
}

function legacyFlow(id: string, schema: OutputSchema, projectId: string, createdAt: string): Flow {
  const decide = id === "A" ? "kimi-k3" : "jev";
  return { id, name: id === "A" ? "LLM only" : "Jev hybrid", projectId, createdAt, steps: [
    { id: "decide", modelId: decide, role: "decide", ownsFields: schema.filter((field) => field.type !== "free_text").map((field) => field.key), seesPriorStepOutput: false },
    { id: "generate", modelId: "kimi-k3", role: "generate", ownsFields: schema.filter((field) => field.type === "free_text").map((field) => field.key), seesPriorStepOutput: true },
  ] };
}

function hydrate(flow: Flow, saved?: SavedFlow): FlowState {
  const state = emptyFlowState(flow);
  if (!saved) return state;
  state.analysis = saved.analysis; state.freeText = saved.freeText ?? saved.analysis?.freeText;
  state.totals = saved.totals; state.totalMs = saved.totalMs;
  state.classificationMetrics = saved.classificationMetrics; state.replyMetrics = saved.replyMetrics;
  state.steps = flow.steps.map((step, stepIndex) => {
    const stored = saved.steps?.find((item) => item.stepIndex === stepIndex && item.stepId === step.id);
    const legacyDone = step.role === "decide" ? Boolean(saved.analysis) : Boolean(saved.freeText && Object.keys(saved.freeText).length);
    return { stepIndex, stepId: step.id, role: step.role, modelName: stored?.modelName ?? step.modelId,
      status: stored || legacyDone ? "done" as const : "idle" as const,
      ms: stored?.ms ?? (step.role === "decide" ? saved.classificationMs : saved.replyMs),
      metrics: stored?.metrics ?? (step.role === "decide" ? saved.classificationMetrics : saved.replyMetrics),
    };
  });
  if (saved.error) state.error = { step: "", code: "internal", message: saved.error };
  return state;
}

function ResultGrid({ rows, schema, project, models }: {
  rows: Array<{ flow: Flow; state: FlowState }>; schema: OutputSchema; project: Project; models: ModelRow[];
}) {
  const columns = rows.length === 3 ? "xl:grid-cols-3" : rows.length >= 4 ? "2xl:grid-cols-4" : "";
  return <div className={`grid gap-4 md:grid-cols-2 ${columns}`}>{rows.map(({ flow, state }, index) => <FlowColumn key={flow.id} accent={FLOW_ACCENTS[index % FLOW_ACCENTS.length]} title={flow.name} subtitle={flow.steps.map((step) => `${step.modelId} · ${step.role}`).join(" → ")} state={state} schema={schema} project={project} flow={flow} models={models} />)}</div>;
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [states, setStates] = useState<Record<string, FlowState>>({});
  const [view, setView] = useState<WorkbenchView>("home");
  const [flowCounts, setFlowCounts] = useState<Record<string, number>>({});
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [viewingSession, setViewingSession] = useState<SessionFull | null>(null);
  const [viewingFlows, setViewingFlows] = useState<Flow[]>([]);
  const [viewingSchema, setViewingSchema] = useState<OutputSchema | null>(null);
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [scoreboard, setScoreboard] = useState<ScoreboardData>(emptyScoreboard);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [evaluationDataset, setEvaluationDataset] = useState<Dataset | null>(null);
  const projectIdRef = useRef<string | null>(null);
  const activeProjectId = project?.id;

  const loadFlows = useCallback(async (projectId: string) => {
    const data = await fetch(`/api/projects/${encodeURIComponent(projectId)}/flows`).then((res) => res.json());
    const list = (data.flows ?? []) as Flow[];
    setFlows(list); setFlowCounts((previous) => ({ ...previous, [projectId]: list.length }));
    let saved: string[] | null = null;
    try { saved = JSON.parse(localStorage.getItem(`flow-race:selected:${projectId}`) ?? "null") as string[] | null; }
    catch { /* Invalid local preference: use all project flows. */ }
    const valid = Array.isArray(saved) ? saved.filter((id) => list.some((flow) => flow.id === id)) : [];
    setSelectedIds(valid.length >= 2 ? valid : list.map((flow) => flow.id));
    setStates(Object.fromEntries(list.map((flow) => [flow.id, emptyFlowState(flow)])));
  }, []);

  const refreshSessions = useCallback(async () => {
    const data = await fetch("/api/sessions").then((res) => res.json());
    setSessions(data.sessions ?? []);
  }, []);

  const loadProjects = useCallback(async (preferId?: string) => {
    const data = await fetch("/api/projects").then((res) => res.json());
    const list = (data.projects ?? []) as Project[];
    setProjects(list);
    const active = list.find((item) => item.id === (preferId ?? projectIdRef.current)) ?? list[0];
    if (active) { projectIdRef.current = active.id; setProject(active); await loadFlows(active.id); }
    void Promise.all(list.map(async (item) => {
      const result = await fetch(`/api/projects/${encodeURIComponent(item.id)}/flows`).then((res) => res.json());
      return [item.id, (result.flows ?? []).length] as const;
    })).then((counts) => setFlowCounts(Object.fromEntries(counts)));
  }, [loadFlows]);

  useEffect(() => {
    const timer = setTimeout(() => { void loadProjects(); void refreshSessions(); }, 0);
    void fetch("/api/models").then((res) => res.json()).then((data) => setModels(data.models ?? []));
    return () => clearTimeout(timer);
  }, [loadProjects, refreshSessions]);

  useEffect(() => {
    if (!activeProjectId) return;
    const timer = setTimeout(() => { void fetch(`/api/scoreboard?project=${encodeURIComponent(activeProjectId)}`).then((res) => res.json()).then(setScoreboard); }, 0);
    return () => clearTimeout(timer);
  }, [activeProjectId]);

  const switchProject = async (id: string) => {
    const next = projects.find((item) => item.id === id);
    if (!next) return;
    projectIdRef.current = id; setProject(next); setView("overview");
    setEvaluationDataset(null);
    setViewingSession(null); setViewingSchema(null); setText(""); setError(""); setScoreboard(emptyScoreboard(id));
    setHistoryVersion((version) => version + 1);
    await loadFlows(id);
  };

  const navigate = (next: WorkbenchView) => {
    if (next === "race" && view === "history") { setViewingSession(null); setViewingSchema(null); }
    setView(next);
  };

  const applyEvent = (event: RaceEvent) => {
    if (event.type === "run_done") {
      setRunning(false);
      void fetch(`/api/scoreboard?project=${encodeURIComponent(projectIdRef.current ?? "")}`).then((res) => res.json()).then(setScoreboard);
      void refreshSessions(); setHistoryVersion((version) => version + 1); return;
    }
    setStates((current) => {
      const previous = current[event.flow];
      if (!previous) return current;
      let updated: FlowState = { ...previous };
      if (event.type === "step_start") updated.steps = previous.steps.map((step) => step.stepIndex === event.stepIndex ? { ...step, status: "running", modelName: event.modelName, startedAt: event.at } : step);
      else if (event.type === "step_done") {
        updated.steps = previous.steps.map((step) => step.stepIndex === event.stepIndex ? { ...step, status: "done", ms: event.ms, metrics: event.metrics } : step);
        if (event.role === "decide") { updated.analysis = event.data; updated.classification = { status: "done", ms: event.ms }; }
        else { updated.freeText = { ...updated.freeText, ...event.freeText }; updated.reply = { status: "done", ms: event.ms }; }
      } else if (event.type === "flow_done") updated = { ...updated, totalMs: event.totalMs, totals: event.totals };
      else if (event.type === "flow_error") {
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
      const reader = res.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
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
    setView("history"); setError("");
  };

  const reset = (clearText = false) => {
    setViewingSession(null); setViewingSchema(null); setViewingFlows([]);
    setStates(Object.fromEntries(flows.map((flow) => [flow.id, emptyFlowState(flow)])));
    setError(""); if (clearText) setText("");
  };

  const selected = flows.filter((flow) => selectedIds.includes(flow.id));
  const raceRows = selected.map((flow) => ({ flow, state: states[flow.id] ?? emptyFlowState(flow) }));
  const historyRows = viewingFlows.map((flow) => ({ flow, state: states[flow.id] ?? emptyFlowState(flow) }));
  const historySchema = viewingSchema ?? project?.outputSchema ?? [];

  return <WorkbenchShell projects={projects} project={project} view={view} onProject={(id) => void switchProject(id)} onView={navigate} onNewProject={() => setNewProjectOpen(true)}>
    {view === "home" && <ProjectsHome projects={projects} flowCounts={flowCounts} sessions={sessions} onOpen={(id) => void switchProject(id)} onCreate={() => setNewProjectOpen(true)} />}
    {(view === "models" || view === "providers") && <ModelsRegistry section={view} onChanged={() => void fetch("/api/models").then((res) => res.json()).then((data) => setModels(data.models ?? []))} />}
    {view === "settings" && <SettingsPanel />}
    {project && view === "overview" && <ProjectOverview key={project.id} project={project} flows={flows} sessions={sessions} onChanged={() => void loadProjects(project.id)} onViewFlows={() => setView("flows")} onViewRace={() => setView("race")} />}
    {project && (view === "flows" || view === "builder") && <FlowManager key={project.id} project={project} initialFlows={flows} initialModels={models} onChange={() => void loadFlows(project.id)} onRace={() => setView("race")} />}
    {project && view === "datasets" && <DatasetsWorkspace key={project.id} project={project} onEvaluate={(dataset) => { setEvaluationDataset(dataset); setView("evaluations"); }} />}
    {project && view === "evaluations" && <EvaluationWorkspace key={project.id} project={project} flows={flows} initialDataset={evaluationDataset} onViewDatasets={() => setView("datasets")} />}
    {project && view === "race" && <div className="ui-page">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="ui-kicker mb-2">{project.name} / LIVE COMPARISON</p><h1 className="font-display text-3xl font-semibold tracking-[-.05em] text-ink sm:text-[2.6rem]">Race pipelines</h1><p className="mt-2 text-sm text-ink-soft">One input. Multiple approaches. Every step visible as it runs.</p></div><span className="rounded-md border border-line bg-panel px-3 py-2 font-mono text-xs text-ink-soft">{flows.length} available flows</span></div>
      <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(260px,.8fr)_minmax(0,1.2fr)]"><section className="ui-surface p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-display text-base font-semibold text-ink">Select competitors</h2><span className="font-mono text-xs text-muted">{selectedIds.length} selected · min 2</span></div><div className="flex flex-wrap gap-2">{flows.map((flow, index) => <label key={flow.id} className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2.5 text-sm transition-colors ${selectedIds.includes(flow.id) ? "border-brand bg-brand-soft text-brand" : "border-line text-ink-soft hover:border-brand/50"}`}><input type="checkbox" className="accent-[#345beb]" checked={selectedIds.includes(flow.id)} disabled={running} onChange={(e) => setSelectedIds((previous) => e.target.checked ? [...previous, flow.id] : previous.filter((id) => id !== flow.id))} /><span className={`h-2 w-2 rounded-full ${ACCENT[FLOW_ACCENTS[index % FLOW_ACCENTS.length]].dotBg}`} />{flow.name}</label>)}{flows.length === 0 && <p className="text-sm text-muted">No flows yet. <button className="font-semibold text-brand hover:underline" onClick={() => setView("flows")}>Build a flow</button> to get started.</p>}</div></section>
        <InputCard text={text} running={running} onTextChange={setText} onRun={() => void run()} inputLabel={project.inputLabel} selectedCount={selectedIds.length} />
      </div>
      {error && <p role="alert" className="mb-5 rounded-md border border-bad/30 bg-bad-soft p-4 text-sm text-bad">{error}</p>}
      {selected.length > 0 && <><div className="mb-3 flex items-center justify-between"><h2 className="font-display text-lg font-semibold text-ink">Live results</h2><span className="font-mono text-xs text-ink-soft">{running ? "● Racing now" : raceRows.some(({ state }) => state.totals) ? "Race complete" : "Ready when you are"}</span></div><div className="mb-5 flex h-[3px] gap-1">{selected.map((flow, index) => <div key={flow.id} className="h-full flex-1 overflow-hidden rounded-full bg-track"><div className={`h-full ${ACCENT[FLOW_ACCENTS[index % FLOW_ACCENTS.length]].barBg} transition-[width] duration-500`} style={{ width: `${flowProgress(states[flow.id] ?? emptyFlowState(flow)) * 100}%` }} /></div>)}</div><ResultGrid rows={raceRows} schema={project.outputSchema} project={project} models={models} /></>}
      <div className="mt-7 space-y-5"><ComparisonStrip flows={raceRows} fields={compareFields(project.outputSchema)} /><Scoreboard data={scoreboard} /></div>
    </div>}
    {project && view === "history" && <div className="ui-page"><div className="mb-8"><p className="ui-kicker mb-2">{project.name} / RUN LOG</p><h1 className="font-display text-3xl font-semibold tracking-[-.05em] text-ink sm:text-[2.6rem]">History</h1><p className="mt-2 text-sm text-ink-soft">A record of inputs, pipeline results, and decisions at the time of each race.</p></div><div className="grid items-start gap-5 lg:grid-cols-[270px_minmax(0,1fr)]"><SessionSidebar activeId={viewingSession?.id ?? null} onSelect={loadSession} onNew={() => { reset(true); setView("race"); }} refreshKey={historyVersion} projectId={project.id} />
      {viewingSession ? <div className="min-w-0 space-y-5"><div className="ui-surface p-5"><p className="font-mono text-xs text-muted">{new Date(viewingSession.createdAt).toLocaleString()}</p><h2 className="mt-2 font-display text-lg font-semibold text-ink">{viewingSession.label}</h2><p className="mt-4 border-t border-line pt-4 text-sm leading-relaxed text-ink-soft">{(viewingSession.input as { text?: string })?.text ?? ""}</p></div><ResultGrid rows={historyRows} schema={historySchema} project={project} models={models} /><ComparisonStrip flows={historyRows} fields={compareFields(historySchema)} /></div> : <div className="ui-surface flex min-h-[300px] flex-col items-center justify-center p-8 text-center"><span className="font-display text-3xl text-brand">◫</span><h2 className="mt-3 font-display text-lg font-semibold text-ink">Select a run to inspect</h2><p className="mt-2 max-w-sm text-sm text-ink-soft">The output schema and flow definitions from that moment are preserved alongside the results.</p></div>}</div></div>}
    <NewProjectModal open={newProjectOpen} onClose={() => setNewProjectOpen(false)} onCreated={(id) => { setViewingSession(null); setViewingSchema(null); setText(""); setError(""); setScoreboard(emptyScoreboard(id)); setHistoryVersion((v) => v + 1); void loadProjects(id).then(() => setView("overview")); }} />
  </WorkbenchShell>;
}

"use client";

import { useState } from "react";
import type { Project } from "@/lib/projects";
import type { Flow } from "@/lib/flows";
import type { SessionSummary } from "@/lib/sessions";
import { SchemaTab } from "./SchemaTab";

export function ProjectsHome({ projects, flowCounts, sessions, onOpen, onCreate }: {
  projects: Project[]; flowCounts: Record<string, number>; sessions: SessionSummary[];
  onOpen: (id: string) => void; onCreate: () => void;
}) {
  const totalFlows = Object.values(flowCounts).reduce((sum, count) => sum + count, 0);
  return <div className="ui-page">
    <header className="mb-8 border-b border-line pb-8">
      <p className="ui-kicker mb-3">WORKSPACE / PROJECTS</p>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-[-.05em] text-ink sm:text-[2.6rem]">Your projects<span className="ml-3 align-middle font-mono text-base font-normal text-muted">{projects.length.toString().padStart(2, "0")}</span></h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">Define the problem. Compose a pipeline. Let the results decide.</p>
        </div>
        <button className="ui-button ui-button-primary" onClick={onCreate}>+ New project</button>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-soft">
        <span className="inline-flex items-center gap-2 font-medium text-good"><span className="h-1.5 w-1.5 rounded-full bg-good" aria-hidden />Workbench ready</span>
        <span className="h-3 w-px bg-line" aria-hidden />
        <span><strong className="font-mono text-ink">{totalFlows}</strong> registered flows</span>
        <span><strong className="font-mono text-ink">{sessions.length}</strong> recent races</span>
      </div>
    </header>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,.72fr)]">
      <section aria-label="Projects" className="grid gap-4 md:grid-cols-2">
        {projects.map((item, index) => {
          const latest = sessions.find((session) => session.projectId === item.id);
          return <button key={item.id} onClick={() => onOpen(item.id)} className="group ui-surface relative flex min-h-[288px] flex-col overflow-hidden p-5 text-left transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-brand/45 hover:shadow-soft sm:p-6">
            <span className="absolute inset-x-0 top-0 h-[2px] scale-x-0 bg-brand transition-transform duration-300 group-hover:scale-x-100" aria-hidden />
            <div className="flex items-start justify-between"><span className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-brand-soft font-display text-lg font-semibold text-brand">{item.name.charAt(0).toUpperCase()}</span><span className="font-mono text-[11px] text-muted">PROJECT / {String(index + 1).padStart(2, "0")}</span></div>
            <h2 className="mt-5 flex items-center gap-1.5 font-display text-lg font-semibold tracking-[-.03em] text-ink">{item.name}<span className="inline-block text-brand opacity-0 transition-[opacity,transform] group-hover:translate-x-1 group-hover:opacity-100" aria-hidden="true">↗</span></h2>
            <p className="mt-1 line-clamp-2 min-h-10 text-sm leading-relaxed text-ink-soft">{item.taskDescription || "Define the task for this project."}</p>
            <div className="mt-auto grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 border-t border-line pt-4 text-center"><span><strong className="block font-mono text-sm text-ink">{item.outputSchema.length}</strong><span className="text-[11px] text-muted">fields</span></span><span className="h-px w-3 bg-line" aria-hidden /><span><strong className="block font-mono text-sm text-ink">{flowCounts[item.id] ?? 0}</strong><span className="text-[11px] text-muted">flows</span></span><span className="h-px w-3 bg-line" aria-hidden /><span><strong className="block font-mono text-sm text-ink">{sessions.filter((session) => session.projectId === item.id).length}</strong><span className="text-[11px] text-muted">runs</span></span></div>
            <p className="mt-3 truncate text-center font-mono text-[10px] text-muted">{latest ? `Last raced ${new Date(latest.createdAt).toLocaleString()}` : "Ready for a first race"}</p>
          </button>;
        })}
        {projects.length === 0 && <div className="ui-surface col-span-full p-10 text-center"><p className="font-display text-lg text-ink">Begin with a project</p><p className="mt-2 text-sm text-muted">Every pipeline needs a problem to solve.</p></div>}
      </section>
      <aside className="instrument-grid relative overflow-hidden rounded-[12px] border border-[#304669] bg-[#1b2b46] p-6 text-[#edf3ff] dark:border-line">
        <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 translate-x-12 -translate-y-10 rounded-full border border-white/15" aria-hidden />
        <div className="relative flex items-center justify-between"><h2 className="font-display text-base font-semibold">Recent activity</h2><span className="font-mono text-[10px] text-white/55">RUN LOG</span></div>
        <p className="relative mt-2 max-w-xs text-xs leading-relaxed text-[#b4c4df]">Live experiments become evidence. Pick up where your last race left off.</p>
        <div className="relative mt-6 divide-y divide-white/10 border-t border-white/10">{sessions.slice(0, 5).map((session) => <div key={session.id} className="flex gap-3 py-3"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#88d4c4]" aria-hidden /><div className="min-w-0"><p className="truncate text-xs font-medium text-[#edf3ff]" title={session.label}>{session.label}</p><p className="mt-1 truncate font-mono text-[10px] text-[#9aaccb]">{projects.find((item) => item.id === session.projectId)?.name ?? "Project"} · {new Date(session.createdAt).toLocaleString()}</p></div></div>)}{sessions.length === 0 && <p className="py-8 text-sm text-[#b4c4df]">No races yet. Run a flow to start building a history.</p>}</div>
        <div className="relative mt-4 flex items-center gap-2 border-t border-white/10 pt-4 font-mono text-[10px] text-[#9aaccb]"><span className="h-px w-6 bg-[#88d4c4]" aria-hidden /> {sessions.length} recent runs recorded</div>
      </aside>
    </div>
  </div>;
}

export function ProjectOverview({ project, flows, sessions, onChanged, onViewFlows, onViewRace }: {
  project: Project; flows: Flow[]; sessions: SessionSummary[]; onChanged: () => void;
  onViewFlows: () => void; onViewRace: () => void;
}) {
  const [editingSchema, setEditingSchema] = useState(false);
  const [persona, setPersona] = useState(project.personaContext);
  const [saving, setSaving] = useState(false);
  const latest = sessions.find((session) => session.projectId === project.id);
  const updatePersona = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personaContext: persona }) });
      if (res.ok) onChanged();
    } finally { setSaving(false); }
  };
  return <div className="ui-page">
    <p className="ui-kicker mb-2">PROJECT / {project.id}</p>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="font-display text-3xl font-semibold tracking-[-.05em] text-ink sm:text-[2.6rem]">{project.name}</h1><p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">{project.taskDescription || "Define a task description to get started."}</p></div><button className="ui-button ui-button-primary" onClick={onViewRace}>Open race <span aria-hidden>↗</span></button></div>
    <div className="mt-8 grid gap-3 sm:grid-cols-3">{[
      ["Output fields", `${project.outputSchema.length}`, "Defined in the project schema"],
      ["Pipelines", `${flows.length}`, "Available to race"],
      ["Last raced", latest ? new Date(latest.createdAt).toLocaleDateString() : "—", latest ? "Most recent saved run" : "No runs yet"],
    ].map(([label, value, hint]) => <div key={label} className="ui-surface p-5"><p className="text-xs text-ink-soft">{label}</p><p className="mt-2 font-display text-2xl font-semibold tracking-[-.04em] text-ink">{value}</p><p className="mt-1 text-xs text-muted">{hint}</p></div>)}</div>
    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)]">
      <section className="ui-surface overflow-hidden"><div className="flex items-center justify-between border-b border-line px-6 py-5"><div><h2 className="font-display text-base font-semibold text-ink">Output contract</h2><p className="mt-1 text-xs text-ink-soft">The fields every flow must produce</p></div><button className="ui-button" onClick={() => setEditingSchema((value) => !value)}>{editingSchema ? "Done editing" : "Edit schema"}</button></div>
        {editingSchema ? <div className="p-5 sm:p-6"><SchemaTab key={project.id} project={project} onChanged={onChanged} /></div> : <div className="divide-y divide-line">{project.outputSchema.map((field) => <div key={field.key} className="flex flex-wrap items-center justify-between gap-2 px-6 py-3.5"><div><span className="text-sm font-medium text-ink">{field.label}</span><code className="ml-2 font-mono text-xs text-muted">{field.key}</code></div><span className="rounded bg-track px-2 py-1 font-mono text-[11px] text-ink-soft">{field.type.replaceAll("_", " ")}</span></div>)}{project.outputSchema.length === 0 && <p className="px-6 py-7 text-sm text-muted">No output fields yet. Add fields to define the result your pipelines should produce.</p>}</div>}
      </section>
      <div className="space-y-6"><section className="ui-surface p-6"><h2 className="font-display text-base font-semibold text-ink">Context for your models</h2><p className="mt-1 text-xs leading-relaxed text-ink-soft">Persona and policy context supplied to this project&apos;s pipelines.</p><textarea aria-label="Project context" className="ui-input mt-4 min-h-44 resize-y leading-relaxed" value={persona} onChange={(event) => setPersona(event.target.value)} placeholder="Describe your domain, audience, and operating guidelines…" /><button className="ui-button mt-3" disabled={saving || persona === project.personaContext} onClick={() => void updatePersona()}>{saving ? "Saving…" : "Save context"}</button></section>
        <section className="ui-surface p-6"><h2 className="font-display text-base font-semibold text-ink">Build the solution</h2><p className="mt-1 text-sm leading-relaxed text-ink-soft">Compose model steps into flows, then compare them on the same input.</p><button className="ui-button mt-4" onClick={onViewFlows}>View {flows.length} flows <span aria-hidden>→</span></button></section></div>
    </div>
  </div>;
}

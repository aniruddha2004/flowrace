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
  return <div className="ui-page">
    <div className="mb-10 flex flex-wrap items-end justify-between gap-5">
      <div><p className="ui-kicker mb-2">WORKSPACE / PROJECTS</p><h1 className="font-display text-3xl font-semibold tracking-[-.05em] text-ink sm:text-[2.6rem]">Your projects<span className="ml-3 align-middle font-mono text-base font-normal text-muted">{projects.length.toString().padStart(2, "0")}</span></h1><p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-soft">Each project defines a problem. Build competing pipelines for it, then see how they perform side by side.</p></div>
      <button className="ui-button ui-button-primary" onClick={onCreate}>+ New project</button>
    </div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {projects.map((item, index) => {
        const latest = sessions.find((session) => session.projectId === item.id);
        return <button key={item.id} onClick={() => onOpen(item.id)} className="group ui-surface flex min-h-[230px] flex-col p-6 text-left transition-[border-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-soft">
          <div className="flex items-start justify-between"><span className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-brand-soft font-display text-lg font-semibold text-brand">{item.name.charAt(0).toUpperCase()}</span><span className="font-mono text-xs text-muted">{String(index + 1).padStart(2, "0")}</span></div>
          <h2 className="mt-5 font-display text-lg font-semibold tracking-[-.03em] text-ink">{item.name}<span className="ml-2 inline-block text-brand opacity-0 transition-[opacity,transform] group-hover:translate-x-1 group-hover:opacity-100" aria-hidden="true">↗</span></h2>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-soft">{item.taskDescription || "Define the task for this project."}</p>
          <div className="mt-auto flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-4 font-mono text-xs text-ink-soft"><span>{item.outputSchema.length} fields</span><span>{flowCounts[item.id] ?? 0} flows</span><span>{latest ? `Raced ${new Date(latest.createdAt).toLocaleString()}` : "Not raced yet"}</span></div>
        </button>;
      })}
      <button onClick={onCreate} className="flex min-h-[230px] flex-col items-center justify-center rounded-[12px] border border-dashed border-line p-6 text-center transition-colors hover:border-brand hover:bg-brand-soft/40"><span className="flex h-10 w-10 items-center justify-center rounded-full border border-line text-xl text-brand">+</span><span className="mt-4 font-display text-sm font-semibold text-ink">Create another project</span><span className="mt-1 text-xs text-muted">Define an input and output schema</span></button>
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

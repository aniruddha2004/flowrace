"use client";

import { useEffect, useState } from "react";
import type { Flow, FlowStep } from "@/lib/flows";
import { validateFlow } from "@/lib/flow-validation";
import type { ModelRow } from "@/lib/models";
import type { Project } from "@/lib/projects";
import { buildState, jevDecisionSpecs } from "@/lib/flows/buildQuestions";
import { buildDecideSystem, buildGenerateSystem } from "@/lib/flows/llmTriage";
import { parseMapping } from "@/lib/http-mapping";

interface Draft { id?: string; name: string; steps: FlowStep[] }

function canGenerate(model: ModelRow): boolean {
  if (model.adapterType === "llm_chat") return true;
  if (model.adapterType !== "custom_http") return false;
  try { return Boolean(parseMapping(model.apiConfig.requestTemplate ?? "").generate); }
  catch { return false; }
}

function defaultPrompt(step: FlowStep, index: number, draft: Draft, project: Project, models: ModelRow[], systemPrompt: string): string {
  const fields = project.outputSchema.filter((field) => step.ownsFields.includes(field.key));
  const st = { project, systemPrompt };
  if (step.role === "generate") {
    const followsDecision = step.seesPriorStepOutput && draft.steps[index - 1]?.role === "decide";
    const constrained = followsDecision && draft.steps[index - 1]?.modelId !== step.modelId;
    return fields.map((field) => {
      const instruction = (constrained ? field.constrainedPrompt : field.generatePrompt) ?? `Write ${field.label}. Output only the text.`;
      return followsDecision ? buildGenerateSystem(st, instruction) : instruction;
    }).join("\n\n");
  }
  if (models.find((m) => m.id === step.modelId)?.adapterType === "system_one") {
    const state = buildState("<input text>", project.personaContext);
    return jevDecisionSpecs(state, fields, project).map((spec) => `${spec.key}: ${spec.instructions}`).join("\n\n");
  }
  return buildDecideSystem([...fields, ...project.outputSchema.filter((field) => field.type === "free_text")], st);
}

export function FlowManager({ project, initialFlows, initialModels, onChange, onRace }: { project: Project; initialFlows: Flow[]; initialModels: ModelRow[]; onChange: () => void; onRace: () => void }) {
  const [flows, setFlows] = useState<Flow[]>(initialFlows);
  const [models, setModels] = useState<ModelRow[]>(initialModels);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch(`/api/projects/${encodeURIComponent(project.id)}/flows`).then((r) => r.json()),
      fetch("/api/models").then((r) => r.json()),
      fetch("/api/config").then((r) => r.json()),
    ]).then(([f, m, config]) => {
      if (active) { setFlows(f.flows ?? []); setModels(m.models ?? []); setSystemPrompt(config.settings?.systemPrompt ?? ""); }
    }).catch(() => { if (active) setError("Could not load flows or models."); });
    return () => { active = false; };
  }, [project.id]);

  const schema = project.outputSchema;
  const errors = draft ? [...(!draft.name.trim() ? ["Flow name is required."] : []), ...validateFlow(draft.steps, schema, models)] : [];
  const owned = new Set(draft?.steps.flatMap((step) => step.ownsFields) ?? []);
  const unowned = schema.filter((field) => !owned.has(field.key));
  const updateStep = (index: number, patch: Partial<FlowStep>) => setDraft((previous) => previous && ({ ...previous, steps: previous.steps.map((step, i) => i === index ? { ...step, ...patch } : step) }));
  const nextStep = () => {
    if (!draft) return;
    const next = unowned[0];
    const role = next?.type === "free_text" ? "generate" : "decide";
    const model = models.find((m) => role === "decide" || canGenerate(m));
    setDraft({ ...draft, steps: [...draft.steps, {
      id: crypto.randomUUID(), modelId: model?.id ?? "", role,
      ownsFields: unowned.filter((field) => (field.type === "free_text") === (role === "generate")).map((field) => field.key),
      seesPriorStepOutput: draft.steps.length > 0,
    }] });
  };
  const save = async () => {
    if (!draft || errors.length || saving) return;
    setSaving(true); setError("");
    try {
      const res = await fetch(draft.id ? `/api/flows/${encodeURIComponent(draft.id)}` : `/api/projects/${encodeURIComponent(project.id)}/flows`, { method: draft.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: draft.name, steps: draft.steps }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Could not save flow."); return; }
      const list = await fetch(`/api/projects/${encodeURIComponent(project.id)}/flows`).then((r) => r.json());
      setFlows(list.flows ?? []); setDraft(null); onChange();
    } catch { setError("Could not save flow."); } finally { setSaving(false); }
  };
  const remove = async (id: string) => {
    if (!window.confirm("Delete this flow? Saved sessions will remain available.")) return;
    const res = await fetch(`/api/flows/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) { setError("Could not delete flow."); return; }
    setFlows((previous) => previous.filter((flow) => flow.id !== id)); onChange();
  };

  return <div className="ui-page">
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="ui-kicker mb-2">{project.name} / PIPELINES</p><h1 className="font-display text-3xl font-semibold tracking-[-.05em] text-ink sm:text-[2.6rem]">{draft ? draft.id ? "Edit pipeline" : "New pipeline" : "Flows"}</h1><p className="mt-2 max-w-2xl text-sm text-ink-soft">{draft ? "Assign models and output fields across an ordered sequence of steps." : "Compose model steps into complete solutions. Every output field belongs to exactly one step."}</p></div><div className="flex flex-wrap gap-2">{draft ? <button className="ui-button" onClick={() => { setDraft(null); setError(""); }}>← All flows</button> : <><button className="ui-button" onClick={onRace}>Open race <span aria-hidden>↗</span></button><button className="ui-button ui-button-primary" onClick={() => setDraft({ name: "", steps: [] })}>+ New flow</button></>}</div></div>
    {error && <p role="alert" className="mb-5 rounded-md border border-bad/30 bg-bad-soft p-4 text-sm text-bad">{error}</p>}
    {!draft ? <div className="grid gap-4 lg:grid-cols-2">{flows.map((flow, index) => <article key={flow.id} className="ui-surface flex flex-col p-6"><div className="flex items-start justify-between"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-soft font-mono text-xs font-semibold text-brand">{String(index + 1).padStart(2, "0")}</span><span className="font-mono text-xs text-muted">{flow.steps.length} steps</span></div><h2 className="mt-4 font-display text-lg font-semibold text-ink">{flow.name}</h2><div className="mt-4 flex flex-wrap items-center gap-2">{flow.steps.map((step, i) => <div key={step.id} className="flex items-center gap-2"><span className={`rounded-[5px] px-2 py-1 text-xs font-medium ${step.role === "decide" ? "bg-decide-soft text-decide" : "bg-generate-soft text-generate"}`}>{models.find((m) => m.id === step.modelId)?.name ?? step.modelId} · {step.role}</span>{i < flow.steps.length - 1 && <span className="text-muted">→</span>}</div>)}</div><div className="mt-7 flex gap-4 border-t border-line pt-4 text-xs font-semibold"><button className="text-brand hover:underline" onClick={() => { setError(""); setDraft({ id: flow.id, name: flow.name, steps: structuredClone(flow.steps) }); }}>Edit flow</button><button className="text-ink-soft hover:text-ink" onClick={() => { setError(""); setDraft({ name: `${flow.name} copy`, steps: structuredClone(flow.steps) }); }}>Duplicate</button><button className="ml-auto text-bad hover:underline" onClick={() => void remove(flow.id)}>Delete</button></div></article>)}{flows.length === 0 && <div className="ui-surface col-span-full py-16 text-center"><p className="font-display text-lg text-ink">No flows yet</p><p className="mt-2 text-sm text-muted">Create a pipeline to start testing this project.</p></div>}</div> : <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0"><div className="ui-surface mb-6 p-5 sm:p-6"><label className="block text-sm font-semibold text-ink">Flow name<input aria-label="Flow name" className="ui-input mt-2" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="A name that distinguishes this approach" /></label></div>
        <div className="relative pl-8 sm:pl-11"><div aria-hidden className="absolute bottom-5 left-[13px] top-5 w-px bg-line sm:left-[19px]" />{draft.steps.map((step, i) => {
          const selected = models.find((m) => m.id === step.modelId);
          const otherOwned = new Set(draft.steps.filter((_, n) => n !== i).flatMap((item) => item.ownsFields));
          const assignable = schema.filter((field) => (field.type === "free_text") === (step.role === "generate") && !otherOwned.has(field.key));
          return <div key={step.id} className="chain-extend relative mb-5"><div className={`absolute -left-8 top-6 z-10 flex h-[27px] w-[27px] items-center justify-center rounded-full border-2 border-panel font-mono text-[10px] font-bold text-white sm:-left-11 sm:h-10 sm:w-10 sm:text-xs ${step.role === "decide" ? "bg-decide" : "bg-generate"}`}>{String(i + 1).padStart(2, "0")}</div>
            <section className="ui-surface overflow-hidden"><div className={`flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 ${step.role === "decide" ? "bg-decide-soft/50" : "bg-generate-soft/50"}`}><div className="flex items-center gap-3"><span aria-hidden className={`flex h-8 w-8 items-center justify-center rounded-md ${step.role === "decide" ? "bg-decide-soft text-decide" : "bg-generate-soft text-generate"}`}>{step.role === "decide" ? "◇" : "≋"}</span><div><h2 className="font-display text-sm font-semibold text-ink">{step.role === "decide" ? "Decide" : "Generate"} <span className="font-normal text-ink-soft">· Step {i + 1}</span></h2><p className="text-xs text-ink-soft">{step.role === "decide" ? "Produce structured values" : "Write free-text output"}</p></div></div><button aria-label={`Remove step ${i + 1}`} onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, n) => n !== i) })} className="text-xs font-medium text-bad hover:underline">Remove step</button></div>
              <div className="space-y-5 p-5 sm:p-6"><div className="grid gap-4 sm:grid-cols-[minmax(0,1.5fr)_minmax(140px,1fr)]"><label className="block text-xs font-semibold text-ink-soft">Model<select aria-label={`Step ${i + 1} model`} className="ui-input mt-2" value={step.modelId} onChange={(e) => { const next = models.find((m) => m.id === e.target.value); if (next?.adapterType === "system_one" && step.role === "generate") setError("System One cannot generate free text. This step was changed to decide; add a generate step for the unowned free-text fields."); else setError(""); updateStep(i, { modelId: e.target.value, role: next?.adapterType === "system_one" ? "decide" : step.role, ownsFields: next?.adapterType === "system_one" && step.role === "generate" ? [] : step.ownsFields }); }}>{models.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.providerId ?? "legacy"} · {m.adapterType.replaceAll("_", " ")} · ${m.pricing.inputPerM}/M in</option>)}</select></label><label className="block text-xs font-semibold text-ink-soft">Role<select aria-label={`Step ${i + 1} role`} className="ui-input mt-2" value={step.role} disabled={selected?.adapterType === "system_one"} onChange={(e) => updateStep(i, { role: e.target.value as FlowStep["role"], ownsFields: [] })}><option value="decide">Decide</option><option value="generate">Generate</option></select></label></div>
                {selected && <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft"><span className={`rounded px-2 py-1 font-mono ${selected.adapterType === "system_one" ? "bg-decide-soft text-decide" : "bg-brand-soft text-brand"}`}>{selected.adapterType.replaceAll("_", " ")}</span><code>{selected.id}</code><span>· ${selected.pricing.inputPerM}/M in · ${selected.pricing.outputPerM}/M out</span></div>}
                {selected?.adapterType === "system_one" && <p className="text-xs text-decide">System One can only decide; it cannot generate free text.</p>}
                <fieldset><legend className="text-xs font-semibold text-ink-soft">Output fields claimed by this step</legend><div className="mt-2 flex flex-wrap gap-2">{assignable.map((field) => <label key={field.key} className={`cursor-pointer rounded-md border px-3 py-2 text-xs font-medium transition-colors ${step.ownsFields.includes(field.key) ? "border-brand bg-brand-soft text-brand" : "border-line text-ink-soft hover:border-brand"}`}><input className="sr-only" type="checkbox" checked={step.ownsFields.includes(field.key)} onChange={(e) => updateStep(i, { ownsFields: e.target.checked ? [...step.ownsFields, field.key] : step.ownsFields.filter((key) => key !== field.key) })} />{step.ownsFields.includes(field.key) ? "✓ " : "+ "}{field.label}</label>)}{assignable.length === 0 && <span className="text-xs text-muted">No {step.role === "decide" ? "decision" : "free-text"} fields available.</span>}</div></fieldset>
                <label className="flex items-center gap-2 text-xs text-ink-soft"><input type="checkbox" checked={step.seesPriorStepOutput} disabled={i === 0} onChange={(e) => updateStep(i, { seesPriorStepOutput: e.target.checked })} />Pass previous step output into this step</label>
                <label className="block text-xs font-semibold text-ink-soft">Prompt override <span className="font-normal text-muted">· optional</span><textarea aria-label={`Step ${i + 1} prompt override`} className="ui-input mt-2 min-h-24 resize-y font-mono text-xs leading-relaxed" value={step.promptOverride ?? ""} placeholder={defaultPrompt(step, i, draft, project, models, systemPrompt)} onChange={(e) => updateStep(i, { promptOverride: e.target.value || undefined })} /></label>
              </div></section>
          </div>;
        })}<button className="ui-button relative mb-5 w-full border-dashed py-5 text-brand hover:border-brand" onClick={nextStep}><span className="text-lg">+</span> Add step to pipeline</button></div>
        <div className="sticky bottom-0 z-20 flex flex-wrap items-center gap-3 border-t border-line bg-paper/95 py-4 backdrop-blur-md"><button className="ui-button ui-button-primary" disabled={errors.length > 0 || saving} onClick={() => void save()}>{saving ? "Saving…" : draft.id ? "Save changes" : "Create flow"}</button><button className="ui-button" onClick={() => { setDraft(null); setError(""); }}>Cancel</button>{errors.length === 0 && <span className="text-xs text-good">All fields covered · ready to save</span>}</div>
      </div>
      <aside className="ui-surface sticky top-36 p-5"><h2 className="font-display text-sm font-semibold text-ink">Output coverage</h2><p className="mt-1 text-xs text-muted">Each field must be claimed exactly once.</p><div className="mt-4 space-y-2">{schema.map((field) => { const owner = draft.steps.findIndex((step) => step.ownsFields.includes(field.key)); return <div key={field.key} className="flex items-center justify-between gap-3 border-b border-line py-2 text-xs"><span className="text-ink">{field.label}</span><span className={`shrink-0 font-mono ${owner >= 0 ? "text-good" : "text-generate"}`}>{owner >= 0 ? `step ${owner + 1}` : "unclaimed"}</span></div>; })}</div><div className={`mt-5 rounded-md p-3 text-xs ${unowned.length ? "bg-generate-soft text-generate" : "bg-good-soft text-good"}`}>{unowned.length ? `${unowned.length} field${unowned.length === 1 ? "" : "s"} still available` : "All fields assigned"}</div>{errors.length > 0 && <div role="alert" className="mt-4 border-t border-line pt-4 text-xs text-bad"><p className="font-semibold">Complete the flow before saving</p><ul className="mt-2 list-inside list-disc space-y-1">{errors.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}</aside>
    </div>}
  </div>;
}

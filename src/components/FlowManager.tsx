"use client";

import { useEffect, useState } from "react";
import type { Flow, FlowStep } from "@/lib/flows";
import { validateFlow } from "@/lib/flow-validation";
import type { ModelRow } from "@/lib/models";
import type { OutputField, Project } from "@/lib/projects";
import { buildState, jevDecisionSpecs } from "@/lib/flows/buildQuestions";
import { buildDecideSystem, buildGenerateSystem } from "@/lib/flows/llmTriage";

interface Draft { id?: string; name: string; steps: FlowStep[] }

const inputClass = "w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-accent-b/50 focus:outline-none";

function defaultPrompt(step: FlowStep, index: number, draft: Draft, project: Project, models: ModelRow[], systemPrompt: string): string {
  const fields = project.outputSchema.filter((field) => step.ownsFields.includes(field.key));
  const st = { project, systemPrompt };
  if (step.role === "generate") {
    const followsDecision = step.seesPriorStepOutput && draft.steps[index - 1]?.role === "decide";
    const constrained = step.seesPriorStepOutput && draft.steps[index - 1]?.role === "decide" && draft.steps[index - 1]?.modelId !== step.modelId;
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

export function FlowManager({ open, project, onClose, onChange }: { open: boolean; project: Project | null; onClose: () => void; onChange: () => void }) {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");

  useEffect(() => {
    if (!open || !project) return;
    let active = true;
    void Promise.all([
      fetch(`/api/projects/${encodeURIComponent(project.id)}/flows`).then((r) => r.json()),
      fetch("/api/models").then((r) => r.json()),
      fetch("/api/config").then((r) => r.json()),
    ]).then(([f, m, config]) => {
      if (active) { setFlows(f.flows ?? []); setModels(m.models ?? []); setSystemPrompt(config.settings?.systemPrompt ?? ""); setDraft(null); setError(""); }
    }).catch(() => { if (active) setError("Could not load flows or models."); });
    return () => { active = false; };
  }, [open, project]);

  if (!open || !project) return null;
  const schema = project.outputSchema;
  const errors = draft ? [
    ...(!draft.name.trim() ? ["Flow name is required."] : []),
    ...validateFlow(draft.steps, schema, models),
  ] : [];
  const updateStep = (index: number, patch: Partial<FlowStep>) => setDraft((previous) => previous && ({
    ...previous,
    steps: previous.steps.map((step, i) => i === index ? { ...step, ...patch } : step),
  }));
  const nextStep = () => {
    if (!draft) return;
    const owned = new Set(draft.steps.flatMap((step) => step.ownsFields));
    const next = schema.find((field) => !owned.has(field.key));
    const role = next?.type === "free_text" ? "generate" : "decide";
    const model = models.find((m) => role === "decide" || m.adapterType === "llm_chat");
    setDraft({ ...draft, steps: [...draft.steps, {
      id: crypto.randomUUID(), modelId: model?.id ?? "", role,
      ownsFields: schema.filter((field) => !owned.has(field.key) && (field.type === "free_text") === (role === "generate")).map((field) => field.key),
      seesPriorStepOutput: draft.steps.length > 0,
    }] });
  };
  const save = async () => {
    if (!draft || errors.length || saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(draft.id ? `/api/flows/${encodeURIComponent(draft.id)}` : `/api/projects/${encodeURIComponent(project.id)}/flows`, {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.name, steps: draft.steps }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Could not save flow."); return; }
      const list = await fetch(`/api/projects/${encodeURIComponent(project.id)}/flows`).then((r) => r.json());
      setFlows(list.flows ?? []);
      setDraft(null);
      onChange();
    } catch { setError("Could not save flow."); }
    finally { setSaving(false); }
  };
  const remove = async (id: string) => {
    if (!window.confirm("Delete this flow? Saved sessions will remain available.")) return;
    const res = await fetch(`/api/flows/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) { setError("Could not delete flow."); return; }
    setFlows((previous) => previous.filter((flow) => flow.id !== id));
    onChange();
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Manage flows" className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="animate-modal flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-line bg-panel shadow-elevated">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div><h2 className="font-display text-lg font-semibold text-ink">Manage flows</h2><p className="text-xs text-ink-soft">{project.name}</p></div>
          <button onClick={onClose} aria-label="Close flow manager" className="text-ink-soft hover:text-ink">✕</button>
        </div>
        <div className="space-y-4 overflow-y-auto p-5">
          {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          {!draft ? <>
            <div className="grid gap-3 sm:grid-cols-2">
              {flows.map((flow) => <div key={flow.id} className="rounded-lg border border-line bg-paper p-4">
                <h3 className="font-display font-semibold text-ink">{flow.name}</h3>
                <p className="mt-1 text-xs text-ink-soft">{flow.steps.length} steps · {flow.steps.map((step) => models.find((m) => m.id === step.modelId)?.name ?? step.modelId).join(" → ")}</p>
                <div className="mt-3 flex gap-3 font-mono text-xs text-accent-b">
                  <button onClick={() => setDraft({ id: flow.id, name: flow.name, steps: structuredClone(flow.steps) })}>Edit</button>
                  <button onClick={() => setDraft({ name: `${flow.name} copy`, steps: structuredClone(flow.steps) })}>Duplicate</button>
                  <button className="text-rose-600" onClick={() => void remove(flow.id)}>Delete</button>
                </div>
              </div>)}
            </div>
            <button className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper" onClick={() => setDraft({ name: "", steps: [] })}>+ New flow</button>
          </> : <>
            <label className="block text-sm font-medium text-ink">Flow name<input aria-label="Flow name" className={`${inputClass} mt-1`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
            {draft.steps.map((step, i) => {
              const selected = models.find((m) => m.id === step.modelId);
              const otherOwned = new Set(draft.steps.filter((_, n) => n !== i).flatMap((item) => item.ownsFields));
              const assignable = schema.filter((field) => (field.type === "free_text") === (step.role === "generate") && (!otherOwned.has(field.key) || step.ownsFields.includes(field.key)));
              return <div key={step.id} className="rounded-xl border border-line bg-paper p-4">
                <div className="mb-3 flex items-center justify-between"><h3 className="font-display font-semibold text-ink">Step {i + 1}</h3><button aria-label={`Remove step ${i + 1}`} className="text-xs text-rose-600" onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, n) => n !== i) })}>Remove</button></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-ink-soft">Model<select aria-label={`Step ${i + 1} model`} className={`${inputClass} mt-1`} value={step.modelId} onChange={(e) => {
                    const next = models.find((m) => m.id === e.target.value);
                    if (next?.adapterType === "system_one" && step.role === "generate") setError("System One cannot generate free text. This step was changed to decide; add a generate step for the unowned free-text fields.");
                    else setError("");
                    updateStep(i, { modelId: e.target.value, role: next?.adapterType === "system_one" ? "decide" : step.role, ownsFields: next?.adapterType === "system_one" && step.role === "generate" ? [] : step.ownsFields });
                  }}>{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
                  <label className="text-xs text-ink-soft">Role<select aria-label={`Step ${i + 1} role`} className={`${inputClass} mt-1`} value={step.role} disabled={selected?.adapterType === "system_one"} onChange={(e) => updateStep(i, { role: e.target.value as FlowStep["role"], ownsFields: [] })}><option value="decide">Decide</option><option value="generate">Generate</option></select></label>
                </div>
                {selected?.adapterType === "system_one" && <p className="mt-1 text-xs text-ink-soft">System One can only decide; it cannot generate free text.</p>}
                <fieldset className="mt-3"><legend className="text-xs font-semibold text-ink-soft">Fields owned by this step</legend><div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">{assignable.map((field: OutputField) => <label key={field.key} className="flex items-center gap-1.5 text-xs text-ink"><input type="checkbox" checked={step.ownsFields.includes(field.key)} onChange={(e) => updateStep(i, { ownsFields: e.target.checked ? [...step.ownsFields, field.key] : step.ownsFields.filter((key) => key !== field.key) })} />{field.label}</label>)}</div></fieldset>
                <label className="mt-4 flex items-center gap-2 text-xs text-ink-soft"><input type="checkbox" checked={step.seesPriorStepOutput} disabled={i === 0} onChange={(e) => updateStep(i, { seesPriorStepOutput: e.target.checked })} />Sees prior step&apos;s output</label>
                <label className="mt-3 block text-xs text-ink-soft">Prompt override (optional)<textarea aria-label={`Step ${i + 1} prompt override`} className={`${inputClass} mt-1 min-h-20`} value={step.promptOverride ?? ""} placeholder={defaultPrompt(step, i, draft, project, models, systemPrompt)} onChange={(e) => updateStep(i, { promptOverride: e.target.value || undefined })} /></label>
              </div>;
            })}
            <button className="rounded-md border border-line px-3 py-2 text-xs text-ink" onClick={nextStep}>+ Add step</button>
            {errors.length > 0 && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p className="font-semibold">Complete the flow before saving:</p><ul className="mt-1 list-disc pl-5">{errors.map((item, i) => <li key={i}>{item}</li>)}</ul></div>}
            <div className="flex gap-3"><button disabled={errors.length > 0 || saving} className="rounded-lg bg-ink px-4 py-2 text-sm text-paper disabled:cursor-not-allowed disabled:opacity-40" onClick={() => void save()}>{saving ? "Saving…" : "Save flow"}</button><button className="text-sm text-ink-soft" onClick={() => { setDraft(null); setError(""); }}>Cancel</button></div>
          </>}
        </div>
      </div>
    </div>
  );
}

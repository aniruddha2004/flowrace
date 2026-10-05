"use client";

import { useEffect, useState } from "react";
import type { ModelRow } from "@/lib/models";

function AdapterBadge({ type }: { type: ModelRow["adapterType"] }) {
  return <span className={`inline-flex rounded-[5px] px-2 py-1 font-mono text-[11px] font-medium ${type === "system_one" ? "bg-decide-soft text-decide" : type === "llm_chat" ? "bg-brand-soft text-brand" : "bg-track text-ink-soft"}`}>{type.replaceAll("_", " ")}</span>;
}

function ModelEditor({ model, onCancel, onSaved }: { model?: ModelRow; onCancel: () => void; onSaved: () => void }) {
  const [id, setId] = useState(model?.id ?? "");
  const [name, setName] = useState(model?.name ?? "");
  const [adapterType, setAdapterType] = useState<ModelRow["adapterType"]>(model?.adapterType ?? "llm_chat");
  const [apiBase, setApiBase] = useState(model?.apiConfig.apiBase ?? "");
  const [apiKeyEnvVar, setApiKeyEnvVar] = useState(model?.apiConfig.apiKeyEnvVar ?? "");
  const [modelId, setModelId] = useState(model?.apiConfig.modelId ?? "");
  const [inputPerM, setInputPerM] = useState(String(model?.pricing.inputPerM ?? ""));
  const [outputPerM, setOutputPerM] = useState(String(model?.pricing.outputPerM ?? ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const valid = (model || /^[a-z][a-z0-9-]*$/.test(id)) && name.trim() && apiBase.trim() && apiKeyEnvVar.trim() && (adapterType === "custom_http" || modelId.trim()) && !Number.isNaN(Number(inputPerM)) && !Number.isNaN(Number(outputPerM));
  const submit = async () => {
    if (!valid) return;
    setSaving(true); setError("");
    try {
      const res = await fetch(model ? `/api/models/${encodeURIComponent(model.id)}` : "/api/models", { method: model ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(model ? {} : { id: id.trim() }), name: name.trim(), adapterType, apiConfig: { apiBase: apiBase.trim(), apiKeyEnvVar: apiKeyEnvVar.trim(), modelId: modelId.trim() }, pricing: { inputPerM: Number(inputPerM), outputPerM: Number(outputPerM), outputFree: Number(outputPerM) === 0 } }) });
      if (!res.ok) { setError((await res.json()).error ?? "Could not save model."); return; }
      onSaved();
    } catch { setError("Could not save model."); } finally { setSaving(false); }
  };
  return <form className="ui-surface view-enter mb-6 p-5 sm:p-7" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
    <div className="mb-6 flex items-center justify-between"><h2 className="font-display text-lg font-semibold text-ink">{model ? `Edit ${model.name}` : "Register a model"}</h2><button type="button" className="text-sm text-ink-soft hover:text-ink" onClick={onCancel}>Cancel</button></div>
    <div className="grid gap-4 sm:grid-cols-2">
      {!model && <label className="text-xs font-medium text-ink-soft">Model ID<input aria-label="Model ID" className="ui-input mt-1.5 font-mono" value={id} onChange={(e) => setId(e.target.value.toLowerCase())} placeholder="provider-model" /></label>}
      <label className="text-xs font-medium text-ink-soft">Display name<input aria-label="Display name" className="ui-input mt-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="Model name" /></label>
      <label className="text-xs font-medium text-ink-soft">Adapter<select aria-label="Adapter" className="ui-input mt-1.5" value={adapterType} onChange={(e) => setAdapterType(e.target.value as ModelRow["adapterType"])}><option value="llm_chat">LLM chat</option><option value="system_one">System One</option><option value="custom_http">Custom HTTP</option></select></label>
      <label className="text-xs font-medium text-ink-soft">Provider model ID<input aria-label="Provider model ID" className="ui-input mt-1.5 font-mono" value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder="model-version" /></label>
      <label className="text-xs font-medium text-ink-soft sm:col-span-2">API base URL<input aria-label="API base URL" className="ui-input mt-1.5 font-mono" value={apiBase} onChange={(e) => setApiBase(e.target.value)} placeholder="https://api.example.com" /></label>
      <label className="text-xs font-medium text-ink-soft">API key environment variable<input aria-label="API key environment variable" className="ui-input mt-1.5 font-mono" value={apiKeyEnvVar} onChange={(e) => setApiKeyEnvVar(e.target.value)} placeholder="PROVIDER_API_KEY" /></label>
      <div className="grid grid-cols-2 gap-3"><label className="text-xs font-medium text-ink-soft">Input / 1M<input aria-label="Input price per million" type="number" min="0" step="any" className="ui-input mt-1.5 font-mono" value={inputPerM} onChange={(e) => setInputPerM(e.target.value)} /></label><label className="text-xs font-medium text-ink-soft">Output / 1M<input aria-label="Output price per million" type="number" min="0" step="any" className="ui-input mt-1.5 font-mono" value={outputPerM} onChange={(e) => setOutputPerM(e.target.value)} /></label></div>
    </div>
    {error && <p role="alert" className="mt-4 rounded-md bg-bad-soft p-3 text-sm text-bad">{error}</p>}
    <div className="mt-6 flex items-center gap-4"><button type="submit" disabled={!valid || saving} className="ui-button ui-button-primary">{saving ? "Saving…" : model ? "Save changes" : "Register model"}</button><span className="text-xs text-muted">Keys are read from server environment variables.</span></div>
  </form>;
}

export function ModelsRegistry({ refreshKey = 0, onChanged }: { refreshKey?: number; onChanged?: () => void }) {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [editing, setEditing] = useState<ModelRow | "new" | null>(null);
  const [error, setError] = useState("");
  const reload = () => { void fetch("/api/models").then((res) => res.json()).then((data) => setModels(data.models ?? [])).catch(() => setError("Could not load models.")); };
  useEffect(() => { const timer = setTimeout(reload, 0); return () => clearTimeout(timer); }, [refreshKey]);
  const remove = async (model: ModelRow) => {
    if (!confirm(`Delete model "${model.name}"?`)) return;
    const res = await fetch(`/api/models/${encodeURIComponent(model.id)}`, { method: "DELETE" });
    if (!res.ok) { setError((await res.json()).error ?? "Could not delete model."); return; }
    setError(""); reload(); onChanged?.();
  };
  return <div className="ui-page">
    <div className="mb-9 flex flex-wrap items-end justify-between gap-4"><div><p className="ui-kicker mb-2">REGISTRY / MODELS</p><h1 className="font-display text-3xl font-semibold tracking-[-.05em] text-ink sm:text-[2.6rem]">Your model fleet</h1><p className="mt-2 text-sm text-ink-soft">Registered engines for the steps in your pipelines. Credentials stay server-side.</p></div><button className="ui-button ui-button-primary" onClick={() => setEditing("new")}>+ Add model</button></div>
    {error && <p role="alert" className="mb-5 rounded-md bg-bad-soft p-3 text-sm text-bad">{error}</p>}
    {editing && <ModelEditor key={editing === "new" ? "new" : editing.id} model={editing === "new" ? undefined : editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); setError(""); reload(); onChanged?.(); }} />}
    <div className="ui-surface overflow-hidden"><div className="hidden grid-cols-[minmax(180px,1.2fr)_minmax(120px,.8fr)_minmax(140px,1fr)_minmax(150px,1fr)_auto] gap-4 border-b border-line bg-track/40 px-5 py-3 text-xs font-medium text-ink-soft md:grid"><span>Model</span><span>Adapter</span><span>Provider ID</span><span>Pricing / 1M tokens</span><span>Actions</span></div>
      <div className="divide-y divide-line">{models.map((model) => <div key={model.id} className="grid gap-3 px-5 py-5 transition-colors hover:bg-track/30 md:grid-cols-[minmax(180px,1.2fr)_minmax(120px,.8fr)_minmax(140px,1fr)_minmax(150px,1fr)_auto] md:items-center md:gap-4">
        <div className="min-w-0"><p className="truncate text-sm font-semibold text-ink">{model.name}</p><code className="text-xs text-muted">{model.id}</code></div><div><AdapterBadge type={model.adapterType} /></div><code className="min-w-0 truncate text-xs text-ink-soft" title={model.apiConfig.modelId}>{model.apiConfig.modelId || "—"}</code><span className="font-mono text-xs text-ink-soft">${model.pricing.inputPerM} in / ${model.pricing.outputPerM} out</span><div className="flex items-center gap-3"><button className="text-xs font-semibold text-brand hover:underline" onClick={() => setEditing(model)}>Edit</button><button className="text-xs text-bad hover:underline" onClick={() => void remove(model)}>Delete</button></div>
      </div>)}{models.length === 0 && <p className="p-8 text-sm text-muted">No models registered yet.</p>}</div>
    </div>
  </div>;
}

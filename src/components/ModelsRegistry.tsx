"use client";

import { useEffect, useState } from "react";
import { GLINER_MAPPING, mappingForProtocol } from "@/lib/http-mapping";
import type { ModelRow } from "@/lib/models";
import type { ProviderPreset } from "@/lib/provider-catalog";
import type { ProviderRow } from "@/lib/providers";
import { ProviderConnections, type ModelSuggestion } from "./ProviderConnections";

function AdapterBadge({ type }: { type: ModelRow["adapterType"] }) {
  return <span className={`inline-flex rounded-[5px] px-2 py-1 font-mono text-[11px] font-medium ${type === "system_one" ? "bg-decide-soft text-decide" : type === "llm_chat" ? "bg-brand-soft text-brand" : "bg-generate-soft text-generate"}`}>{type.replaceAll("_", " ")}</span>;
}

const starterMapping = JSON.stringify({
  path: "/classify", auth: { mode: "none" },
  decision: { body: { text: "{{text}}", questions: "{{questionsByKey}}", model: "{{model}}" }, answersPath: "answers", valuePath: "value", confidencePath: "confidence" },
  generate: { body: { text: "{{text}}", context: "{{context}}", prior: "{{prior}}" }, textPath: "text" },
}, null, 2);

function slug(providerId: string, modelId: string): string {
  return `${providerId}-${modelId.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/-+$/, "")}`.slice(0, 100);
}

function ModelEditor({ model, suggestion, providers, onCancel, onSaved }: {
  model?: ModelRow; suggestion?: ModelSuggestion; providers: ProviderRow[]; onCancel: () => void; onSaved: () => void;
}) {
  const [providerId, setProviderId] = useState(model?.providerId ?? suggestion?.providerId ?? providers[0]?.id ?? "");
  const [id, setId] = useState(model?.id ?? (suggestion ? slug(suggestion.providerId, suggestion.id) : ""));
  const [name, setName] = useState(model?.name ?? suggestion?.name ?? "");
  const [adapterType, setAdapterType] = useState<ModelRow["adapterType"]>(model?.adapterType ?? "llm_chat");
  const [modelId, setModelId] = useState(model?.apiConfig.modelId ?? suggestion?.id ?? "");
  const [apiBase, setApiBase] = useState(model?.apiConfig.apiBase ?? "");
  const [apiKeyEnvVar, setApiKeyEnvVar] = useState(model?.apiConfig.apiKeyEnvVar ?? "");
  const [mapping, setMapping] = useState(model?.apiConfig.requestTemplate ?? "");
  const [inputPerM, setInputPerM] = useState(String(model?.pricing.inputPerM ?? 0));
  const [outputPerM, setOutputPerM] = useState(String(model?.pricing.outputPerM ?? 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const provider = providers.find((item) => item.id === providerId);
  const effectiveType = provider && provider.protocol !== "openai_chat" && adapterType === "llm_chat" ? "custom_http" : adapterType;
  const effectiveMapping = mapping || (provider ? JSON.stringify(mappingForProtocol(provider.protocol) ?? JSON.parse(starterMapping), null, 2) : "");
  const selectProvider = (nextId: string) => {
    const next = providers.find((item) => item.id === nextId);
    setProviderId(nextId);
    if (next && next.protocol !== "openai_chat") { setAdapterType("custom_http"); setMapping(JSON.stringify(mappingForProtocol(next.protocol) ?? JSON.parse(starterMapping), null, 2)); }
    else { setAdapterType("llm_chat"); setMapping(""); }
  };
  const valid = Boolean((model || /^[a-z][a-z0-9_-]*$/.test(id)) && name.trim() && modelId.trim() && providerId && inputPerM.trim() && outputPerM.trim() && Number.isFinite(Number(inputPerM)) && Number.isFinite(Number(outputPerM)) && Number(inputPerM) >= 0 && Number(outputPerM) >= 0);
  const submit = async () => {
    if (!valid || !provider) return;
    setSaving(true); setError("");
    try {
      const res = await fetch(model ? `/api/models/${encodeURIComponent(model.id)}` : "/api/models", {
        method: model ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(model ? {} : { id: id.trim() }), name: name.trim(), providerId, adapterType: effectiveType,
          apiConfig: { apiBase: provider.apiBase || apiBase, apiKeyEnvVar: provider.apiKeyEnvVar || apiKeyEnvVar, modelId: modelId.trim(), ...(effectiveType === "custom_http" ? { requestTemplate: effectiveMapping } : {}) },
          pricing: { inputPerM: Number(inputPerM), outputPerM: Number(outputPerM), outputFree: Number(outputPerM) === 0 } }),
      });
      if (!res.ok) { setError((await res.json()).error ?? "Could not save model."); return; }
      onSaved();
    } catch { setError("Could not save model."); } finally { setSaving(false); }
  };
  return <form className="ui-surface view-enter mb-6 p-5 sm:p-7" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
    <div className="mb-6 flex items-center justify-between"><h2 className="font-display text-lg font-semibold text-ink">{model ? `Edit ${model.name}` : "Register a model"}</h2><button type="button" className="text-sm text-ink-soft hover:text-ink" onClick={onCancel}>Cancel</button></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-xs font-medium text-ink-soft">Provider<select aria-label="Model provider" className="ui-input mt-1.5" value={providerId} onChange={(event) => selectProvider(event.target.value)}><option value="">Choose a connection</option>{providers.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.protocol.replaceAll("_", " ")}</option>)}</select></label>
      <label className="text-xs font-medium text-ink-soft">Adapter<select aria-label="Adapter" className="ui-input mt-1.5" value={effectiveType} onChange={(event) => setAdapterType(event.target.value as ModelRow["adapterType"])}><option value="llm_chat" disabled={provider?.protocol !== "openai_chat"}>OpenAI-compatible chat</option><option value="custom_http">JSON HTTP mapping</option><option value="system_one">TypeSafe System One (legacy)</option></select></label>
      {!model && <label className="text-xs font-medium text-ink-soft">Registry ID<input aria-label="Model ID" className="ui-input mt-1.5 font-mono" value={id} onChange={(event) => setId(event.target.value.toLowerCase())} placeholder="provider-model" /></label>}
      <label className="text-xs font-medium text-ink-soft">Display name<input aria-label="Display name" className="ui-input mt-1.5" value={name} onChange={(event) => setName(event.target.value)} placeholder="Model name" /></label>
      <label className="text-xs font-medium text-ink-soft sm:col-span-2">Provider model ID<input aria-label="Provider model ID" className="ui-input mt-1.5 font-mono text-xs" value={modelId} onChange={(event) => setModelId(event.target.value)} placeholder="Any model ID supported by the provider" /></label>
      {!provider && <><label className="text-xs font-medium text-ink-soft">Legacy API base URL<input className="ui-input mt-1.5" value={apiBase} onChange={(event) => setApiBase(event.target.value)} /></label><label className="text-xs font-medium text-ink-soft">Legacy key env var<input className="ui-input mt-1.5" value={apiKeyEnvVar} onChange={(event) => setApiKeyEnvVar(event.target.value)} /></label></>}
      <label className="text-xs font-medium text-ink-soft">Input cost / 1M tokens<input aria-label="Input price per million" type="number" min="0" step="any" className="ui-input mt-1.5 font-mono" value={inputPerM} onChange={(event) => setInputPerM(event.target.value)} /></label>
      <label className="text-xs font-medium text-ink-soft">Output cost / 1M tokens<input aria-label="Output price per million" type="number" min="0" step="any" className="ui-input mt-1.5 font-mono" value={outputPerM} onChange={(event) => setOutputPerM(event.target.value)} /></label>
    </div>
    {effectiveType === "custom_http" && <div className="mt-5 border-t border-line pt-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-ink">Wire mapping · JSON</h3><button type="button" className="text-xs font-semibold text-brand hover:underline" onClick={() => setMapping(JSON.stringify(GLINER_MAPPING, null, 2))}>Load GLiNER example</button></div><p className="mt-1 text-xs leading-relaxed text-ink-soft">Define the endpoint path, authentication, request body placeholders and response paths. Use <code className="font-mono">{"{{text}}"}</code>, <code className="font-mono">{"{{questionsByKey}}"}</code>, <code className="font-mono">{"{{context}}"}</code> or <code className="font-mono">{"{{model}}"}</code>. Whole-value placeholders preserve JSON types. Remove the decision or generate section if this model only supports one role.</p><textarea aria-label="HTTP mapping JSON" spellCheck={false} className="ui-input mt-3 min-h-80 resize-y font-mono text-xs leading-relaxed" value={effectiveMapping} onChange={(event) => setMapping(event.target.value)} /><p className="mt-2 text-xs text-muted">Use questionTemplates for typed questions, valueByType or transforms for specialized labels and scores. GLiNER&apos;s mapping is decide-only; pair it with a generating model in your flow.</p></div>}
    {error && <p role="alert" className="mt-4 rounded-md bg-bad-soft p-3 text-sm text-bad">{error}</p>}
    <div className="mt-6 flex items-center gap-4"><button type="submit" disabled={!valid || saving} className="ui-button ui-button-primary">{saving ? "Saving…" : model ? "Save changes" : "Register model"}</button><span className="text-xs text-muted">Credentials stay with the provider connection.</span></div>
  </form>;
}

export function ModelsRegistry({ section = "models", onChanged }: { section?: "models" | "providers"; onChanged?: () => void }) {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [editing, setEditing] = useState<ModelRow | "new" | null>(null);
  const [suggestion, setSuggestion] = useState<ModelSuggestion | undefined>();
  const [error, setError] = useState("");
  const reloadModels = () => { void fetch("/api/models").then((res) => res.json()).then((data) => setModels(data.models ?? [])).catch(() => setError("Could not load models.")); };
  const reloadProviders = () => { void fetch("/api/providers").then((res) => res.json()).then((data) => { setProviders(data.providers ?? []); setPresets(data.presets ?? []); }).catch(() => setError("Could not load providers.")); };
  useEffect(() => { const timer = setTimeout(() => { reloadModels(); reloadProviders(); }, 0); return () => clearTimeout(timer); }, []);
  const remove = async (model: ModelRow) => {
    if (!confirm(`Delete model "${model.name}"?`)) return;
    const res = await fetch(`/api/models/${encodeURIComponent(model.id)}`, { method: "DELETE" });
    if (!res.ok) { setError((await res.json()).error ?? "Could not delete model."); return; }
    setError(""); reloadModels(); onChanged?.();
  };
  return <div className="ui-page">
    <div className="mb-9"><p className="ui-kicker mb-2">REGISTRY / {section === "providers" ? "PROVIDERS" : "MODELS"}</p><h1 className="font-display text-3xl font-semibold tracking-[-.05em] text-ink sm:text-[2.6rem]">{section === "providers" ? "Provider connections" : "Your model fleet"}</h1><p className="mt-2 text-sm text-ink-soft">{section === "providers" ? "Connect an API once, discover its models, and keep credentials on the server." : "Register any model from a connected provider, including engines with custom JSON wire formats."}</p></div>
    {error && <p role="alert" className="mb-5 rounded-md bg-bad-soft p-3 text-sm text-bad">{error}</p>}
    {section === "providers" && <ProviderConnections providers={providers} presets={presets} onRefresh={reloadProviders} onSelectModel={(model) => { setSuggestion(model); setEditing("new"); }} />}
    {section === "models" && <>
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-display text-lg font-semibold text-ink">Registered models <span className="ml-1 font-mono text-sm font-normal text-muted">{models.length}</span></h2><p className="mt-1 text-xs text-ink-soft">Only registered models appear in the flow builder.</p></div><button className="ui-button ui-button-primary" onClick={() => { setSuggestion(undefined); setEditing("new"); }}>+ Register model</button></div>
    </>}
    {editing && <ModelEditor key={editing === "new" ? `new-${suggestion?.id ?? "manual"}` : editing.id} model={editing === "new" ? undefined : editing} suggestion={suggestion} providers={providers} onCancel={() => { setEditing(null); setSuggestion(undefined); }} onSaved={() => { setEditing(null); setSuggestion(undefined); setError(""); reloadModels(); onChanged?.(); }} />}
    {section === "models" &&
    <div className="ui-surface overflow-hidden"><div className="hidden grid-cols-[minmax(160px,1.2fr)_minmax(120px,.8fr)_minmax(130px,.8fr)_minmax(130px,1fr)_minmax(130px,1fr)_auto] gap-4 border-b border-line bg-track/40 px-5 py-3 text-xs font-medium text-ink-soft lg:grid"><span>Model</span><span>Provider</span><span>Adapter</span><span>Provider ID</span><span>Pricing / 1M</span><span>Actions</span></div>
      <div className="divide-y divide-line">{models.map((model) => <div key={model.id} className="grid gap-3 px-5 py-5 transition-colors hover:bg-track/30 lg:grid-cols-[minmax(160px,1.2fr)_minmax(120px,.8fr)_minmax(130px,.8fr)_minmax(130px,1fr)_minmax(130px,1fr)_auto] lg:items-center lg:gap-4"><div className="min-w-0"><p className="truncate text-sm font-semibold text-ink">{model.name}</p><code className="text-xs text-muted">{model.id}</code></div><span className="text-xs text-ink-soft">{providers.find((item) => item.id === model.providerId)?.name ?? "Legacy"}</span><div><AdapterBadge type={model.adapterType} /></div><code className="min-w-0 truncate text-xs text-ink-soft" title={model.apiConfig.modelId}>{model.apiConfig.modelId || "—"}</code><span className="font-mono text-xs text-ink-soft">${model.pricing.inputPerM} in / ${model.pricing.outputPerM} out</span><div className="flex items-center gap-3"><button className="text-xs font-semibold text-brand hover:underline" onClick={() => { setSuggestion(undefined); setEditing(model); }}>Edit</button><button className="text-xs text-bad hover:underline" onClick={() => void remove(model)}>Delete</button></div></div>)}{models.length === 0 && <p className="p-8 text-sm text-muted">Connect a provider and register its first model.</p>}</div>
    </div>}
  </div>;
}

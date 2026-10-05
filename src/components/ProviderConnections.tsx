"use client";

import { useEffect, useState } from "react";
import type { ProviderPreset, ProviderProtocol } from "@/lib/provider-catalog";
import type { ProviderRow } from "@/lib/providers";

export interface ModelSuggestion { providerId: string; id: string; name: string }

function ConnectionForm({ presets, provider, onSaved, onCancel }: {
  presets: ProviderPreset[]; provider?: ProviderRow; onSaved: () => void; onCancel: () => void;
}) {
  const [presetId, setPresetId] = useState("");
  const [id, setId] = useState(provider?.id ?? "");
  const [name, setName] = useState(provider?.name ?? "");
  const [protocol, setProtocol] = useState<ProviderProtocol>(provider?.protocol ?? "openai_chat");
  const [apiBase, setApiBase] = useState(provider?.apiBase ?? "");
  const [apiKeyEnvVar, setApiKeyEnvVar] = useState(provider?.apiKeyEnvVar ?? "");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const choosePreset = (value: string) => {
    setPresetId(value);
    const preset = presets.find((item) => item.id === value);
    if (preset) { setId(preset.id); setName(preset.name); setProtocol(preset.protocol); setApiBase(preset.apiBase); setApiKeyEnvVar(preset.apiKeyEnvVar); }
  };
  const save = async () => {
    setSaving(true); setError("");
    try {
      const res = await fetch(provider ? `/api/providers/${encodeURIComponent(provider.id)}` : "/api/providers", {
        method: provider ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(!provider ? { id } : {}), name, protocol, apiBase, apiKeyEnvVar, ...(apiKey ? { apiKey } : {}) }),
      });
      if (!res.ok) { setError((await res.json()).error ?? "Could not connect provider."); return; }
      setApiKey(""); onSaved();
    } catch { setError("Could not connect provider."); } finally { setSaving(false); }
  };
  return <form className="ui-surface mb-5 p-5" onSubmit={(event) => { event.preventDefault(); void save(); }}>
    <div className="mb-4 flex items-center justify-between"><h3 className="font-display text-base font-semibold text-ink">{provider ? `Edit ${provider.name}` : "Connect a provider"}</h3><button type="button" className="text-xs text-ink-soft" onClick={onCancel}>Cancel</button></div>
    <div className="grid gap-4 md:grid-cols-2">
      {!provider && <label className="text-xs font-medium text-ink-soft md:col-span-2">Start from a provider<select aria-label="Provider preset" className="ui-input mt-1.5" value={presetId} onChange={(event) => choosePreset(event.target.value)}><option value="">Custom provider</option>{presets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      <label className="text-xs font-medium text-ink-soft">Provider ID<input aria-label="Provider ID" disabled={Boolean(provider)} className="ui-input mt-1.5 font-mono" value={id} onChange={(event) => setId(event.target.value.toLowerCase())} placeholder="my-provider" /></label>
      <label className="text-xs font-medium text-ink-soft">Name<input aria-label="Provider name" className="ui-input mt-1.5" value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label className="text-xs font-medium text-ink-soft">Wire protocol<select aria-label="Provider protocol" className="ui-input mt-1.5" value={protocol} onChange={(event) => setProtocol(event.target.value as ProviderProtocol)}><option value="openai_chat">OpenAI-compatible chat</option><option value="anthropic_messages">Anthropic messages (JSON mapping)</option><option value="gemini_generate">Gemini generateContent (JSON mapping)</option><option value="custom_http">Custom HTTP (JSON mapping)</option></select></label>
      <label className="text-xs font-medium text-ink-soft">API base URL<input aria-label="Provider API base URL" className="ui-input mt-1.5 font-mono text-xs" value={apiBase} onChange={(event) => setApiBase(event.target.value)} placeholder="https://api.example.com/v1" /></label>
      <label className="text-xs font-medium text-ink-soft">Key environment variable <span className="font-normal text-muted">(optional)</span><input aria-label="Provider key env var" className="ui-input mt-1.5 font-mono text-xs" value={apiKeyEnvVar} onChange={(event) => setApiKeyEnvVar(event.target.value)} placeholder="MY_PROVIDER_API_KEY" /></label>
      <label className="text-xs font-medium text-ink-soft">API key <span className="font-normal text-muted">(optional when env var is set)</span><input aria-label="Provider API key" type="password" autoComplete="new-password" className="ui-input mt-1.5 font-mono text-xs" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={provider?.hasCredential ? "•••••••• · leave blank to keep" : "Paste key or use environment variable"} /></label>
    </div>
    <p className="mt-4 text-xs text-muted">Keys are stored only on this server in a private file and never returned to the browser. HTTP local endpoints can omit a key when using a mapping with auth set to none.</p>
    {error && <p role="alert" className="mt-3 rounded bg-bad-soft p-3 text-xs text-bad">{error}</p>}
    <button disabled={saving || !id.trim() || !name.trim() || !apiBase.trim()} className="ui-button ui-button-primary mt-4" type="submit">{saving ? "Saving…" : provider ? "Save connection" : "Connect provider"}</button>
  </form>;
}

export function ProviderConnections({ providers, presets, onRefresh, onSelectModel }: {
  providers: ProviderRow[]; presets: ProviderPreset[]; onRefresh: () => void; onSelectModel: (model: ModelSuggestion) => void;
}) {
  const [editing, setEditing] = useState<ProviderRow | "new" | null>(null);
  const [browse, setBrowse] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<ModelSuggestion[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (!browse) return; let active = true; const timer = setTimeout(() => {
    void fetch(`/api/providers/${encodeURIComponent(browse)}/models`).then(async (res) => { const data = await res.json(); if (!res.ok) throw new Error(data.error ?? "Discovery failed."); return data; }).then((data) => { if (active) setCatalog((data.models ?? []).map((item: { id: string; name: string }) => ({ ...item, providerId: browse }))); }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Discovery failed."); }).finally(() => { if (active) setLoading(false); });
  }, 0); return () => { active = false; clearTimeout(timer); }; }, [browse]);
  const remove = async (id: string) => {
    if (!confirm(`Remove provider ${id}?`)) return;
    const res = await fetch(`/api/providers/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) { setError((await res.json()).error ?? "Could not remove provider."); return; }
    setError(""); onRefresh();
  };
  return <section className="mb-9"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-lg font-semibold text-ink">Provider connections</h2><p className="mt-1 text-xs text-ink-soft">Connect once, then browse and register any model that provider exposes.</p></div><button className="ui-button" onClick={() => setEditing("new")}>+ Connect provider</button></div>
    {editing && <ConnectionForm key={editing === "new" ? "new" : editing.id} presets={presets} provider={editing === "new" ? undefined : editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); onRefresh(); }} />}
    {error && <p role="alert" className="mb-3 rounded bg-bad-soft p-3 text-sm text-bad">{error}</p>}
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{providers.map((provider) => <article key={provider.id} className="ui-surface min-w-0 p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-display text-sm font-semibold text-ink">{provider.name}</h3><p className="mt-1 font-mono text-[11px] text-ink-soft">{provider.protocol.replaceAll("_", " ")}</p></div><span className={`shrink-0 rounded px-2 py-1 text-[10px] font-semibold ${provider.hasCredential || !provider.apiKeyEnvVar ? "bg-good-soft text-good" : "bg-generate-soft text-generate"}`}>{provider.hasCredential ? "Key ready" : provider.apiKeyEnvVar ? "Key needed" : "Local"}</span></div><p className="mt-3 truncate font-mono text-[11px] text-muted" title={provider.apiBase}>{provider.apiBase}</p><div className="mt-4 flex flex-wrap gap-3 border-t border-line pt-3 text-xs font-semibold"><button className="text-brand hover:underline" onClick={() => { setBrowse(provider.id); setCatalog([]); setQuery(""); setError(""); setLoading(true); }}>Browse models</button><button className="text-ink-soft hover:underline" onClick={() => setEditing(provider)}>Edit</button><button className="ml-auto text-bad hover:underline" onClick={() => void remove(provider.id)}>Remove</button></div></article>)}</div>
    {browse && <div className="ui-surface mt-4 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-display text-sm font-semibold text-ink">Models available from {providers.find((provider) => provider.id === browse)?.name}</h3><button className="text-xs text-ink-soft" onClick={() => setBrowse(null)}>Close</button></div><input aria-label="Search provider models" className="ui-input mt-3" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by model name or ID…" /><div className="mt-3 max-h-72 divide-y divide-line overflow-y-auto">{loading ? <p className="py-4 text-sm text-muted">Fetching models…</p> : catalog.filter((model) => `${model.id} ${model.name}`.toLowerCase().includes(query.toLowerCase())).map((model) => <button key={model.id} className="flex w-full items-center justify-between gap-4 py-3 text-left hover:text-brand" onClick={() => onSelectModel(model)}><span className="min-w-0"><span className="block truncate text-sm font-medium">{model.name}</span><code className="block truncate text-xs text-muted">{model.id}</code></span><span className="shrink-0 text-xs text-brand">Register ↗</span></button>)}{!loading && catalog.length === 0 && <p className="py-4 text-sm text-muted">No models returned. You can register a model ID manually below.</p>}</div></div>}
  </section>;
}

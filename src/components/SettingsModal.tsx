"use client";

import { useEffect, useRef, useState } from "react";
import type { Settings } from "@/lib/settings";
import type { ModelRow } from "@/lib/models";
import type { Project } from "@/lib/projects";
import { SchemaTab } from "./SchemaTab";

interface AppConfig {
  settings: Settings;
}

// ---------------------------------------------------------------------------
// SettingsModal — business context / system prompt / taxonomy editor / models.
// Changes take effect on the VERY NEXT API call (no server restart).
// ---------------------------------------------------------------------------

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  project: Project | null;
  onProjectChange: () => void;
}

type TabId = "context" | "prompt" | "schema" | "models";

const TABS: { id: TabId; label: string }[] = [
  { id: "context", label: "Business context" },
  { id: "prompt", label: "System prompt" },
  { id: "schema", label: "Output schema" },
  { id: "models", label: "Models" },
];

export function SettingsModal({ open, onClose, project, onProjectChange }: SettingsModalProps) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [tab, setTab] = useState<TabId>("context");
  const dialogRef = useRef<HTMLDivElement>(null);

  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) setTab("context");
  }

  useEffect(() => {
    if (!open) return;
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => setConfig(d));
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const saveContext = async (value: string) => {
    await fetch("/api/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessContext: value }),
    });
    onProjectChange();
  };
  const savePrompt = async (value: string) => {
    await fetch("/api/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemPrompt: value }),
    });
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div
        ref={dialogRef}
        className="animate-modal flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-line bg-panel shadow-elevated"
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="font-display text-base font-semibold text-ink">Settings</h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-track hover:text-ink"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-x-auto border-b border-line px-6">
          <div className="flex gap-5 whitespace-nowrap">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative py-3 text-sm font-medium transition-colors ${
                  tab === t.id ? "text-ink" : "text-muted hover:text-ink-soft"
                }`}
              >
                {t.label}
                <span
                  className={`absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent-b transition-opacity ${
                    tab === t.id ? "opacity-100" : "opacity-0"
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === "context" && <ContextTab value={config?.settings.businessContext ?? ""} onSave={saveContext} />}
          {tab === "prompt" && <PromptTab value={config?.settings.systemPrompt ?? ""} onSave={savePrompt} />}
          {tab === "schema" &&
            (project ? (
              <SchemaTab project={project} onChanged={onProjectChange} />
            ) : (
              <p className="text-sm text-muted">Loading…</p>
            ))}
          {tab === "models" && open && <ModelsTab />}
        </div>
      </div>
    </div>
  );
}

function SaveButton({
  saving,
  dirty,
  onClick,
}: {
  saving: boolean;
  dirty: boolean;
  onClick: () => void;
}) {
  return (
    <div className="mt-3 flex items-center gap-2">
      <span title={saving ? "Save in progress" : undefined}>
        <button
          onClick={onClick}
          disabled={saving}
          className="rounded-lg bg-ink px-4 py-2 font-display text-sm font-medium text-paper transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </span>
      {dirty && <span className="font-mono text-xs text-accent-a">unsaved changes</span>}
    </div>
  );
}

function ContextTab({ value, onSave }: { value: string; onSave: (v: string) => Promise<void> }) {
  const [text, setText] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setText(value);
  }
  const [saving, setSaving] = useState(false);
  return (
    <div>
      <p className="mb-3 text-sm leading-relaxed text-ink-soft">
        Injected into both flows&rsquo; prompts and Jev&rsquo;s question state. Describe your product,
        tone guidelines, and policy notes — this shapes classification rationale and reply style.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder="e.g. We are AcmePay, a B2B payments processor. Our clients are SaaS businesses."
        className="w-full resize-y rounded-lg border border-line bg-paper p-4 font-mono text-sm leading-relaxed text-ink placeholder:text-muted focus:border-accent-b/50 focus:outline-none focus:ring-2 focus:ring-accent-b/20"
      />
      <SaveButton
        saving={saving}
        dirty={text !== value}
        onClick={() => {
          setSaving(true);
          void onSave(text).finally(() => setSaving(false));
        }}
      />
    </div>
  );
}

function PromptTab({ value, onSave }: { value: string; onSave: (v: string) => Promise<void> }) {
  const [text, setText] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setText(value);
  }
  const [saving, setSaving] = useState(false);
  return (
    <div>
      <p className="mb-3 text-sm leading-relaxed text-ink-soft">
        The base instruction given to the LLM for both classification and reply drafting. Taxonomy
        lists (categories, priorities, routes) are appended dynamically at run time — no need to
        restate them here.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        className="w-full resize-y rounded-lg border border-line bg-paper p-4 font-mono text-sm leading-relaxed text-ink focus:border-accent-b/50 focus:outline-none focus:ring-2 focus:ring-accent-b/20"
      />
      <SaveButton
        saving={saving}
        dirty={text !== value}
        onClick={() => {
          setSaving(true);
          void onSave(text).finally(() => setSaving(false));
        }}
      />
    </div>
  );
}

function ModelsTab() {
  const [models, setModels] = useState<ModelRow[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");

  const reload = async () => {
    const res = await fetch("/api/models");
    const data = (await res.json()) as { models: ModelRow[] };
    setModels(data.models);
  };

  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((d: { models: ModelRow[] }) => setModels(d.models));
  }, []);

  if (!models) return <p className="text-sm text-muted">Loading…</p>;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-display text-sm font-semibold text-ink">Model registry</h3>
          <p className="mt-0.5 text-xs text-muted">
            Endpoints the platform can call. API keys come from the named env var.
          </p>
        </div>
        <button
          onClick={() => setAdding((a) => !a)}
          className="rounded-md border border-line px-3 py-1.5 font-mono text-xs text-ink-soft transition-colors hover:border-ink/30 hover:text-ink"
        >
          {adding ? "Cancel" : "+ Add"}
        </button>
      </div>
      {err && <p className="mb-2 text-sm text-rose-600 dark:text-rose-400">{err}</p>}
      {adding && (
        <ModelForm
          onDone={async (body, isEdit) => {
            const res = await fetch(isEdit ? `/api/models/${(body as { id: string }).id}` : "/api/models", {
              method: isEdit ? "PATCH" : "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            if (!res.ok) {
              setErr(((await res.json()) as { error?: string }).error ?? "Failed.");
              return;
            }
            setErr("");
            setAdding(false);
            void reload();
          }}
        />
      )}
      <div className="divide-y divide-line rounded-lg border border-line">
        {models.map((m) => (
          <ModelItem key={m.id} model={m} onChanged={() => void reload()} onError={setErr} />
        ))}
      </div>
    </div>
  );
}

function ModelForm({
  model,
  onDone,
}: {
  model?: ModelRow;
  onDone: (body: Record<string, unknown>, isEdit: boolean) => Promise<void> | void;
}) {
  const [id, setId] = useState(model?.id ?? "");
  const [name, setName] = useState(model?.name ?? "");
  const [adapterType, setAdapterType] = useState<ModelRow["adapterType"]>(model?.adapterType ?? "llm_chat");
  const [apiBase, setApiBase] = useState(model?.apiConfig.apiBase ?? "");
  const [apiKeyEnvVar, setApiKeyEnvVar] = useState(model?.apiConfig.apiKeyEnvVar ?? "");
  const [modelId, setModelId] = useState(model?.apiConfig.modelId ?? "");
  const [inputPerM, setInputPerM] = useState(String(model?.pricing.inputPerM ?? ""));
  const [outputPerM, setOutputPerM] = useState(String(model?.pricing.outputPerM ?? ""));
  const valid =
    (model ? true : id.trim()) &&
    name.trim() &&
    apiBase.trim() &&
    apiKeyEnvVar.trim() &&
    (adapterType === "custom_http" || modelId.trim()) &&
    !Number.isNaN(Number(inputPerM)) &&
    !Number.isNaN(Number(outputPerM));
  const submit = () => {
    void onDone(
      {
        ...(model ? {} : { id: id.trim() }),
        name: name.trim(),
        adapterType,
        apiConfig: { apiBase: apiBase.trim(), apiKeyEnvVar: apiKeyEnvVar.trim(), modelId: modelId.trim() },
        pricing: {
          inputPerM: Number(inputPerM),
          outputPerM: Number(outputPerM),
          outputFree: Number(outputPerM) === 0,
        },
      },
      Boolean(model),
    );
  };
  const inputCls =
    "rounded-md border border-line bg-panel px-3 py-2 font-mono text-sm text-ink placeholder:text-muted focus:border-accent-b/50 focus:outline-none";
  return (
    <div className="animate-rise mb-3 rounded-lg border border-line bg-paper p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {!model && (
          <input value={id} onChange={(e) => setId(e.target.value.toLowerCase())} placeholder="model_id" className={inputCls} />
        )}
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" className={inputCls} />
        <select
          value={adapterType}
          onChange={(e) => setAdapterType(e.target.value as ModelRow["adapterType"])}
          className={inputCls}
        >
          <option value="llm_chat">llm_chat</option>
          <option value="system_one">system_one</option>
          <option value="custom_http">custom_http</option>
        </select>
        <input value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder="Model id (e.g. kimi-k3)" className={inputCls} />
        <input value={apiBase} onChange={(e) => setApiBase(e.target.value)} placeholder="API base URL" className={`${inputCls} sm:col-span-2`} />
        <input value={apiKeyEnvVar} onChange={(e) => setApiKeyEnvVar(e.target.value)} placeholder="API key env var (e.g. LLM_API_KEY)" className={inputCls} />
        <div className="grid grid-cols-2 gap-3">
          <input value={inputPerM} onChange={(e) => setInputPerM(e.target.value)} placeholder="$/M input" className={inputCls} />
          <input value={outputPerM} onChange={(e) => setOutputPerM(e.target.value)} placeholder="$/M output" className={inputCls} />
        </div>
      </div>
      <span title={!valid ? "All fields are required" : undefined} className="mt-3 inline-block">
        <button
          onClick={submit}
          disabled={!valid}
          className="rounded-lg bg-ink px-4 py-2 font-display text-sm font-medium text-paper transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {model ? "Save" : "Add model"}
        </button>
      </span>
    </div>
  );
}

function ModelItem({
  model,
  onChanged,
  onError,
}: {
  model: ModelRow;
  onChanged: () => void;
  onError: (e: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const handleDelete = async () => {
    if (!confirm(`Delete model "${model.id}"?`)) return;
    const res = await fetch(`/api/models/${model.id}`, { method: "DELETE" });
    if (!res.ok) {
      onError(((await res.json()) as { error?: string }).error ?? "Failed.");
      return;
    }
    onChanged();
  };
  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <code className="max-w-full break-all rounded bg-track px-1.5 py-0.5 font-mono text-xs text-ink-soft">
              {model.id}
            </code>
            <span className="font-display text-sm font-medium text-ink">{model.name}</span>
            <span className="rounded-md bg-accent-a-soft px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-accent-a">
              {model.adapterType}
            </span>
          </div>
          <p className="mt-1 break-all font-mono text-xs text-muted">
            {model.apiConfig.apiBase} · {model.apiConfig.modelId} · key: {model.apiConfig.apiKeyEnvVar} · ${model.pricing.inputPerM}/M in · ${model.pricing.outputPerM}/M out
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => setEditing((e) => !e)}
            className="rounded px-2 py-1 font-mono text-xs text-ink-soft transition-colors hover:bg-track hover:text-ink"
          >
            {editing ? "Cancel" : "Edit"}
          </button>
          <button
            onClick={() => void handleDelete()}
            aria-label={`Delete ${model.id}`}
            className="rounded px-2 py-1 font-mono text-xs text-rose-600 transition-colors hover:bg-rose-50 dark:hover:bg-rose-950/40"
          >
            Delete
          </button>
        </div>
      </div>
      {editing && (
        <div className="mt-2">
          <ModelForm model={model} onDone={async (b) => {
            const res = await fetch(`/api/models/${model.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(b),
            });
            if (!res.ok) {
              onError(((await res.json()) as { error?: string }).error ?? "Failed.");
              return;
            }
            setEditing(false);
            onChanged();
          }} />
        </div>
      )}
    </div>
  );
}

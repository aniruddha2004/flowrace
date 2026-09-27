"use client";

import { useEffect, useRef, useState } from "react";
import type { AppConfig, Taxonomy, TaxonomyOption } from "@/lib/taxonomy";

// ---------------------------------------------------------------------------
// SettingsModal — 3 tabs: business context / system prompt / taxonomy editor.
// Changes take effect on the VERY NEXT API call (no server restart).
// ---------------------------------------------------------------------------

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

type TabId = "context" | "prompt" | "taxonomy";

const TABS: { id: TabId; label: string }[] = [
  { id: "context", label: "Business context" },
  { id: "prompt", label: "System prompt" },
  { id: "taxonomy", label: "Taxonomy editor" },
];

export function SettingsModal({ open, onClose }: SettingsModalProps) {
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

        <div className="border-b border-line px-6">
          <div className="flex gap-5">
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
          {tab === "taxonomy" && (
            <TaxonomyTab
              taxonomy={config?.taxonomy ?? null}
              onChange={(t) => setConfig((c) => (c ? { ...c, taxonomy: t } : c))}
            />
          )}
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

function TaxonomyTab({
  taxonomy,
  onChange,
}: {
  taxonomy: Taxonomy | null;
  onChange: (t: Taxonomy) => void;
}) {
  if (!taxonomy) return <p className="text-sm text-muted">Loading…</p>;
  return (
    <div className="space-y-6">
      {(["category", "priority", "route_to_team"] as const).map((type) => (
        <TaxonomySection
          key={type}
          type={type}
          options={taxonomy[type]}
          onChange={(updated) => onChange({ ...taxonomy, [type]: updated })}
        />
      ))}
    </div>
  );
}

type TaxonomyType = "category" | "priority" | "route_to_team";

const SECTION_LABELS: Record<TaxonomyType, string> = {
  category: "Category",
  priority: "Priority",
  route_to_team: "Route to team",
};

function TaxonomySection({
  type,
  options,
  onChange,
}: {
  type: TaxonomyType;
  options: TaxonomyOption[];
  onChange: (opts: TaxonomyOption[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const reload = async (): Promise<TaxonomyOption[]> => {
    const res = await fetch("/api/taxonomy");
    const data = (await res.json()) as { taxonomy: { [k: string]: TaxonomyOption[] } };
    return data.taxonomy[type];
  };

  const handleAdd = async () => {
    if (!newKey.trim() || !newLabel.trim()) return;
    await fetch("/api/taxonomy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taxonomyType: type,
        key: newKey.trim(),
        label: newLabel.trim(),
        description: newDesc.trim(),
      }),
    });
    onChange(await reload());
    setAdding(false);
    setNewKey("");
    setNewLabel("");
    setNewDesc("");
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this option? Past sessions keep their stored labels.")) return;
    await fetch(`/api/taxonomy/${id}`, { method: "DELETE" });
    onChange(await reload());
  };

  const handleUpdate = async (
    id: number,
    patch: Partial<{ label: string; description: string }>,
  ) => {
    await fetch(`/api/taxonomy/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    onChange(await reload());
  };

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-ink">{SECTION_LABELS[type]}</h3>
        <button
          onClick={() => setAdding((a) => !a)}
          className="rounded-md border border-line px-3 py-1.5 font-mono text-xs text-ink-soft transition-colors hover:border-ink/30 hover:text-ink"
        >
          {adding ? "Cancel" : "+ Add"}
        </button>
      </div>

      {adding && (
        <div className="animate-rise mb-3 rounded-lg border border-line bg-paper p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value.toLowerCase())}
              placeholder="key_snake_case"
              className="rounded-md border border-line bg-panel px-3 py-2 font-mono text-sm text-ink placeholder:text-muted focus:border-accent-b/50 focus:outline-none"
            />
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Display label"
              className="rounded-md border border-line bg-panel px-3 py-2 font-display text-sm text-ink placeholder:text-muted focus:border-accent-b/50 focus:outline-none"
            />
          </div>
          <textarea
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            rows={2}
            placeholder="What this option means (used by the LLM + Jev rubric)"
            className="mt-3 w-full resize-y rounded-lg border border-line bg-panel px-3 py-2 font-mono text-sm text-ink placeholder:text-muted focus:border-accent-b/50 focus:outline-none"
          />
          <span
            title={
              !newKey.trim() || !newLabel.trim()
                ? "Both Key and Label are required"
                : undefined
            }
            className="mt-3 inline-block"
          >
            <button
              onClick={handleAdd}
              disabled={!newKey.trim() || !newLabel.trim()}
              className="rounded-lg bg-ink px-4 py-2 font-display text-sm font-medium text-paper transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add option
            </button>
          </span>
        </div>
      )}

      <div className="divide-y divide-line rounded-lg border border-line">
        {options.map((opt) => (
          <TaxonomyRow key={opt.id} option={opt} onUpdate={handleUpdate} onDelete={handleDelete} />
        ))}
      </div>
    </section>
  );
}

function TaxonomyRow({
  option,
  onUpdate,
  onDelete,
}: {
  option: TaxonomyOption;
  onUpdate: (id: number, patch: Partial<{ label: string; description: string }>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(option.label);
  const [desc, setDesc] = useState(option.description);

  const save = async () => {
    await onUpdate(option.id, { label: label.trim(), description: desc.trim() });
    setEditing(false);
  };

  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-track px-1.5 py-0.5 font-mono text-xs text-ink-soft">
              {option.key}
            </code>
            {editing ? (
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="min-w-28 rounded border border-line bg-panel px-2 py-0.5 font-display text-sm text-ink focus:border-accent-b/50 focus:outline-none"
              />
            ) : (
              <span className="font-display text-sm font-medium text-ink">{option.label}</span>
            )}
          </div>
          {editing ? (
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={2}
              className="mt-1.5 w-full resize-y rounded border border-line bg-panel px-2 py-1 font-mono text-xs text-ink focus:border-accent-b/50 focus:outline-none"
            />
          ) : (
            <p className="mt-1 text-sm text-ink-soft">{option.description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => (editing ? void save() : setEditing(true))}
            className="rounded px-2 py-1 font-mono text-xs text-ink-soft transition-colors hover:bg-track hover:text-ink"
          >
            {editing ? "Save" : "Edit"}
          </button>
          {editing && (
            <button
              onClick={() => setEditing(false)}
              className="rounded px-2 py-1 font-mono text-xs text-muted hover:text-ink"
            >
              ✕
            </button>
          )}
          <button
            onClick={() => void onDelete(option.id)}
            aria-label={`Delete ${option.key}`}
            className="rounded px-2 py-1 font-mono text-xs text-rose-600 transition-colors hover:bg-rose-50 dark:hover:bg-rose-950/40"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

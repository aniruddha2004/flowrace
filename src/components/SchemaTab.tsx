"use client";

import { useState } from "react";
import type { Clue, OutputField, Project } from "@/lib/projects";

// ---------------------------------------------------------------------------
// SchemaTab — the generalized taxonomy editor. Operates on the project's full
// output schema: fields (any type), enum options, ranges, diagnostic clues,
// and the project's task description / input label / cross-cutting probes.
// ---------------------------------------------------------------------------

const inputCls =
  "w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent-b/50 focus:outline-none focus:ring-2 focus:ring-accent-b/20";

const smallBtn =
  "rounded-md border border-line px-2.5 py-1 font-mono text-xs text-ink-soft transition-colors hover:border-ink/30 hover:text-ink";

export function SchemaTab({
  project,
  onChanged,
}: {
  project: Project;
  onChanged: () => void;
}) {
  const [error, setError] = useState("");
  const patchProject = async (patch: Record<string, unknown>) => {
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error(((await response.json()) as { error?: string }).error ?? "Could not save project schema.");
      setError("");
      onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save project schema."); }
  };

  const patchSchema = (schema: OutputField[]) => patchProject({ outputSchema: schema });

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-md border border-bad/30 bg-bad-soft p-3 text-sm text-bad">{error}</p>}
      <ProjectMeta project={project} onSave={patchProject} />
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-ink">Output fields</h3>
          <AddFieldButton onAdd={(f) => patchSchema([...project.outputSchema, f])} />
        </div>
        <div className="space-y-4">
          {project.outputSchema.map((field, i) => (
            <FieldCard
              key={field.key}
              field={field}
              isFirst={i === 0}
              isLast={i === project.outputSchema.length - 1}
              onMove={(dir) => {
                const next = [...project.outputSchema];
                const target = i + dir;
                [next[i], next[target]] = [next[target], next[i]];
                void patchSchema(next);
              }}
              onPatch={(patch) => {
                const next = project.outputSchema.map((f, j) => (j === i ? { ...f, ...patch } : f));
                void patchSchema(next);
              }}
              onDelete={() => {
                if (!confirm(`Delete field "${field.label}"? Past sessions keep their stored labels.`)) return;
                void patchSchema(project.outputSchema.filter((_, j) => j !== i));
              }}
            />
          ))}
        </div>
      </div>
      <CrossCuttingEditor
        clues={project.crossCuttingClues}
        onChange={(clues) => void patchProject({ crossCuttingClues: clues })}
      />
    </div>
  );
}

function ProjectMeta({
  project,
  onSave,
}: {
  project: Project;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [task, setTask] = useState(project.taskDescription);
  const [label, setLabel] = useState(project.inputLabel);
  const [saving, setSaving] = useState(false);
  return (
    <section className="rounded-lg border border-line bg-paper p-4">
      <h3 className="mb-2 font-display text-sm font-semibold text-ink">Project</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-ink-soft">
          <span className="mb-1 block font-mono uppercase tracking-wide">Task description</span>
          <input className={inputCls} value={task} onChange={(e) => setTask(e.target.value)} />
        </label>
        <label className="text-xs text-ink-soft">
          <span className="mb-1 block font-mono uppercase tracking-wide">Input box label</span>
          <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => {
            setSaving(true);
            void onSave({ taskDescription: task, inputLabel: label }).finally(() => setSaving(false));
          }}
          disabled={saving || (task === project.taskDescription && label === project.inputLabel)}
          className="rounded-lg bg-ink px-4 py-2 font-display text-sm font-medium text-paper transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {(task !== project.taskDescription || label !== project.inputLabel) && (
          <span className="font-mono text-xs text-accent-a">unsaved changes</span>
        )}
      </div>
    </section>
  );
}

function AddFieldButton({ onAdd }: { onAdd: (f: OutputField) => void }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState<OutputField["type"]>("enum");
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={smallBtn}>
        + Add field
      </button>
    );
  }
  const valid = /^[a-z][a-z0-9_]*$/.test(key) && label.trim().length > 0;
  return (
    <div className="animate-rise mb-3 rounded-lg border border-line bg-paper p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <input className={inputCls} placeholder="key_snake_case" value={key} onChange={(e) => setKey(e.target.value.toLowerCase())} />
        <input className={inputCls} placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
        <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as OutputField["type"])}>
          <option value="enum">enum (options list)</option>
          <option value="float_range">float_range (number in range)</option>
          <option value="boolean">boolean (yes / no)</option>
          <option value="free_text">free_text (generated prose)</option>
        </select>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          disabled={!valid}
          onClick={() => {
            const field: OutputField = { key, label: label.trim(), type };
            if (type === "enum") field.options = [];
            if (type === "float_range") field.range = { min: 0, max: 1 };
            onAdd(field);
            setOpen(false);
            setKey("");
            setLabel("");
            setType("enum");
          }}
          className="rounded-lg bg-ink px-4 py-2 font-display text-sm font-medium text-paper transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Create field
        </button>
        <button onClick={() => setOpen(false)} className={smallBtn}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function FieldCard({
  field,
  isFirst,
  isLast,
  onMove,
  onPatch,
  onDelete,
}: {
  field: OutputField;
  isFirst: boolean;
  isLast: boolean;
  onMove: (dir: -1 | 1) => void;
  onPatch: (patch: Partial<OutputField>) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border border-line bg-paper">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <span className="font-display text-sm font-semibold text-ink">{field.label}</span>
        <span className="rounded bg-track px-2 py-0.5 font-mono text-[10px] text-muted">{field.key}</span>
        <span className="rounded bg-track px-2 py-0.5 font-mono text-[10px] uppercase text-muted">{field.type}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button aria-label="Move up" disabled={isFirst} onClick={() => onMove(-1)} className={`${smallBtn} disabled:opacity-30`}>↑</button>
          <button aria-label="Move down" disabled={isLast} onClick={() => onMove(1)} className={`${smallBtn} disabled:opacity-30`}>↓</button>
          <button onClick={() => setExpanded((v) => !v)} className={smallBtn}>{expanded ? "Done" : "Edit"}</button>
          <button onClick={onDelete} className={`${smallBtn} text-rose-600 hover:border-rose-300`}>Delete</button>
        </div>
      </div>
      {expanded && (
        <div className="animate-rise border-t border-line px-4 py-4">
          <label className="mb-3 block text-xs text-ink-soft">
            <span className="mb-1 block font-mono uppercase tracking-wide">Label</span>
            <input className={inputCls} value={field.label} onChange={(e) => onPatch({ label: e.target.value })} />
          </label>
          {field.type === "float_range" && (
            <div className="mb-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-ink-soft">
                <span className="mb-1 block font-mono uppercase tracking-wide">Range min</span>
                <input className={inputCls} type="number" value={field.range?.min ?? 0}
                  onChange={(e) => onPatch({ range: { min: Number(e.target.value), max: field.range?.max ?? 1 } })} />
              </label>
              <label className="text-xs text-ink-soft">
                <span className="mb-1 block font-mono uppercase tracking-wide">Range max</span>
                <input className={inputCls} type="number" value={field.range?.max ?? 1}
                  onChange={(e) => onPatch({ range: { min: field.range?.min ?? 0, max: Number(e.target.value) } })} />
              </label>
            </div>
          )}
          {field.type === "enum" && (
            <OptionsEditor options={field.options ?? []} onChange={(options) => onPatch({ options })} />
          )}
          {field.type !== "free_text" && (
            <CluesEditor clues={field.clues ?? []} onChange={(clues) => onPatch({ clues: clues.length ? clues : undefined })} />
          )}
        </div>
      )}
    </div>
  );
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: { key: string; label: string; description: string }[];
  onChange: (opts: { key: string; label: string; description: string }[]) => void;
}) {
  const [k, setK] = useState("");
  const [l, setL] = useState("");
  const [d, setD] = useState("");
  return (
    <div className="mb-3">
      <span className="mb-1 block font-mono text-xs uppercase tracking-wide text-ink-soft">Options</span>
      <div className="space-y-2">
        {options.map((o, i) => (
          <div key={o.key} className="grid gap-2 rounded-md border border-line p-2 sm:grid-cols-[1fr_1fr_2fr_auto]">
            <span className="self-center font-mono text-xs text-muted">{o.key}</span>
            <input className={inputCls} value={o.label}
              onChange={(e) => onChange(options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <input className={inputCls} value={o.description} placeholder="description (drives Jev's matching)"
              onChange={(e) => onChange(options.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
            <button aria-label={`Delete ${o.key}`} onClick={() => {
              if (confirm(`Delete option "${o.key}"? Past sessions keep their stored labels.`)) {
                onChange(options.filter((_, j) => j !== i));
              }
            }} className={`${smallBtn} text-rose-600 hover:border-rose-300`}>×</button>
          </div>
        ))}
      </div>
      <div className="mt-2 grid gap-2 rounded-md border border-dashed border-line p-2 sm:grid-cols-3">
        <input className={inputCls} placeholder="new_key" value={k} onChange={(e) => setK(e.target.value.toLowerCase())} />
        <input className={inputCls} placeholder="label — the criterion text" value={l} onChange={(e) => setL(e.target.value)} />
        <input className={inputCls} placeholder="description" value={d} onChange={(e) => setD(e.target.value)} />
      </div>
      <button
        className={`${smallBtn} mt-2`}
        disabled={!/^[a-z][a-z0-9_-]*$/.test(k) || !l.trim()}
        onClick={() => {
          onChange([...options, { key: k, label: l.trim(), description: d.trim() || l.trim() }]);
          setK(""); setL(""); setD("");
        }}
      >
        + Add option
      </button>
    </div>
  );
}

function CluesEditor({ clues, onChange }: { clues: Clue[]; onChange: (clues: Clue[]) => void }) {
  const [open, setOpen] = useState(false);
  const [k, setK] = useState("");
  const [l, setL] = useState("");
  const [q, setQ] = useState("");
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-wide text-ink-soft">Diagnostic clues (Jev signals)</span>
        <button onClick={() => setOpen((v) => !v)} className={smallBtn}>{open ? "—" : "+"}</button>
      </div>
      {clues.length === 0 ? (
        <p className="mb-1 text-xs text-muted">None — clues are derived from option descriptions.</p>
      ) : (
        <div className="space-y-2">
          {clues.map((c, i) => (
            <div key={c.key} className="grid gap-2 rounded-md border border-line p-2 sm:grid-cols-[1fr_1fr_2fr_auto]">
              <span className="self-center font-mono text-xs text-muted">{c.key}</span>
              <input className={inputCls} value={c.label}
                onChange={(e) => onChange(clues.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <input className={inputCls} value={c.question} placeholder="yes/no clue question"
                onChange={(e) => onChange(clues.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))} />
              <button aria-label={`Delete ${c.key}`} onClick={() => onChange(clues.filter((_, j) => j !== i))}
                className={`${smallBtn} text-rose-600 hover:border-rose-300`}>×</button>
            </div>
          ))}
        </div>
      )}
      {open && (
        <div className="mt-2 grid gap-2 rounded-md border border-dashed border-line p-2 sm:grid-cols-3">
          <input className={inputCls} placeholder="clue_key" value={k} onChange={(e) => setK(e.target.value.toLowerCase())} />
          <input className={inputCls} placeholder="label (UI row)" value={l} onChange={(e) => setL(e.target.value)} />
          <input className={inputCls} placeholder="Is there a …?" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}
      {open && (
        <button className={`${smallBtn} mt-2`} disabled={!/^[a-z][a-z0-9_-]*$/.test(k) || !l.trim() || !q.trim()}
          onClick={() => { onChange([...clues, { key: k, label: l.trim(), question: q.trim() }]); setK(""); setL(""); setQ(""); }}>
          + Save clue
        </button>
      )}
    </div>
  );
}

function CrossCuttingEditor({ clues, onChange }: { clues: Clue[]; onChange: (clues: Clue[]) => void }) {
  return (
    <section>
      <h3 className="mb-2 font-display text-sm font-semibold text-ink">Cross-cutting probes</h3>
      <p className="mb-3 text-sm leading-relaxed text-ink-soft">
        Extra yes/no context checks not tied to any one field — surfaced in the signals panel for every flow.
      </p>
      <CluesEditor clues={clues} onChange={onChange} />
    </section>
  );
}

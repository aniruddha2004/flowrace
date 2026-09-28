"use client";

import { useState } from "react";
import type { Project } from "@/lib/projects";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (projectId: string) => void;
}

export function NewProjectModal({ open, onClose, onCreated }: Props) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  if (!open) return null;

  const submit = async () => {
    setCreating(true);
    setError(null);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: id.trim(),
        name: name.trim(),
        outputSchema: [],
        inputLabel: name.trim(),
        taskDescription: name.trim(),
      }),
    });
    const data = (await res.json()) as { project?: Project; error?: string };
    setCreating(false);
    if (!res.ok || data.error) {
      setError(data.error ?? `HTTP ${res.status}`);
      return;
    }
    setId("");
    setName("");
    onCreated(data.project!.id);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="New project"
    >
      <div className="animate-modal w-full max-w-md rounded-xl border border-line bg-panel shadow-elevated">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-display text-sm font-semibold text-ink">New project</h2>
          <button onClick={onClose} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-track hover:text-ink">✕</button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <p className="text-xs leading-relaxed text-ink-soft">
            Creates a project with an empty output schema — open Settings → Output schema to add fields.
          </p>
          <input
            value={id}
            onChange={(e) => setId(e.target.value.toLowerCase())}
            placeholder="project-id (lowercase, dashes)"
            className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent-b/50 focus:outline-none focus:ring-2 focus:ring-accent-b/20"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Display name"
            className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent-b/50 focus:outline-none focus:ring-2 focus:ring-accent-b/20"
          />
          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <button onClick={onClose} className="rounded-md border border-line px-4 py-2 font-display text-sm text-ink-soft">Cancel</button>
          <button
            disabled={creating || !/^[a-z][a-z0-9-]*$/.test(id) || !name.trim()}
            onClick={() => void submit()}
            className="rounded-lg bg-ink px-4 py-2 font-display text-sm font-medium text-paper transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {creating ? "Creating…" : "Create project"}
          </button>
        </div>
      </div>
    </div>
  );
}

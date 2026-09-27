"use client";

import { useEffect, useState } from "react";
import type { SessionFull, SessionSummary } from "@/lib/sessions";

interface SessionSidebarProps {
  activeId: string | null;
  onSelect: (session: SessionFull) => void;
  onNew: () => void;
  refreshKey?: number;
}

export function SessionSidebar({ activeId, onSelect, onNew, refreshKey = 0 }: SessionSidebarProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const refresh = () => {
    fetch("/api/sessions")
      .then((res) => res.json())
      .then((data: { sessions: SessionSummary[] }) => setSessions(data.sessions))
      .catch(() => {});
  };

  useEffect(refresh, [refreshKey]);

  const load = async (id: string) => {
    const res = await fetch(`/api/sessions/${id}`);
    const data = (await res.json()) as { session: SessionFull };
    onSelect(data.session);
  };

  const deleteIds = async (ids: string[]) => {
    if (ids.length === 0) return;
    setDeleting(true);
    await fetch("/api/sessions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).catch(() => {});
    setChecked((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    if (ids.includes(activeId ?? "")) onNew();
    refresh();
    setDeleting(false);
  };

  const toggleCheck = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allChecked = sessions.length > 0 && checked.size === sessions.length;
  const toggleAll = () => {
    setChecked(allChecked ? new Set() : new Set(sessions.map((s) => s.id)));
  };

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-panel">
      <div className="flex h-14 items-center justify-between border-b border-line px-4">
        <h3 className="font-display text-sm font-semibold text-ink">History</h3>
        <button
          onClick={onNew}
          title="New race"
          aria-label="New race"
          className="flex h-7 w-7 items-center justify-center rounded-md text-accent-a transition-colors hover:bg-accent-a-soft active:scale-95"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      {sessions.length > 0 && (
        <div className="flex items-center justify-between border-b border-line px-3.5 py-1.5">
          <label className="flex cursor-pointer items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-muted hover:text-ink">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={toggleAll}
              className="h-3 w-3 accent-amber-700 dark:accent-amber-600"
            />
            Select all
          </label>
          {checked.size > 0 && (
            <span title={deleting ? "Delete in progress" : undefined}>
              <button
                onClick={() => void deleteIds([...checked])}
                disabled={deleting}
                className="font-mono text-[10px] font-semibold uppercase tracking-wide text-rose-600 transition-colors hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-rose-400"
              >
                {deleting ? "Deleting…" : `Delete ${checked.size}`}
              </button>
            </span>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
            <p className="font-mono text-xs text-muted">No sessions yet</p>
            <p className="max-w-40 text-xs text-muted">
              Runs are saved here automatically.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {sessions.map((s) => {
              const active = activeId === s.id;
              return (
                <li key={s.id} className="group relative">
                  <button
                    onClick={() => void load(s.id)}
                    className={`relative w-full pl-8 pr-9 py-3 text-left transition-colors ${
                      active ? "bg-accent-a-soft" : "hover:bg-track"
                    }`}
                  >
                    {active && (
                      <span className="absolute inset-y-0 left-0 w-0.5 bg-accent-a" aria-hidden />
                    )}
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-xs leading-snug text-ink">{s.label}</p>
                        <p className="mt-0.5 font-mono text-[10px] text-muted">
                          {new Date(s.createdAt).toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  </button>
                  <div
                    className="absolute inset-y-0 left-0 flex items-center pl-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={checked.has(s.id)}
                      onChange={() => toggleCheck(s.id)}
                      aria-label={`Select session ${s.label}`}
                      className="h-3 w-3 cursor-pointer accent-amber-700 opacity-50 transition-opacity hover:opacity-100 group-hover:opacity-100 dark:accent-amber-600"
                    />
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void deleteIds([s.id]);
                    }}
                    title="Delete this session"
                    aria-label={`Delete session ${s.label}`}
                    className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded text-muted opacity-40 transition-all hover:bg-rose-100 hover:text-rose-600 hover:opacity-100 group-hover:opacity-100 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6M14 11v6" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}

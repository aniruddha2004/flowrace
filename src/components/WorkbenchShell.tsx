"use client";

import { useEffect, useRef, useState } from "react";
import type { Project } from "@/lib/projects";
import { ThemeToggle } from "./ThemeToggle";

export type WorkbenchView = "home" | "overview" | "flows" | "builder" | "race" | "history" | "models" | "settings";

const tabs: { view: WorkbenchView; label: string }[] = [
  { view: "overview", label: "Overview" }, { view: "flows", label: "Flows" },
  { view: "race", label: "Race" }, { view: "history", label: "History" },
];

export function WorkbenchShell({ children, projects, project, view, onProject, onView, onNewProject }: {
  children: React.ReactNode; projects: Project[]; project: Project | null; view: WorkbenchView;
  onProject: (id: string) => void; onView: (view: WorkbenchView) => void; onNewProject: () => void;
}) {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [query, setQuery] = useState("");
  const switcherRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!switcherOpen) return;
    const close = (event: MouseEvent) => { if (!switcherRef.current?.contains(event.target as Node)) setSwitcherOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setSwitcherOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [switcherOpen]);
  const currentTab = view === "builder" ? "flows" : view;
  const matches = projects.filter((item) => `${item.name} ${item.id}`.toLowerCase().includes(query.toLowerCase()));

  return <div className="min-h-dvh bg-paper">
    <header className="sticky top-0 z-30 border-b border-line bg-panel/95 backdrop-blur-md">
      <div className="mx-auto flex h-[66px] max-w-[1800px] items-center gap-3 px-4 sm:px-6 lg:px-9">
        <button className="group flex shrink-0 items-center gap-2.5" onClick={() => onView("home")} aria-label="Flow Race projects">
          <span className="flex h-8 w-8 items-center justify-center rounded-[7px] bg-[#345beb] text-white">
            <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h6l4 7h6M4 19h6l4-7h6"/><circle cx="4" cy="5" r="1" fill="currentColor"/><circle cx="4" cy="19" r="1" fill="currentColor"/><circle cx="20" cy="12" r="1" fill="currentColor"/></svg>
          </span>
          <span className="hidden font-display text-[15px] font-semibold tracking-[-.04em] text-ink min-[390px]:inline">flow<span className="text-brand">race</span></span>
        </button>
        <span className="hidden h-5 w-px bg-line sm:block" aria-hidden="true" />
        <div className="relative min-w-0" ref={switcherRef}>
          <button aria-label="Switch project" aria-expanded={switcherOpen} onClick={() => { setSwitcherOpen((value) => !value); setQuery(""); }} className="flex max-w-[240px] items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium text-ink transition-colors hover:bg-track">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] bg-brand-soft font-display text-[11px] font-bold text-brand">{project?.name?.charAt(0).toUpperCase() ?? "⌂"}</span>
            <span className="truncate">{project?.name ?? "All projects"}</span><span className="text-muted" aria-hidden="true">⌄</span>
          </button>
          {switcherOpen && <div className="absolute left-0 top-full z-50 mt-2 w-[min(340px,calc(100vw-2rem))] rounded-[10px] border border-line bg-panel p-2 shadow-elevated">
            <input autoFocus className="ui-input mb-1" aria-label="Find project" placeholder="Find a project…" value={query} onChange={(event) => setQuery(event.target.value)} />
            <div className="max-h-56 overflow-y-auto py-1">{matches.map((item) => <button key={item.id} className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm hover:bg-track ${project?.id === item.id ? "bg-brand-soft font-semibold text-brand" : "text-ink"}`} onClick={() => { onProject(item.id); setSwitcherOpen(false); }}><span className="flex h-7 w-7 items-center justify-center rounded bg-track font-display text-xs font-semibold text-ink-soft">{item.name.charAt(0).toUpperCase()}</span><span className="truncate">{item.name}</span></button>)}
              {matches.length === 0 && <p className="px-3 py-3 text-sm text-muted">No matching projects</p>}</div>
            <button className="flex w-full items-center gap-2 border-t border-line px-3 py-3 text-left text-sm font-semibold text-brand hover:bg-brand-soft" onClick={() => { setSwitcherOpen(false); onNewProject(); }}>+ New project</button>
          </div>}
        </div>
        <nav aria-label="Global" className="ml-auto flex items-center gap-1">
          <button onClick={() => onView("models")} className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${view === "models" ? "bg-brand-soft text-brand" : "text-ink-soft hover:bg-track hover:text-ink"}`}>Models</button>
          <button onClick={() => onView("settings")} className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${view === "settings" ? "bg-brand-soft text-brand" : "text-ink-soft hover:bg-track hover:text-ink"}`}>Settings</button>
          <span className="ml-1 border-l border-line pl-2"><ThemeToggle /></span>
        </nav>
      </div>
      {project && !["home", "models", "settings"].includes(view) && <nav aria-label="Project workspace" className="mx-auto flex max-w-[1800px] gap-1 overflow-x-auto px-4 sm:px-6 lg:px-9">
        {tabs.map(({ view: tab, label }) => <button key={tab} onClick={() => onView(tab)} aria-current={currentTab === tab ? "page" : undefined} className={`relative shrink-0 px-3.5 py-3 text-sm transition-colors ${currentTab === tab ? "font-semibold text-brand after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:bg-brand" : "text-ink-soft hover:text-ink"}`}>{label}</button>)}
      </nav>}
    </header>
    <main key={`${project?.id ?? "all"}:${view}`} className="view-enter">{children}</main>
  </div>;
}

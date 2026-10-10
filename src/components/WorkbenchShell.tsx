"use client";

import { useEffect, useRef, useState } from "react";
import type { Project } from "@/lib/projects";
import { ThemeToggle } from "./ThemeToggle";

export type WorkbenchView = "home" | "overview" | "flows" | "builder" | "race" | "datasets" | "evaluations" | "history" | "models" | "settings";

const tabs: { view: WorkbenchView; label: string }[] = [
  { view: "overview", label: "Overview" }, { view: "flows", label: "Flows" },
  { view: "race", label: "Race" }, { view: "datasets", label: "Datasets" },
  { view: "evaluations", label: "Evaluations" }, { view: "history", label: "History" },
];

export function WorkbenchShell({ children, projects, project, view, onProject, onView, onNewProject }: {
  children: React.ReactNode; projects: Project[]; project: Project | null; view: WorkbenchView;
  onProject: (id: string) => void; onView: (view: WorkbenchView) => void; onNewProject: () => void;
}) {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [query, setQuery] = useState("");
  const switcherRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!switcherOpen && !navOpen) return;
    const close = (event: MouseEvent) => { if (!switcherRef.current?.contains(event.target as Node)) setSwitcherOpen(false); };
    const closeNav = (event: MouseEvent) => { if (!navRef.current?.contains(event.target as Node)) setNavOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setSwitcherOpen(false); setNavOpen(false); } };
    document.addEventListener("mousedown", close); document.addEventListener("mousedown", closeNav); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("mousedown", closeNav); document.removeEventListener("keydown", escape); };
  }, [switcherOpen, navOpen]);
  const currentTab = view === "builder" ? "flows" : view;
  const isHome = view === "home";
  const matches = projects.filter((item) => `${item.name} ${item.id}`.toLowerCase().includes(query.toLowerCase()));

  return <div className="min-h-dvh bg-paper">
    <header className="sticky top-0 z-30 border-b border-line bg-panel/95 backdrop-blur-md">
      <div className="mx-auto flex h-[66px] max-w-[1800px] items-center gap-3 px-4 sm:px-6 lg:px-9">
        <button className="group flex shrink-0 items-center gap-2.5" onClick={() => onView("home")} aria-label="Flow Race projects">
          <span className="flex h-8 w-8 items-center justify-center rounded-[7px] bg-[#345beb] text-white">
            <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h6l4 7h6M4 19h6l4-7h6"/><circle cx="4" cy="5" r="1" fill="currentColor"/><circle cx="4" cy="19" r="1" fill="currentColor"/><circle cx="20" cy="12" r="1" fill="currentColor"/></svg>
          </span>
          <span className="hidden font-display text-[15px] font-semibold tracking-[-.04em] text-ink sm:inline">flow<span className="text-brand">race</span></span>
        </button>
        <span className="hidden h-5 w-px bg-line sm:block" aria-hidden="true" />
        <div className="relative min-w-0 flex-1 sm:flex-none" ref={switcherRef}>
          <button aria-label="Switch project" aria-expanded={switcherOpen} onClick={() => { setSwitcherOpen((value) => !value); setQuery(""); setNavOpen(false); }} className="flex max-w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium text-ink transition-colors hover:bg-track sm:max-w-[240px]">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] bg-brand-soft font-display text-[11px] font-bold text-brand">{isHome ? "⌂" : project?.name?.charAt(0).toUpperCase() ?? "⌂"}</span>
            <span className="truncate">{isHome ? "All projects" : project?.name ?? "All projects"}</span><span className="text-muted" aria-hidden="true">⌄</span>
          </button>
          {switcherOpen && <div className="absolute left-0 top-full z-50 mt-2 w-[min(340px,calc(100vw-2rem))] rounded-[10px] border border-line bg-panel p-2 shadow-elevated">
            <input autoFocus className="ui-input mb-1" aria-label="Find project" placeholder="Find a project…" value={query} onChange={(event) => setQuery(event.target.value)} />
            <div className="max-h-56 overflow-y-auto py-1">{matches.map((item) => <button key={item.id} className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm hover:bg-track ${!isHome && project?.id === item.id ? "bg-brand-soft font-semibold text-brand" : "text-ink"}`} onClick={() => { onProject(item.id); setSwitcherOpen(false); }}><span className="flex h-7 w-7 items-center justify-center rounded bg-track font-display text-xs font-semibold text-ink-soft">{item.name.charAt(0).toUpperCase()}</span><span className="truncate">{item.name}</span></button>)}
              {matches.length === 0 && <p className="px-3 py-3 text-sm text-muted">No matching projects</p>}</div>
            <button className="flex w-full items-center gap-2 border-t border-line px-3 py-3 text-left text-sm font-semibold text-brand hover:bg-brand-soft" onClick={() => { setSwitcherOpen(false); onNewProject(); }}>+ New project</button>
          </div>}
        </div>
        <nav aria-label="Global" ref={navRef} className="relative ml-auto flex shrink-0 items-center gap-1">
          <button onClick={() => onView("models")} className={`hidden rounded-md px-3 py-2 text-sm font-medium transition-colors sm:inline-flex ${view === "models" ? "bg-brand-soft text-brand" : "text-ink-soft hover:bg-track hover:text-ink"}`}>Models</button>
          <button onClick={() => onView("settings")} className={`hidden rounded-md px-3 py-2 text-sm font-medium transition-colors sm:inline-flex ${view === "settings" ? "bg-brand-soft text-brand" : "text-ink-soft hover:bg-track hover:text-ink"}`}>Settings</button>
          <span className="sm:ml-1 sm:border-l sm:border-line sm:pl-2"><ThemeToggle /></span>
          <button className="ml-1 flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink-soft sm:hidden" aria-label="Open navigation menu" aria-expanded={navOpen} onClick={() => { setNavOpen((value) => !value); setSwitcherOpen(false); }}><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg></button>
          {navOpen && <div className="absolute right-0 top-full z-50 mt-3 w-44 rounded-md border border-line bg-panel p-2 shadow-elevated sm:hidden"><button className="block w-full rounded px-3 py-2 text-left text-sm text-ink hover:bg-track" onClick={() => { onView("models"); setNavOpen(false); }}>Models</button><button className="block w-full rounded px-3 py-2 text-left text-sm text-ink hover:bg-track" onClick={() => { onView("settings"); setNavOpen(false); }}>Settings</button></div>}
        </nav>
      </div>
      {project && !["home", "models", "settings"].includes(view) && <nav aria-label="Project workspace" className="mx-auto flex max-w-[1800px] gap-1 overflow-x-auto px-4 sm:px-6 lg:px-9">
        {tabs.map(({ view: tab, label }) => <button key={tab} onClick={() => onView(tab)} aria-current={currentTab === tab ? "page" : undefined} className={`relative shrink-0 px-3.5 py-3 text-sm transition-colors ${currentTab === tab ? "font-semibold text-brand after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:bg-brand" : "text-ink-soft hover:text-ink"}`}>{label}</button>)}
      </nav>}
    </header>
    <main key={`${project?.id ?? "all"}:${view}`} className="view-enter">{children}</main>
  </div>;
}

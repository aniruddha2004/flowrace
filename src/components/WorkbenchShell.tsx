"use client";

import { useEffect, useRef, useState } from "react";
import type { Project } from "@/lib/projects";
import { WorkbenchSidebar } from "./WorkbenchSidebar";

export type WorkbenchView = "home" | "overview" | "flows" | "builder" | "race" | "datasets" | "evaluations" | "history" | "models" | "providers" | "settings";

export function WorkbenchShell({ children, projects, project, view, onProject, onView, onNewProject }: {
  children: React.ReactNode; projects: Project[]; project: Project | null; view: WorkbenchView;
  onProject: (id: string) => void; onView: (view: WorkbenchView) => void; onNewProject: () => void;
}) {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [touchOpen, setTouchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const switcherRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!switcherOpen && !sidebarOpen) return;
    const close = (event: MouseEvent) => { if (!switcherRef.current?.contains(event.target as Node)) setSwitcherOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setSwitcherOpen(false); setSidebarOpen(false); } };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [switcherOpen, sidebarOpen]);

  const toggleSidebar = () => {
    if (window.matchMedia("(max-width: 767px)").matches) { setSidebarOpen((open) => !open); setSwitcherOpen(false); }
    else setTouchOpen((open) => !open);
  };
  const navigate = (target: WorkbenchView) => { setSidebarOpen(false); setTouchOpen(false); onView(target); };
  const expanded = hovered || focused || touchOpen;
  const matches = projects.filter((item) => `${item.name} ${item.id}`.toLowerCase().includes(query.toLowerCase()));
  const isHome = view === "home";

  return <div className="min-h-dvh bg-paper">
    <header className="sticky top-0 z-50 flex h-14 items-center justify-between bg-nav px-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button onClick={toggleSidebar} aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"} aria-expanded={sidebarOpen || touchOpen} className="touch-sidebar-toggle h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-nav-hover hover:text-ink">
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <button className="flex shrink-0 items-center gap-2" onClick={() => navigate("home")} aria-label="Flow Race projects">
          <span className="flex h-8 w-8 items-center justify-center rounded-[7px] bg-[#345beb] text-white"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h6l4 7h6M4 19h6l4-7h6"/><circle cx="4" cy="5" r="1" fill="currentColor"/><circle cx="4" cy="19" r="1" fill="currentColor"/><circle cx="20" cy="12" r="1" fill="currentColor"/></svg></span>
          <span className="hidden font-display text-[15px] font-semibold tracking-[-.04em] text-ink min-[420px]:inline">flow<span className="text-brand">race</span></span>
        </button>
      </div>
      <div className="relative min-w-0 max-w-[min(240px,56vw)]" ref={switcherRef}>
        <button aria-label="Switch project" aria-expanded={switcherOpen} onClick={() => { setSwitcherOpen((open) => !open); setQuery(""); setSidebarOpen(false); }} className="flex h-9 max-w-full items-center gap-2 rounded-md border border-transparent px-2 text-sm font-medium text-ink transition-colors hover:border-nav-line hover:bg-nav-hover sm:px-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] bg-brand-soft font-display text-[11px] font-bold leading-none text-brand">{isHome ? "⌂" : project?.name?.charAt(0).toUpperCase() ?? "⌂"}</span>
          <span className="min-w-0 truncate leading-none">{isHome ? "All projects" : project?.name ?? "All projects"}</span>
          <svg className="h-4 w-4 shrink-0 text-muted" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 7 5 5 5-5" /></svg>
        </button>
        {switcherOpen && <div className="absolute right-0 top-full z-50 mt-2 w-[min(340px,calc(100vw-1rem))] rounded-[10px] border border-line bg-panel p-2 shadow-elevated">
          <input autoFocus className="ui-input mb-1" aria-label="Find project" placeholder="Find a project…" value={query} onChange={(event) => setQuery(event.target.value)} />
          <div className="max-h-56 overflow-y-auto py-1">{matches.map((item) => <button key={item.id} className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm hover:bg-track ${!isHome && project?.id === item.id ? "bg-brand-soft font-semibold text-brand" : "text-ink"}`} onClick={() => { onProject(item.id); setSwitcherOpen(false); }}><span className="flex h-7 w-7 items-center justify-center rounded bg-track font-display text-xs font-semibold text-ink-soft">{item.name.charAt(0).toUpperCase()}</span><span className="truncate">{item.name}</span></button>)}{matches.length === 0 && <p className="px-3 py-3 text-sm text-muted">No matching projects</p>}</div>
          <button className="flex w-full items-center gap-2 border-t border-line px-3 py-3 text-left text-sm font-semibold text-brand hover:bg-brand-soft" onClick={() => { setSwitcherOpen(false); onNewProject(); }}>+ New project</button>
        </div>}
      </div>
    </header>
    <div className="flex min-h-[calc(100dvh-3.5rem)] items-stretch">
      <aside onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }} className="sticky top-14 z-30 hidden h-[calc(100dvh-3.5rem)] w-[60px] shrink-0 md:block"><div className={`h-full overflow-y-auto border-r border-nav-line bg-nav transition-[width,box-shadow] duration-200 ${expanded ? "w-[224px] shadow-elevated" : "w-[60px]"}`}><WorkbenchSidebar project={project} view={view} collapsed={!expanded} onNavigate={navigate} /></div></aside>
      <main key={`${project?.id ?? "all"}:${view}`} className="view-enter min-w-0 flex-1">{children}</main>
    </div>
    {sidebarOpen && <div className="fixed inset-x-0 bottom-0 top-14 z-40 md:hidden"><button aria-label="Close navigation" className="absolute inset-0 bg-ink/45" onClick={() => setSidebarOpen(false)} /><aside className="drawer-enter relative h-full w-[min(280px,calc(100vw-2.5rem))] overflow-y-auto border-r border-nav-line bg-nav shadow-elevated"><WorkbenchSidebar project={project} view={view} collapsed={false} onNavigate={navigate} /></aside></div>}
  </div>;
}

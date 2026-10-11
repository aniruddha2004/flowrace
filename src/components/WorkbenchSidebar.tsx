"use client";

import type { Project } from "@/lib/projects";
import { ThemeToggle } from "./ThemeToggle";
import type { WorkbenchView } from "./WorkbenchShell";

type IconName = "projects" | "overview" | "flows" | "race" | "datasets" | "evaluations" | "history" | "models" | "providers" | "settings";

function Icon({ name }: { name: IconName }) {
  const path: Record<IconName, React.ReactNode> = {
    projects: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    overview: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10Z" /><path d="M9 21v-7h6v7" /></>,
    flows: <><rect x="2" y="3" width="7" height="5" rx="1" /><rect x="15" y="16" width="7" height="5" rx="1" /><path d="M9 5.5h4a4 4 0 0 1 4 4V16M12 13h5" /></>,
    race: <><path d="M4 4v16M4 6h11l-2-2m2 2-2 2M4 18h14l-2-2m2 2-2 2" /><path d="M10 12h10" /></>,
    datasets: <><path d="M4 4h16v16H4zM4 10h16M10 4v16" /></>,
    evaluations: <><path d="M3 20h18M5 16l4-5 4 2 5-8" /><circle cx="18" cy="5" r="2" /></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
    models: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 3V1m8 2V1M8 23v-2m8 2v-2M3 8H1m2 8H1m22-8h-2m2 8h-2M9 9h6v6H9z" /></>,
    providers: <><circle cx="5" cy="12" r="2" /><circle cx="19" cy="5" r="2" /><circle cx="19" cy="19" r="2" /><path d="m7 11 10-5M7 13l10 5" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M10 2h4l.6 2.2 1.6.7 2-.9 2.8 2.8-.9 2 .7 1.6L23 11v4l-2.2.6-.7 1.6.9 2-2.8 2.8-2-.9-1.6.7L14 24h-4l-.6-2.2-1.6-.7-2 .9L3 19.2l.9-2-.7-1.6L1 15v-4l2.2-.6.7-1.6-.9-2L5.8 4l2 .9 1.6-.7L10 2Z" transform="translate(0 -1) scale(.92)" /></>,
  };
  return <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path[name]}</svg>;
}

const workspace: Array<{ view: WorkbenchView; label: string; icon: IconName }> = [
  { view: "overview", label: "Overview", icon: "overview" },
  { view: "flows", label: "Flows", icon: "flows" },
  { view: "race", label: "Race", icon: "race" },
  { view: "datasets", label: "Datasets", icon: "datasets" },
  { view: "evaluations", label: "Evaluations", icon: "evaluations" },
  { view: "history", label: "History", icon: "history" },
];

export function WorkbenchSidebar({ project, view, collapsed, onNavigate }: {
  project: Project | null; view: WorkbenchView; collapsed: boolean; onNavigate: (view: WorkbenchView) => void;
}) {
  const active = view === "builder" ? "flows" : view;
  const item = (target: WorkbenchView, label: string, icon: IconName) => <button key={target} onClick={() => onNavigate(target)} title={collapsed ? label : undefined} aria-label={label} aria-current={active === target ? "page" : undefined} className={`nav-press group relative flex min-h-10 w-full items-center gap-3 rounded-md text-left text-[13px] font-medium ${collapsed ? "justify-center px-2" : "px-3"} ${active === target ? "bg-brand-soft text-brand before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-brand" : "text-ink-soft hover:bg-track hover:text-ink"}`}><Icon name={icon} />{!collapsed && <span className="truncate">{label}</span>}</button>;
  return <nav aria-label="Main navigation" className="flex h-full min-h-0 flex-col bg-panel px-2.5 py-5">
    <div className="space-y-1">{item("home", "All projects", "projects")}</div>
    {project && <div className="mt-6 border-t border-line pt-5"><div className={`mb-3 flex min-w-0 items-center gap-2 px-2 ${collapsed ? "justify-center" : ""}`}><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-brand-soft font-display text-xs font-semibold text-brand">{project.name.charAt(0).toUpperCase()}</span>{!collapsed && <span className="min-w-0"><span className="block truncate text-xs font-semibold text-ink">{project.name}</span><span className="block font-mono text-[10px] text-muted">{project.outputSchema.length} output fields</span></span>}</div><div className="space-y-1">{workspace.map((tab) => item(tab.view, tab.label, tab.icon))}</div></div>}
    <div className="mt-6 border-t border-line pt-5"><p className={`mb-2 px-3 text-[11px] font-semibold text-muted ${collapsed ? "sr-only" : ""}`}>Library</p><div className="space-y-1">{item("models", "Model registry", "models")}{item("providers", "Providers", "providers")}</div></div>
    <div className="mt-auto border-t border-line pt-4"><div className="space-y-1">{item("settings", "Settings", "settings")}</div><div className={`mt-2 flex items-center gap-3 ${collapsed ? "justify-center" : "px-3"}`}><ThemeToggle />{!collapsed && <span className="text-xs text-ink-soft">Appearance</span>}</div></div>
  </nav>;
}

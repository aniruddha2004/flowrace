"use client";

import { useCallback, useEffect, useState } from "react";
import { datasetSamples, parseDatasetCsv, parseDatasetJson, validateDatasetItems, type DatasetIssue, type DatasetItem } from "@/lib/dataset-format";
import type { Dataset } from "@/lib/datasets";
import type { Project } from "@/lib/projects";

interface Editor { id?: string; name: string; format: "json" | "csv"; source: string }

export function DatasetsWorkspace({ project, onEvaluate }: { project: Project; onEvaluate: (dataset: Dataset) => void }) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [showSample, setShowSample] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [serverIssues, setServerIssues] = useState<DatasetIssue[]>([]);
  const reload = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/datasets`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load datasets.");
      setDatasets(data.datasets ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load datasets."); }
  }, [project.id]);
  useEffect(() => { const timer = setTimeout(() => { void reload(); }, 0); return () => clearTimeout(timer); }, [reload]);
  const sample = datasetSamples(project.outputSchema);
  let items: DatasetItem[] = [], parseError = "";
  if (editor?.source.trim()) {
    try { items = editor.format === "json" ? parseDatasetJson(editor.source) : parseDatasetCsv(editor.source, project.outputSchema); }
    catch (cause) { parseError = cause instanceof Error ? cause.message : "Could not parse items."; }
  }
  const issues = parseError ? [] : validateDatasetItems(items, project.outputSchema);
  const save = async () => {
    if (!editor || parseError || issues.length || !editor.name.trim()) return;
    setSaving(true); setError(""); setServerIssues([]);
    try {
      const response = await fetch(editor.id ? `/api/datasets/${encodeURIComponent(editor.id)}` : `/api/projects/${encodeURIComponent(project.id)}/datasets`, {
        method: editor.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: editor.name, items }),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? "Could not save dataset."); setServerIssues(data.issues ?? []); return; }
      await reload(); setEditor(null);
    } catch { setError("Could not save dataset."); }
    finally { setSaving(false); }
  };
  const remove = async (dataset: Dataset) => {
    if (!confirm(`Delete "${dataset.name}"? Saved evaluation reports will remain available.`)) return;
    const response = await fetch(`/api/datasets/${encodeURIComponent(dataset.id)}`, { method: "DELETE" });
    if (!response.ok) { setError("Could not delete dataset."); return; }
    await reload();
  };
  return <div className="ui-page">
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="ui-kicker mb-2">{project.name} / DATASETS</p><h1 className="font-display text-3xl font-semibold tracking-[-.05em] text-ink sm:text-[2.6rem]">Datasets</h1><p className="mt-2 text-sm text-ink-soft">Collect inputs and optional ground truth to evaluate flows beyond a single anecdote.</p></div><button className="ui-button ui-button-primary" onClick={() => { setEditor({ name: "", format: "json", source: "" }); setError(""); setServerIssues([]); }}>+ New dataset</button></div>
    {error && <p role="alert" className="mb-5 rounded-md border border-bad/30 bg-bad-soft p-4 text-sm text-bad">{error}</p>}
    {editor && <section className="ui-surface mb-7 overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4"><h2 className="font-display text-base font-semibold text-ink">{editor.id ? "Edit dataset" : "Create dataset"}</h2><button className="text-sm text-ink-soft hover:text-ink" onClick={() => setEditor(null)}>Close</button></div>
      <div className="space-y-5 p-5"><label className="block text-xs font-semibold text-ink-soft">Name<input aria-label="Dataset name" className="ui-input mt-2" value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} placeholder="e.g. Refund requests — October" /></label><div className="flex flex-wrap items-center gap-3"><label className="text-xs font-semibold text-ink-soft">Format<select aria-label="Dataset format" className="ui-input mt-1" value={editor.format} onChange={(event) => setEditor({ ...editor, format: event.target.value as Editor["format"], source: "" })}><option value="json">JSON</option><option value="csv">CSV</option></select></label><label className="text-xs font-semibold text-ink-soft">Upload .json or .csv<input aria-label="Upload dataset" type="file" accept=".json,.csv,application/json,text/csv" className="mt-1 block max-w-full text-xs text-ink-soft" onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then((source) => setEditor({ ...editor, format: file.name.toLowerCase().endsWith(".csv") ? "csv" : "json", source })); }} /></label><button className="ui-button self-end" onClick={() => setShowSample((value) => !value)}>{showSample ? "Hide" : "Show"} sample format</button></div>
        {showSample && <div className="rounded-md border border-line bg-track/40 p-3"><p className="mb-2 text-xs text-ink-soft">Generated from {project.name}&apos;s current output schema</p><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-ink">{editor.format === "json" ? sample.json : sample.csv}</pre><button className="mt-2 text-xs font-semibold text-brand hover:underline" onClick={() => setEditor({ ...editor, source: editor.format === "json" ? sample.json : sample.csv })}>Use this sample</button></div>}
        <label className="block text-xs font-semibold text-ink-soft">{editor.format.toUpperCase()} items<textarea aria-label="Dataset items" spellCheck={false} className="ui-input mt-2 min-h-56 resize-y font-mono text-xs leading-relaxed" value={editor.source} onChange={(event) => { setEditor({ ...editor, source: event.target.value }); setServerIssues([]); }} placeholder={editor.format === "json" ? sample.json : sample.csv} /></label>
        {(parseError || issues.length > 0 || serverIssues.length > 0) && <div role="alert" className="max-h-48 overflow-y-auto rounded-md border border-generate/30 bg-generate-soft p-4 text-xs text-generate"><p className="font-semibold">Fix these items before saving or running</p>{parseError && <p className="mt-1">{parseError}</p>}{[...issues, ...serverIssues].map((problem, index) => <p key={`${problem.item}-${index}`} className="mt-1">Item {problem.item}{problem.id ? ` (${problem.id})` : ""}: {problem.message}</p>)}</div>}
        {!parseError && issues.length === 0 && <div><p className="mb-2 text-xs font-semibold text-good">{items.length} valid items · {items.filter((item) => item.expected && Object.keys(item.expected).length).length} scored</p><div className="max-h-60 overflow-auto rounded-md border border-line"><table className="w-full min-w-[550px] text-left text-xs"><thead className="sticky top-0 bg-track"><tr><th className="px-3 py-2">ID</th><th className="px-3 py-2">Input preview</th><th className="px-3 py-2">Ground truth</th></tr></thead><tbody className="divide-y divide-line">{items.map((item) => <tr key={item.id}><td className="px-3 py-2 font-mono">{item.id}</td><td className="max-w-sm truncate px-3 py-2" title={item.input}>{item.input}</td><td className="px-3 py-2 font-mono text-ink-soft">{item.expected && Object.keys(item.expected).length ? JSON.stringify(item.expected) : "—"}</td></tr>)}</tbody></table></div></div>}
        <div className="flex gap-3 border-t border-line pt-4"><button className="ui-button ui-button-primary" disabled={saving || !editor.name.trim() || Boolean(parseError) || issues.length > 0} onClick={() => void save()}>{saving ? "Saving…" : editor.id ? "Save dataset" : "Create dataset"}</button><button className="ui-button" onClick={() => setEditor(null)}>Cancel</button></div>
      </div></section>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{datasets.map((dataset) => {
      const problems = validateDatasetItems(dataset.items, project.outputSchema);
      return <article key={dataset.id} className="ui-surface flex flex-col p-5"><div className="flex items-start justify-between gap-2"><h2 className="font-display text-base font-semibold text-ink">{dataset.name}</h2><span className="font-mono text-[11px] text-muted">{new Date(dataset.createdAt).toLocaleDateString()}</span></div><p className="mt-3 text-xs text-ink-soft">{dataset.items.length} inputs · {dataset.items.filter((item) => item.expected && Object.keys(item.expected).length).length} with ground truth</p><p className={`mt-1 text-xs ${problems.length ? "text-bad" : "text-good"}`}>{problems.length ? `${problems.length} schema issue(s) — edit before running` : "Ready to evaluate"}</p><div className="mt-5 flex flex-wrap gap-3 border-t border-line pt-4 text-xs font-semibold"><button disabled={Boolean(problems.length)} className="text-brand disabled:cursor-not-allowed disabled:opacity-40" onClick={() => onEvaluate(dataset)}>Evaluate ↗</button><button className="text-ink-soft hover:underline" onClick={() => { setEditor({ id: dataset.id, name: dataset.name, format: "json", source: JSON.stringify(dataset.items, null, 2) }); setError(""); setServerIssues([]); }}>Edit / preview</button><button className="ml-auto text-bad hover:underline" onClick={() => void remove(dataset)}>Delete</button></div></article>;
    })}{datasets.length === 0 && <div className="ui-surface col-span-full p-12 text-center"><p className="font-display text-base font-semibold text-ink">No datasets yet</p><p className="mt-2 text-sm text-muted">Paste JSON or upload CSV to create the first evaluation set.</p></div>}</div>
  </div>;
}

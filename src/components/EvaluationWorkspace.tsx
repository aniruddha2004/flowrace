"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dataset } from "@/lib/datasets";
import type { EvaluationEstimate, EvaluationRun, EvaluationStatus } from "@/lib/evaluations";
import type { Flow } from "@/lib/flows";
import type { Project } from "@/lib/projects";
import { fmtCost } from "@/lib/format";
import { EvaluationReport } from "./EvaluationReport";

interface RunSummary { id: string; datasetId: string; datasetName: string; status: EvaluationStatus; completed: number; total: number; flowNames: string[]; createdAt: string }

export function EvaluationWorkspace({ project, flows, initialDataset, onViewDatasets }: {
  project: Project; flows: Flow[]; initialDataset: Dataset | null; onViewDatasets: () => void;
}) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [datasetId, setDatasetId] = useState(initialDataset?.id ?? "");
  const [flowIds, setFlowIds] = useState<string[]>(flows.map((flow) => flow.id));
  const [repeats, setRepeats] = useState(1);
  const [concurrency, setConcurrency] = useState(3);
  const [tolerance, setTolerance] = useState(0.2);
  const [estimate, setEstimate] = useState<EvaluationEstimate | null>(null);
  const [estimateKey, setEstimateKey] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [run, setRun] = useState<EvaluationRun | null>(null);
  const [progress, setProgress] = useState<{ status: EvaluationStatus; completed: number; total: number; perFlow: Record<string, number> } | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const reportRef = useRef<HTMLDivElement>(null);
  const selectionKey = JSON.stringify([project.id, datasetId, flowIds, repeats, concurrency]);
  const currentEstimate = estimateKey === selectionKey ? estimate : null;

  const loadRuns = useCallback(async () => {
    const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/eval-runs`);
    if (response.ok) setRuns((await response.json()).runs ?? []);
  }, [project.id]);
  useEffect(() => {
    const timer = setTimeout(() => {
      void fetch(`/api/projects/${encodeURIComponent(project.id)}/datasets`).then((response) => response.json()).then((data) => setDatasets(data.datasets ?? []));
      void loadRuns();
    }, 0);
    return () => clearTimeout(timer);
  }, [project.id, loadRuns]);

  useEffect(() => {
    if (!datasetId || flowIds.length < 2) return;
    let active = true;
    const timer = setTimeout(() => {
      void fetch("/api/eval-runs/estimate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project.id, datasetId, flowIds, repeats, concurrency }) })
        .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Could not estimate cost."); return data.estimate as EvaluationEstimate; })
        .then((value) => { if (active) { setEstimate(value); setEstimateKey(selectionKey); setConfirmed(false); setError(""); } })
        .catch((cause) => { if (active) { setEstimate(null); setError(cause instanceof Error ? cause.message : "Could not estimate cost."); } });
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [datasetId, flowIds, repeats, concurrency, project.id, selectionKey]);

  const openRun = useCallback(async (id: string) => {
    const response = await fetch(`/api/eval-runs/${encodeURIComponent(id)}`);
    if (!response.ok) { setError("Could not load evaluation run."); return; }
    const value = (await response.json()).run as EvaluationRun;
    setRun(value);
    setProgress({ status: value.status, completed: value.result.completed, total: value.result.total, perFlow: value.result.perFlow });
    setTimeout(() => reportRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }), 50);
  }, []);

  useEffect(() => {
    if (!run || !["queued", "running", "cancel_requested"].includes(run.status)) return;
    let active = true;
    const controller = new AbortController();
    const listen = async () => {
      try {
        const response = await fetch(`/api/eval-runs/${encodeURIComponent(run.id)}/events`, { signal: controller.signal });
        if (!response.ok || !response.body) throw new Error("Could not stream evaluation progress.");
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
          for (const line of lines) if (line.trim() && active) {
            const event = JSON.parse(line) as NonNullable<typeof progress>;
            setProgress(event);
            if (["completed", "cancelled", "failed"].includes(event.status)) { await openRun(run.id); void loadRuns(); }
          }
        }
      } catch (cause) { if (active && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Progress stream disconnected. Reopen the run to reconnect."); }
    };
    void listen();
    return () => { active = false; controller.abort(); };
  }, [run, loadRuns, openRun]);

  const start = async () => {
    if (!currentEstimate || (currentEstimate.requiresConfirmation && !confirmed)) return;
    setStarting(true); setError(""); setRun(null); setProgress(null);
    try {
      const response = await fetch("/api/eval-runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project.id, datasetId, flowIds, repeats, concurrency, confirmCost: confirmed }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not start evaluation.");
      setRun(data.run as EvaluationRun); void loadRuns();
      setTimeout(() => reportRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }), 50);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start evaluation."); }
    finally { setStarting(false); }
  };
  const cancel = async () => {
    if (!run) return;
    const response = await fetch(`/api/eval-runs/${encodeURIComponent(run.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cancel: true }) });
    if (response.ok) { const value = (await response.json()).run as EvaluationRun; setRun(value); setProgress((previous) => previous && { ...previous, status: value.status }); }
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this evaluation report?")) return;
    const response = await fetch(`/api/eval-runs/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) { setError((await response.json()).error ?? "Could not delete run."); return; }
    if (run?.id === id) { setRun(null); setProgress(null); }
    void loadRuns();
  };
  const dataset = datasets.find((item) => item.id === datasetId);
  return <div className="ui-page space-y-7">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="ui-kicker mb-2">{project.name} / EVALUATIONS</p><h1 className="font-display text-3xl font-semibold tracking-[-.05em] text-ink sm:text-[2.6rem]">Evaluate pipelines</h1><p className="mt-2 text-sm text-ink-soft">Replace one-off anecdotes with measured results across a dataset.</p></div><button className="ui-button" onClick={onViewDatasets}>Manage datasets →</button></div>
    {run && <div ref={reportRef} className="scroll-mt-20 space-y-6"><section className="ui-surface p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-base font-semibold text-ink">{run.result.datasetName} · {progress?.status.replaceAll("_", " ") ?? run.status}</h2><p className="mt-1 font-mono text-xs text-ink-soft">{progress?.completed ?? run.result.completed} / {progress?.total ?? run.result.total} flow executions</p></div>{["queued", "running", "cancel_requested"].includes(progress?.status ?? run.status) && <button className="ui-button text-bad" disabled={(progress?.status ?? run.status) === "cancel_requested"} onClick={() => void cancel()}>{(progress?.status ?? run.status) === "cancel_requested" ? "Stopping after in-flight items…" : "Cancel run"}</button>}</div><div className="mt-4 h-2 overflow-hidden rounded-full bg-track"><div className="h-full bg-brand transition-[width] duration-500" style={{ width: `${100 * (progress?.completed ?? run.result.completed) / Math.max(1, progress?.total ?? run.result.total)}%` }} /></div><div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-ink-soft">{run.result.flowSnapshot.map((flow) => <span key={flow.id}>{flow.name}: {progress?.perFlow[flow.id] ?? run.result.perFlow[flow.id] ?? 0}/{run.result.items.length * run.result.options.repeats}</span>)}</div></section><EvaluationReport run={run} tolerance={tolerance} onToleranceChange={setTolerance} /></div>}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,.6fr)]"><section className="ui-surface p-5 sm:p-6"><h2 className="font-display text-base font-semibold text-ink">Configure a run</h2><div className="mt-5 grid gap-4 sm:grid-cols-3"><label className="text-xs font-semibold text-ink-soft sm:col-span-3">Dataset<select aria-label="Evaluation dataset" className="ui-input mt-1.5" value={datasetId} onChange={(event) => setDatasetId(event.target.value)}><option value="">Select a dataset</option>{datasets.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.items.length} items</option>)}</select></label><label className="text-xs font-semibold text-ink-soft">Repeats per item<select aria-label="Repeat count" className="ui-input mt-1.5" value={repeats} onChange={(event) => setRepeats(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((count) => <option key={count} value={count}>{count}</option>)}</select></label><label className="text-xs font-semibold text-ink-soft">Items in parallel<select aria-label="Item concurrency" className="ui-input mt-1.5" value={concurrency} onChange={(event) => setConcurrency(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((count) => <option key={count} value={count}>{count}</option>)}</select></label><div className="flex items-end text-xs text-ink-soft">{dataset?.items.length ?? 0} inputs · {flowIds.length} flows</div></div>
      <fieldset className="mt-5"><legend className="text-xs font-semibold text-ink-soft">Compare flows</legend><div className="mt-2 flex flex-wrap gap-2">{flows.map((flow) => <label key={flow.id} className={`cursor-pointer rounded-md border px-3 py-2 text-xs ${flowIds.includes(flow.id) ? "border-brand bg-brand-soft text-brand" : "border-line text-ink-soft"}`}><input type="checkbox" className="mr-2 accent-[#345beb]" checked={flowIds.includes(flow.id)} onChange={(event) => setFlowIds((previous) => event.target.checked ? [...previous, flow.id] : previous.filter((id) => id !== flow.id))} />{flow.name}</label>)}</div></fieldset>
      {currentEstimate && <div className="mt-5 rounded-md border border-line bg-track/30 p-4 text-sm"><div className="flex flex-wrap justify-between gap-2"><span className="text-ink-soft">Estimated model calls</span><strong className="font-mono text-ink">{currentEstimate.calls.toLocaleString()}</strong></div><div className="mt-2 flex flex-wrap justify-between gap-2"><span className="text-ink-soft">Estimated total cost</span><strong className="font-mono text-ink">{fmtCost(currentEstimate.costUsd)}</strong></div><p className="mt-2 text-xs text-muted">Based on input length, schema and registry rates; actual usage may differ. Confirmation threshold: {fmtCost(currentEstimate.thresholdUsd)}.</p>{currentEstimate.requiresConfirmation && <label className="mt-4 flex items-start gap-2 border-t border-line pt-3 text-xs text-generate"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I confirm this evaluation may cost more than {fmtCost(currentEstimate.thresholdUsd)}.</span></label>}</div>}
      {error && <p role="alert" className="mt-4 rounded bg-bad-soft p-3 text-sm text-bad">{error}</p>}
      <button className="ui-button ui-button-primary mt-5" disabled={starting || !currentEstimate || (currentEstimate.requiresConfirmation && !confirmed)} onClick={() => void start()}>{starting ? "Starting…" : "Start evaluation"}</button>
    </section><aside className="ui-surface overflow-hidden"><div className="border-b border-line px-5 py-4"><h2 className="font-display text-base font-semibold text-ink">Past evaluations</h2></div><div className="max-h-[450px] overflow-y-auto divide-y divide-line">{runs.map((item) => <div key={item.id} className={`flex items-stretch gap-1 hover:bg-track/40 ${run?.id === item.id ? "bg-brand-soft" : ""}`}><button onClick={() => void openRun(item.id)} className="min-w-0 flex-1 px-5 py-3 text-left"><span className="block truncate text-sm font-semibold text-ink">{item.datasetName}</span><span className="mt-1 block font-mono text-[11px] text-ink-soft">{item.status.replaceAll("_", " ")} · {item.completed}/{item.total}</span><span className="mt-1 block text-xs text-muted">{item.flowNames.join(" / ")} · {new Date(item.createdAt).toLocaleString()}</span></button>{!["queued", "running", "cancel_requested"].includes(item.status) && <button aria-label={`Delete evaluation ${item.datasetName}`} className="self-start px-3 py-4 text-xs text-bad" onClick={() => void remove(item.id)}>Delete</button>}</div>)}{!runs.length && <p className="p-5 text-sm text-muted">No evaluations yet.</p>}</div></aside></div>
  </div>;
}

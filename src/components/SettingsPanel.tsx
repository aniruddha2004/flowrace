"use client";

import { useEffect, useState } from "react";

export function SettingsPanel() {
  const [prompt, setPrompt] = useState("");
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { void fetch("/api/config").then((res) => res.json()).then((data) => { setPrompt(data.settings.systemPrompt); setSaved(data.settings.systemPrompt); }).catch(() => setError("Could not load settings.")); }, []);
  const save = async () => {
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systemPrompt: prompt }) });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not save settings.");
      setSaved(prompt);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save settings."); }
    finally { setSaving(false); }
  };
  return <div className="ui-page max-w-[1100px]"><p className="ui-kicker mb-2">WORKSPACE / SETTINGS</p><h1 className="font-display text-3xl font-semibold tracking-[-.05em] text-ink sm:text-[2.6rem]">Settings</h1><p className="mt-2 text-sm text-ink-soft">Global defaults for this workbench. Project-specific context and fields live in each project&apos;s Overview.</p>
    <section className="ui-surface mt-9 p-6 sm:p-8"><h2 className="font-display text-lg font-semibold text-ink">Base system prompt</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">The shared instruction supplied to LLM decision and generation steps. Output-field options are appended at run time; step-specific overrides belong in the flow builder.</p><textarea aria-label="Base system prompt" className="ui-input mt-5 min-h-56 resize-y font-mono text-xs leading-relaxed" value={prompt} onChange={(event) => setPrompt(event.target.value)} /><div className="mt-4 flex items-center gap-4"><button className="ui-button ui-button-primary" disabled={saving || prompt === saved} onClick={() => void save()}>{saving ? "Saving…" : "Save prompt"}</button>{prompt !== saved && <span className="text-xs text-generate">Unsaved changes</span>}</div>{error && <p role="alert" className="mt-4 text-sm text-bad">{error}</p>}</section>
    <section className="ui-surface mt-5 p-6 sm:p-8"><h2 className="font-display text-lg font-semibold text-ink">Appearance</h2><p className="mt-2 text-sm text-ink-soft">Choose light or dark mode with the toggle at the bottom of the sidebar. Your preference is saved in this browser.</p></section>
  </div>;
}

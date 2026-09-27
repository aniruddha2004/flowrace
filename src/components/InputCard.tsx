"use client";

interface InputCardProps {
  text: string;
  running: boolean;
  onTextChange: (text: string) => void;
  onRun: () => void;
}

export function InputCard({ text, running, onTextChange, onRun }: InputCardProps) {
  const trimmed = text.trim();
  const canRun = trimmed.length > 0 && !running;

  return (
    <section className="rounded-xl border border-line bg-panel p-5 sm:p-6">
      <div className="mb-3 flex items-baseline justify-between">
        <label htmlFor="ticket-input" className="font-display text-sm font-semibold text-ink">
          Support ticket
        </label>
        <span className="font-mono text-xs tabular-nums text-muted">
          {text.length.toLocaleString("en-US")} chars
        </span>
      </div>
      <textarea
        id="ticket-input"
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder="Paste raw support-ticket text here — an email, chat transcript, or complaint…"
        rows={7}
        className="w-full resize-y rounded-lg border border-line bg-paper p-4 text-sm leading-relaxed text-ink placeholder:text-muted transition-colors focus:border-accent-b/50 focus:outline-none focus:ring-2 focus:ring-accent-b/20"
      />
      <div className="mt-4 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-xs text-ink-soft">
          Both pipelines run concurrently on the server — results stream in live.
        </p>
        <span
          title={
            !canRun
              ? trimmed.length === 0
                ? "Paste a support ticket above first"
                : "A race is already running"
              : undefined
          }
        >
          <button
            type="button"
            onClick={onRun}
            disabled={!canRun}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-6 py-3 font-display text-sm font-semibold text-paper transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running && (
              <span
                aria-hidden
                className="h-4 w-4 animate-spin rounded-full border-2 border-paper/40 border-t-paper"
              />
            )}
            {running ? "Racing…" : "Run Race"}
          </button>
        </span>
      </div>
    </section>
  );
}

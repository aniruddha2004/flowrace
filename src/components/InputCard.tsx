"use client";

interface InputCardProps {
  text: string;
  running: boolean;
  onTextChange: (text: string) => void;
  onRun: () => void;
  inputLabel?: string;
  selectedCount?: number;
}

export function InputCard({ text, running, onTextChange, onRun, inputLabel, selectedCount = 2 }: InputCardProps) {
  const trimmed = text.trim();
  const canRun = trimmed.length > 0 && !running && selectedCount >= 2;

  return (
    <section className="ui-surface p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <label htmlFor="ticket-input" className="font-display text-base font-semibold text-ink">
          Run input
        </label>
        <span className="font-mono text-xs tabular-nums text-muted">
          {text.length.toLocaleString("en-US")} chars
        </span>
      </div>
      <textarea
        id="ticket-input"
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder={`Paste ${inputLabel?.toLowerCase() ?? "the input text"} here…`}
        rows={4}
        className="ui-input min-h-28 resize-y leading-relaxed placeholder:text-muted"
      />
      <div className="mt-3 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-xs text-ink-soft">
          {selectedCount < 2 ? "Select at least two flows to race." : `${selectedCount} flows run concurrently — results stream in live.`}
        </p>
        <span
          title={
            !canRun
              ? selectedCount < 2 ? "Select at least two flows" : trimmed.length === 0
                ? "Provide an input above first"
                : "A race is already running"
              : undefined
          }
        >
          <button
            type="button"
            onClick={onRun}
            disabled={!canRun}
            className="ui-button ui-button-primary w-full whitespace-nowrap sm:w-auto"
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

// ---------------------------------------------------------------------------
// Domain types. Fields (category/priority/route_to_team) are now dynamic
// string keys from SQLite taxonomy — NOT fixed enum literals. Sentiment stays
// a fixed continuous number.
// ---------------------------------------------------------------------------

export interface FieldConfidence {
  category: number;
  priority: number;
  sentiment: number;
  route_to_team: number;
}

// ---------------------------------------------------------------------------
// Transparency layer (additive). Flow A populates `reasoning` (an LLM can
// narrate prose); Flows B/C populate `signals` + `signalMismatch`. Each carries one of
// the two, never both. Older sessions have neither — renderers must guard.
// ---------------------------------------------------------------------------

export interface FieldSignal {
  match: boolean;
  confidence: number;
}

export interface TicketSignals {
  category: Record<string, FieldSignal>;
  priority: Record<string, FieldSignal>;
  route_to_team: Record<string, FieldSignal>;
  cross_cutting: Record<string, FieldSignal>;
}

export interface SignalMismatch {
  category: boolean;
  priority: boolean;
  route_to_team: boolean;
}

export interface TicketAnalysis {
  category: string;
  priority: string;
  sentiment: number; // -1 .. 1
  route_to_team: string;
  confidence: FieldConfidence;
  /** Flow A only — the LLM's own stated rationale (prose, uncalibrated). */
  reasoning?: string;
  /** Flows B/C — independent per-clue match probabilities. */
  signals?: TicketSignals;
  /** Flows B/C — true when the winner's signal is within 0.15 of runner-up. */
  signalMismatch?: SignalMismatch;
}

// Human-readable labels used by the UI.
export const FIELD_LABELS: Record<keyof FieldConfidence, string> = {
  category: "Category",
  priority: "Priority",
  sentiment: "Sentiment",
  route_to_team: "Route to team",
};

/** Read old ticket analyses and newer schema-shaped sessions from the local DB. */
export function asTicketAnalysis(input: unknown): TicketAnalysis | undefined {
  if (!input || typeof input !== "object") return undefined;
  const source = input as Record<string, unknown>;
  const values = source.values && typeof source.values === "object"
    ? source.values as Record<string, { value?: unknown; confidence?: unknown }>
    : null;
  const previous = source.confidence as Partial<FieldConfidence> | undefined;
  const get = (key: keyof FieldConfidence) => values ? values[key]?.value : source[key];
  const confidence = (key: keyof FieldConfidence) => values ? values[key]?.confidence : previous?.[key];
  const category = get("category");
  const priority = get("priority");
  const sentiment = get("sentiment");
  const route = get("route_to_team");
  if (typeof category !== "string" || typeof priority !== "string"
      || typeof route !== "string" || typeof sentiment !== "number" || !Number.isFinite(sentiment)) return undefined;
  const c = {} as FieldConfidence;
  for (const key of Object.keys(FIELD_LABELS) as (keyof FieldConfidence)[]) {
    const n = confidence(key);
    c[key] = typeof n === "number" && Number.isFinite(n) ? n : 0;
  }
  return {
    category,
    priority,
    sentiment,
    route_to_team: route,
    confidence: c,
    reasoning: typeof source.reasoning === "string" ? source.reasoning : undefined,
    signals: source.signals as TicketSignals | undefined,
    signalMismatch: source.signalMismatch as SignalMismatch | undefined,
  };
}

// ---------------------------------------------------------------------------
// Domain types — schema-driven. A project owns an OutputSchema; the engine
// produces a FlowAnalysis whose values are keyed by the schema's field keys.
// Nothing in this file may mention specific field keys (category, priority…).
// ---------------------------------------------------------------------------

export interface FieldSignal {
  match: boolean;
  confidence: number;
}

export const SCHEMA_VERSION = 2;

/** Generic flow output: decision values + generated free text, keyed by
 * OutputSchema field keys. `signals` maps field key → clue label → signal
 * (plus the reserved "cross_cutting" field key). */
export interface FlowAnalysis {
  schemaVersion: number;
  values: Record<string, { value: string | number | boolean; confidence: number }>;
  freeText: Record<string, string>;
  /** LLM decide steps only — the model's own stated rationale (uncalibrated). */
  reasoning?: string;
  /** Jev steps only — per-clue match probabilities from noul questions. */
  signals?: Record<string, Record<string, FieldSignal>>;
  /** Jev steps only — true when the winner's evidence is not clearly strongest. */
  signalMismatch?: Record<string, boolean>;
}

// ---------------------------------------------------------------------------
// Legacy shape + normalizer (sessions stored before the schema-driven engine).
// Old sessions keep their keys; this converts once at load time so renderers
// only ever see FlowAnalysis.
// ---------------------------------------------------------------------------

export interface LegacyTicketAnalysis {
  category: string;
  priority: string;
  sentiment: number;
  route_to_team: string;
  confidence: {
    category: number;
    priority: number;
    sentiment: number;
    route_to_team: number;
  };
  reasoning?: string;
  signals?: {
    category: Record<string, FieldSignal>;
    priority: Record<string, FieldSignal>;
    route_to_team: Record<string, FieldSignal>;
    cross_cutting: Record<string, FieldSignal>;
  };
  signalMismatch?: {
    category: boolean;
    priority: boolean;
    route_to_team: boolean;
  };
}

function isLegacyAnalysis(a: unknown): a is LegacyTicketAnalysis {
  return (
    typeof a === "object" &&
    a !== null &&
    !("values" in a) &&
    "category" in a &&
    "confidence" in a
  );
}

/** Convert any stored/mixed analysis payload to the generic FlowAnalysis. */
export function normalizeAnalysis(a: unknown): FlowAnalysis {
  if (typeof a !== "object" || a === null) {
    return { schemaVersion: SCHEMA_VERSION, values: {}, freeText: {} };
  }
  if (!isLegacyAnalysis(a)) {
    const cur = a as FlowAnalysis;
    return {
      ...cur,
      schemaVersion: cur.schemaVersion ?? SCHEMA_VERSION,
      values: cur.values ?? {},
      freeText: cur.freeText ?? {},
    };
  }
  const values: FlowAnalysis["values"] = {};
  for (const key of ["category", "priority", "sentiment", "route_to_team"] as const) {
    if (a[key] !== undefined) {
      values[key] = {
        value: a[key] as string | number,
        confidence: a.confidence?.[key] ?? 0,
      };
    }
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    values,
    freeText: {},
    reasoning: a.reasoning,
    signals: a.signals,
    signalMismatch: a.signalMismatch,
  };
}

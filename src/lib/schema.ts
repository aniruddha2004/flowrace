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
// narrate prose); Flow B populates `signals` + `signalMismatch` (Jev returns
// typed, calibrated values only — no prose). Each flow carries exactly one of
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
  /** Flow B only — per-option match probabilities from Jev noul questions. */
  signals?: TicketSignals;
  /** Flow B only — true when the winner's signal is within 0.15 of runner-up. */
  signalMismatch?: SignalMismatch;
}

// Human-readable labels used by the UI.
export const FIELD_LABELS: Record<keyof FieldConfidence, string> = {
  category: "Category",
  priority: "Priority",
  sentiment: "Sentiment",
  route_to_team: "Route to team",
};

import type { SystemOneAdapter } from "../adapters/system-one";
import type { OutputField, OutputSchema } from "../projects";
import { SCHEMA_VERSION, type FieldSignal, type FlowAnalysis } from "../schema";
import {
  buildSignalPlan,
  buildState,
  decisionFields,
  jevDecisionSpecs,
} from "./buildQuestions";
import type { FlowSettings } from "./llmTriage";

export interface JevClassifyResult {
  analysis: FlowAnalysis;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  parseErrors: 0;
}

function noulSignal(p: number): FieldSignal {
  return { match: p >= 0.5, confidence: p };
}

/** Score-index answer → range value: index i of S bands maps linearly min..max. */
function mapScore(value: number, field: OutputField): number {
  const min = field.range?.min ?? 0;
  const max = field.range?.max ?? 1;
  const bands = field.scale?.length ?? 5;
  return min + ((max - min) * value) / (bands - 1);
}

const MISMATCH_LEVEL = 0.15;

/** Winner's supporting evidence not clearly strongest → mismatch, per field.
 * Fields with support/oppose clue groups use ordinal-position logic; plain
 * fields use winner-vs-runner-up margin. */
function computeSignalMismatch(
  schema: OutputSchema,
  signals: Record<string, Record<string, FieldSignal>>,
  winners: Record<string, string>,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const f of schema) {
    if (f.type !== "enum") continue;
    const fieldSignals = signals[f.key] ?? {};
    const entries = Object.entries(fieldSignals);
    const winnerKey = winners[f.key];
    if (!winnerKey || entries.length === 0) continue;

    if (f.supportClues?.length && f.opposeClues?.length) {
      const keys = (f.options ?? []).map((o) => o.key);
      const idx = keys.indexOf(winnerKey);
      if (idx === -1) continue;
      const pos = keys.length > 1 ? idx / (keys.length - 1) : 1;
      const clues = f.clues ?? [];
      const labelOf = (k: string) => clues.find((c) => c.key === k)?.label ?? k;
      const supportMax = Math.max(...f.supportClues.map((k) => fieldSignals[labelOf(k)]?.confidence ?? 0));
      const opposeMax = f.opposeClues.reduce(
        (m, k) => Math.max(m, fieldSignals[labelOf(k)]?.confidence ?? 0),
        0,
      );
      const [support, oppose] = pos >= 0.5 ? [supportMax, opposeMax] : [opposeMax, supportMax];
      out[f.key] = support - oppose < MISMATCH_LEVEL;
      continue;
    }
    if (entries.length < 2) continue;
    const winnerLabel =
      (f.clues ?? []).find((c) => c.key === winnerKey)?.label ??
      (() => {
        const desc = (f.options ?? []).find((o) => o.key === winnerKey)?.description.trim().replace(/\.$/, "");
        return desc ? "describes " + desc.charAt(0).toLowerCase() + desc.slice(1) : winnerKey;
      })();
    const winnerConf = fieldSignals[winnerLabel]?.confidence ?? 0;
    const runnerUp =
      entries.filter(([k]) => k !== winnerLabel).map(([, s]) => s.confidence).sort((a, b) => b - a)[0] ?? 0;
    out[f.key] = winnerConf - runnerUp < MISMATCH_LEVEL;
  }
  return out;
}

export async function classifyWithJev(
  inputText: string,
  schema: OutputSchema,
  settings: FlowSettings,
  adapter: SystemOneAdapter,
  promptOverride?: string,
): Promise<JevClassifyResult> {
  const state = buildState(inputText, settings.project.personaContext);
  const specs = [
    ...jevDecisionSpecs(state, schema, settings.project).map((spec) => promptOverride ? { ...spec, instructions: promptOverride } : spec),
    ...buildSignalPlan(schema, settings.project).specs,
  ];
  const plan = buildSignalPlan(schema, settings.project);
  const out = await adapter.runDecision({ text: state, questions: specs });

  const values: FlowAnalysis["values"] = {};
  const winners: Record<string, string> = {};
  for (const f of decisionFields(schema)) {
    const ans = out.answers[f.key];
    if (!ans) continue;
    if (f.type === "float_range") {
      const mapped = mapScore(ans.value as number, f);
      values[f.key] = { value: mapped, confidence: ans.confidence };
    } else if (f.type === "boolean") {
      const p = ans.value as number;
      values[f.key] = { value: p >= 0.5, confidence: Math.max(p, 1 - p) };
    } else {
      values[f.key] = { value: ans.value as string, confidence: ans.confidence };
      winners[f.key] = ans.value as string;
    }
  }

  // Parity with the pre-registry shape: only fields that actually have clue
  // probes get a signals section — floats/booleans with no clues are omitted
  // entirely (no empty sections).
  const signals: NonNullable<FlowAnalysis["signals"]> = {};
  for (const [key, meta] of Object.entries(plan.mapping)) {
    (signals[meta.field] ??= {})[meta.label] = out.answers[key]
      ? noulSignal(out.answers[key].value as number)
      : { match: false, confidence: 0 };
  }

  return {
    analysis: {
      schemaVersion: SCHEMA_VERSION,
      values,
      freeText: {},
      signals,
      signalMismatch: computeSignalMismatch(schema, signals, winners),
    },
    inputTokens: out.inputTokens,
    outputTokens: out.outputTokens,
    costUsd: adapter.cost(out.inputTokens, out.outputTokens),
    parseErrors: 0,
  };
}

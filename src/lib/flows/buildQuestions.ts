import type { QuestionSpec } from "../adapters/types";
import type { Clue, OutputField, OutputSchema, Project } from "../projects";

// ---------------------------------------------------------------------------
// Shared prompt/state builders — driven by OutputSchema + Project so any
// field set works with zero code changes. The seeded ticket project's field
// prompts reproduce the pre-registry wording byte-for-byte; projects without
// hand-written prompts get derived wording.
// ---------------------------------------------------------------------------

export const STATE_INPUT_MARKER = "Ticket:";

/** Decision fields = everything the model scores/chooses; free_text excluded. */
export function decisionFields(schema: OutputSchema): OutputField[] {
  return schema.filter((f) => f.type !== "free_text");
}

export function freeTextFields(schema: OutputSchema): OutputField[] {
  return schema.filter((f) => f.type === "free_text");
}

export function buildState(inputText: string, persona: string): string {
  return persona.trim()
    ? `Business context:\n${persona.trim()}\n\nTicket:\n${inputText}`
    : inputText;
}

function fieldPrompt(field: OutputField, project: Project): string {
  switch (field.type) {
    case "enum":
      return (
        field.prompt ??
        `Classify ${field.label.toLowerCase()} for this ${project.taskDescription.toLowerCase()}.`
      );
    case "float_range":
      return (
        field.prompt ??
        `Rate ${field.label.toLowerCase()} for this ${project.taskDescription.toLowerCase()}.`
      );
    case "boolean":
      return (
        field.prompt ??
        `Answer whether ${field.label.toLowerCase()} holds for this ${project.taskDescription.toLowerCase()}.`
      );
    default:
      return field.prompt ?? `Assess ${field.label.toLowerCase()}.`;
  }
}

export function floatScale(field: OutputField): string[] {
  if (field.scale && field.scale.length >= 2) return field.scale;
  const min = field.range?.min ?? 0;
  const max = field.range?.max ?? 1;
  return [
    `Very low — closest to ${min} (${field.label.toLowerCase()} absent)`,
    `Low — weak ${field.label.toLowerCase()}`,
    `Medium — moderate ${field.label.toLowerCase()}`,
    `High — strong ${field.label.toLowerCase()}`,
    `Very high — closest to ${max} (extreme ${field.label.toLowerCase()})`,
  ];
}

// -- system_one decision specs -------------------------------------------------

export function jevDecisionSpecs(
  state: string,
  schema: OutputSchema,
  project: Project,
): QuestionSpec[] {
  // Wire-order parity: enums in schema order, then float ranges, then booleans.
  const fields = decisionFields(schema);
  const ordered = [
    ...fields.filter((f) => f.type === "enum"),
    ...fields.filter((f) => f.type === "float_range"),
    ...fields.filter((f) => f.type === "boolean"),
  ];
  return ordered.map((f) => {
    const instructions = `${fieldPrompt(f, project)}\n\n${STATE_INPUT_MARKER}\n${state}`;
    switch (f.type) {
      case "enum":
        return {
          key: f.key,
          type: "enum",
          instructions,
          options: f.options ?? [],
        };
      case "float_range":
        return {
          key: f.key,
          type: "float_range",
          instructions,
          scale: floatScale(f),
        };
      case "boolean":
        // system_one answers booleans as noul passes; the flow converts p→bool.
        return { key: f.key, type: "noul", instructions };
      default:
        return { key: f.key, type: "enum", instructions, options: [] };
    }
  });
}

// -- signals -------------------------------------------------------------------

/** Clue key → Jev question key. Cross-cutting probes are namespace-prefixed. */
export function clueSpecKey(fieldKey: string, clueKey: string): string {
  return fieldKey === "cross_cutting" ? `signal_x_${clueKey}` : `signal_${fieldKey}_${clueKey}`;
}

/** Enum clue rows: option-derived labels likely read "describes …", matching
 * the historical UI row labels for option-driven fields. */
export function derivedClues(field: OutputField): Clue[] {
  return (field.options ?? []).map((o) => {
    const d = o.description.trim().replace(/\.$/, "");
    return {
      key: o.key,
      label: "describes " + d.charAt(0).toLowerCase() + d.slice(1),
      question:
        "Content check about the ticket's subject matter (this is not a label assignment): " +
        `does the ticket describe the following situation — ${o.description}?`,
    };
  });
}

export function cluesForField(field: OutputField): Clue[] {
  if (field.type === "enum") return field.clues ?? derivedClues(field);
  return field.clues ?? [];
}

export interface SignalPlan {
  /** spec key → { field, label }. */
  mapping: Record<string, { field: string; label: string }>;
  specs: QuestionSpec[];
}

export function buildSignalPlan(schema: OutputSchema, project: Project): SignalPlan {
  const mapping: SignalPlan["mapping"] = {};
  const specs: QuestionSpec[] = [];
  const planFor = (fieldKey: string, clues: Clue[]) => {
    for (const clue of clues) {
      const key = clueSpecKey(fieldKey, clue.key);
      mapping[key] = { field: fieldKey, label: clue.label };
      specs.push({ key, type: "noul", instructions: clue.question });
    }
  };
  // Wire-order parity with the pre-registry engine: option-derived enum clues
  // first (schema order), then hand-written clue sets, then cross-cutting.
  const fields = decisionFields(schema);
  for (const f of fields.filter((x) => x.type === "enum" && !x.clues)) {
    planFor(f.key, derivedClues(f));
  }
  for (const f of fields.filter((x) => x.clues && x.clues.length > 0)) {
    planFor(f.key, f.clues ?? []);
  }
  planFor("cross_cutting", project.crossCuttingClues);
  return { mapping, specs };
}

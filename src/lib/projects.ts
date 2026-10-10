import { getDb } from "./db";
import { seedModels } from "./models";

// ---------------------------------------------------------------------------
// Projects — a project owns its input kind, output schema (the fields a flow
// must produce), and persona context. The ticket-triage app is the seeded
// project; its fields generalize the old global taxonomy_options table.
// ---------------------------------------------------------------------------

export interface OutputFieldOption {
  key: string;
  label: string;
  description: string;
}

/** Diagnostic evidence clue (Jev noul probe). For enum fields: when absent,
 * clues are derived from option descriptions, exactly as Flow B did before. */
export interface Clue {
  key: string;
  label: string;
  question: string;
}

export interface OutputField {
  key: string;
  label: string;
  type: "enum" | "float_range" | "boolean" | "free_text";
  options?: OutputFieldOption[];
  range?: { min: number; max: number };
  clues?: Clue[];
  /** Ordinal enum: clue keys in the "winner position implies support" group. */
  supportClues?: string[];
  /** Ordinal enum: clue keys in the opposing group (evidence against winner). */
  opposeClues?: string[];
  /** Rubric/instruction lead for the system_one decide question. */
  prompt?: string;
  /** float_range anchors [low, mid, high] for the llm_chat system listing. */
  systemHint?: [string, string, string];
  /** Hint lead for the llm_chat tool field description. */
  promptHint?: string;
  /** float_range rubric bands for system_one (len = number of score bands). */
  scale?: string[];
  /** free_text: standalone generation instruction (Flow A). */
  generatePrompt?: string;
  /** free_text: generation instruction when decisions are authoritative (Flow B). */
  constrainedPrompt?: string;
}

export type OutputSchema = OutputField[];

export interface Project {
  id: string;
  name: string;
  inputSchema: { kind: "text" };
  outputSchema: OutputSchema;
  personaContext: string;
  /** What the model is doing, in a sentence — replaces hardcoded task phrases. */
  taskDescription: string;
  /** Label for the input text area in the UI. */
  inputLabel: string;
  crossCuttingClues: Clue[];
  createdAt: string;
}

function toProject(r: {
  id: string;
  name: string;
  input_schema_json: string;
  output_schema_json: string;
  persona_context: string;
  task_description: string;
  input_label: string;
  cross_cutting_clues_json: string;
  created_at: string;
}): Project {
  return {
    id: r.id,
    name: r.name,
    inputSchema: JSON.parse(r.input_schema_json) as { kind: "text" },
    outputSchema: JSON.parse(r.output_schema_json) as OutputSchema,
    personaContext: r.persona_context,
    taskDescription: r.task_description,
    inputLabel: r.input_label,
    crossCuttingClues: JSON.parse(r.cross_cutting_clues_json) as Clue[],
    createdAt: r.created_at,
  };
}


export function listProjects(): Project[] {
  const d = getDb();
  const rows = d
    .prepare("SELECT * FROM projects ORDER BY created_at ASC, id ASC")
    .all() as Parameters<typeof toProject>[0][];
  return rows.map(toProject);
}

export function getProject(id: string): Project | null {
  const d = getDb();
  const row = d.prepare("SELECT * FROM projects WHERE id = ?").get(id) as
    | Parameters<typeof toProject>[0]
    | undefined;
  return row ? toProject(row) : null;
}

/** The single project the current app runs against. */
export function getDefaultProject(): Project {
  const first = listProjects()[0];
  if (!first) throw new Error("No project seeded.");
  return first;
}

export function updateProject(
  id: string,
  patch: Partial<{
    name: string;
    outputSchema: OutputSchema;
    personaContext: string;
    taskDescription: string;
    inputLabel: string;
    crossCuttingClues: Clue[];
  }>,
): { ok: true } | { ok: false; error: string } {
  const existing = getProject(id);
  if (!existing) return { ok: false, error: "Project not found." };
  getDb()
    .prepare(
      `UPDATE projects
       SET name = ?, output_schema_json = ?, persona_context = ?,
           task_description = ?, input_label = ?, cross_cutting_clues_json = ?
       WHERE id = ?`,
    )
    .run(
      patch.name ?? existing.name,
      JSON.stringify(patch.outputSchema ?? existing.outputSchema),
      patch.personaContext ?? existing.personaContext,
      patch.taskDescription ?? existing.taskDescription,
      patch.inputLabel ?? existing.inputLabel,
      JSON.stringify(patch.crossCuttingClues ?? existing.crossCuttingClues),
      id,
    );
  return { ok: true };
}

export function deleteProject(id: string): { ok: true } | { ok: false; error: string } {
  if (!getProject(id)) return { ok: false, error: "Project not found." };
  const flowCount = (getDb().prepare("SELECT COUNT(*) AS n FROM flows WHERE project_id = ?").get(id) as { n: number }).n;
  if (flowCount) return { ok: false, error: `Project has ${flowCount} flow(s); delete them first.` };
  const raceCount = (getDb().prepare("SELECT COUNT(*) AS n FROM sessions WHERE project_id = ?").get(id) as { n: number }).n;
  if (raceCount) return { ok: false, error: `Project has ${raceCount} saved race(s); delete them first.` };
  const evalCount = (getDb().prepare("SELECT COUNT(*) AS n FROM eval_runs WHERE project_id = ?").get(id) as { n: number }).n;
  if (evalCount) return { ok: false, error: `Project has ${evalCount} saved evaluation(s); delete them first.` };
  const datasetCount = (getDb().prepare("SELECT COUNT(*) AS n FROM datasets WHERE project_id = ?").get(id) as { n: number }).n;
  if (datasetCount) return { ok: false, error: `Project has ${datasetCount} dataset(s); delete them first.` };
  getDb().prepare("DELETE FROM projects WHERE id = ?").run(id);
  return { ok: true };
}

export function createProject(input: {
  id: string;
  name: string;
  outputSchema: OutputSchema;
  personaContext?: string;
  taskDescription?: string;
  inputLabel?: string;
  crossCuttingClues?: Clue[];
}): { ok: true; project: Project } | { ok: false; error: string } {
  try {
    getDb()
      .prepare(
        `INSERT INTO projects (id, name, input_schema_json, output_schema_json, persona_context, task_description, input_label, cross_cutting_clues_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.name,
        JSON.stringify({ kind: "text" }),
        JSON.stringify(input.outputSchema),
        input.personaContext ?? "",
        input.taskDescription ?? "",
        input.inputLabel ?? input.name,
        JSON.stringify(input.crossCuttingClues ?? []),
      );
    return { ok: true, project: getProject(input.id)! };
  } catch (err) {
    if (err instanceof Error && err.message.includes("UNIQUE constraint")) {
      return { ok: false, error: `Project "${input.id}" already exists.` };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Seed migration — the existing taxonomy_options data + business context
// become the seeded project's output_schema_json + persona_context. Sentiment
// becomes a float_range field. Field order mirrors the historical LLM tool
// schema (category, priority, sentiment, route_to_team) so prompts are
// byte-identical after the engine retargets in a later commit.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Seeded ticket project — every prompt string below MUST match the pre-
// registry engine's text byte-for-byte so the regression race reproduces
// fields, signals, and cost math. Generic fallbacks live in the flows.
// ---------------------------------------------------------------------------

const TICKET_PRIOR_UTILS: Clue[] = [
  { key: "outage_or_emergency", label: "live outage / security / financial emergency", question: "Is there a live outage, security exposure, legal, or financial emergency described in this ticket?" },
  { key: "blocked_from_work", label: "blocked from doing their work", question: "Does the customer describe being blocked from doing their work?" },
  { key: "strong_frustration", label: "strong frustration or anger, in their own words", question: "Does the customer express strong frustration or anger in their own words?" },
  { key: "minor_no_pressure", label: "minor inconvenience, no real time pressure", question: "Is this a minor inconvenience with no real time pressure — can the customer reasonably wait?" },
];

const TICKET_CROSS_CUTTING: Clue[] = [
  { key: "multiple_distinct_issues_present", label: "multiple distinct issues", question: "Does this ticket describe two or more distinct, separable issues?" },
  { key: "explicit_deadline_mentioned", label: "explicit deadline", question: "Does the customer state an explicit deadline, time limit, or specific date by which something must happen?" },
  { key: "threatens_to_cancel_or_leave", label: "threatens to leave", question: "Does the customer threaten — explicitly or implicitly — to cancel, downgrade, switch provider, or otherwise leave?" },
];

const SENTIMENT_SCALE = [
  "Very negative — furious, threatening, or deeply frustrated",
  "Negative — annoyed, disappointed, or dissatisfied",
  "Neutral — factual, calm, no strong emotion",
  "Positive — polite, satisfied, appreciative",
  "Very positive — delighted, enthusiastic, grateful",
];

const REPLY_FIELD: OutputField = {
  key: "reply",
  label: "Reply",
  type: "free_text",
  generatePrompt:
    "Acknowledge the issue, state what the responsible team will do, and give a realistic next step. " +
    "Output ONLY the customer-facing reply text as plain prose — never echo tool names, JSON blocks, or section headers. " +
    "No placeholder text, no sign-off name other than 'Support Team'.",
  constrainedPrompt:
    "Your ONLY job is to draft the reply (80-150 words). Do NOT re-derive the triage fields. " +
    "Acknowledge the issue, state what the responsible team will do, give a realistic next step. " +
    "Output ONLY the customer-facing reply text as plain prose — never echo tool names, JSON blocks, or section headers. " +
    "No placeholder text, sign off as 'Support Team'.",
};

function ticketOutputSchema(byType: (t: string) => OutputFieldOption[]): OutputSchema {
  return [
    {
      key: "category",
      label: "Category",
      type: "enum",
      options: byType("category"),
      prompt: "Classify the primary intent of this support ticket.",
      promptHint: "Primary category of the ticket",
    },
    {
      key: "priority",
      label: "Priority",
      type: "enum",
      options: byType("priority"),
      prompt: "Judge how urgently this support ticket must be handled.",
      promptHint: "How urgently the ticket needs handling",
      clues: TICKET_PRIOR_UTILS,
      supportClues: TICKET_PRIOR_UTILS.slice(0, 3).map((c) => c.key),
      opposeClues: ["minor_no_pressure"],
    },
    {
      key: "sentiment",
      label: "Sentiment",
      type: "float_range",
      range: { min: -1, max: 1 },
      scale: SENTIMENT_SCALE,
      prompt: "Rate the customer's emotional tone in this support ticket.",
      promptHint: "Customer sentiment from -1 (very negative) to 1 (very positive)",
      systemHint: ["very angry", "neutral", "delighted"] as [string, string, string],
    },
    {
      key: "route_to_team",
      label: "Route to team",
      type: "enum",
      options: byType("route_to_team"),
      prompt: "Decide which internal team should own this support ticket.",
      promptHint: "Team that should own this ticket",
    },
    REPLY_FIELD,
  ];
}

const TICKET_PROJECT_DEFAULTS = {
  id: "support-ticket-triage",
  name: "Support Ticket Triage",
  taskDescription: "Customer support ticket triage",
  inputLabel: "Support ticket",
  crossCuttingClues: TICKET_CROSS_CUTTING,
};

export function seedProjects(): void {
  const d = getDb();
  const persona = (
    d.prepare("SELECT value FROM settings WHERE key = 'business_context'").get() as
      | { value: string }
      | undefined
  )?.value ?? "";

  const existing = getProject(TICKET_PROJECT_DEFAULTS.id);
  if (existing) {
    // Backfill phase-2 enrichment on databases seeded before these columns
    // existed: task/input/cross-cutting + reply free_text + field prompts.
    const patch: Parameters<typeof updateProject>[1] = {};
    if (!existing.taskDescription) patch.taskDescription = TICKET_PROJECT_DEFAULTS.taskDescription;
    if (!existing.inputLabel) patch.inputLabel = TICKET_PROJECT_DEFAULTS.inputLabel;
    if (existing.crossCuttingClues.length === 0) patch.crossCuttingClues = TICKET_CROSS_CUTTING;
    if (!existing.outputSchema.some((f) => f.key === "reply")) {
      patch.outputSchema = [
        ...existing.outputSchema.map((f) =>
          f.key === "priority" && !f.clues
            ? {
                ...f,
                prompt: "Judge how urgently this support ticket must be handled.",
                promptHint: "How urgently the ticket needs handling",
                clues: TICKET_PRIOR_UTILS,
                supportClues: TICKET_PRIOR_UTILS.slice(0, 3).map((c) => c.key),
                opposeClues: ["minor_no_pressure"],
              }
            : f.key === "category"
              ? { ...f, prompt: "Classify the primary intent of this support ticket.", promptHint: "Primary category of the ticket" }
              : f.key === "route_to_team"
                ? { ...f, prompt: "Decide which internal team should own this support ticket.", promptHint: "Team that should own this ticket" }
                : f.key === "sentiment"
                  ? {
                      ...f,
                      prompt: "Rate the customer's emotional tone in this support ticket.",
                      promptHint: "Customer sentiment from -1 (very negative) to 1 (very positive)",
                      scale: SENTIMENT_SCALE,
                      systemHint: ["very angry", "neutral", "delighted"] as [string, string, string],
                    }
                  : f,
        ),
        REPLY_FIELD,
      ];
    }
    if (Object.keys(patch).length > 0) updateProject(existing.id, patch);
    return;
  }

  const rows = d
    .prepare(
      `SELECT taxonomy_type, key, label, description FROM taxonomy_options
       ORDER BY taxonomy_type, sort_order, id`,
    )
    .all() as { taxonomy_type: string; key: string; label: string; description: string }[];
  const byType = (t: string): OutputFieldOption[] =>
    rows.filter((r) => r.taxonomy_type === t).map((r) => ({ key: r.key, label: r.label, description: r.description }));

  createProject({
    ...TICKET_PROJECT_DEFAULTS,
    outputSchema: ticketOutputSchema(byType),
    personaContext: persona,
  });
}

export function seedPlatform(): void {
  seedModels();
  seedProjects();
}

// ---------------------------------------------------------------------------
// Taxonomy projection — presentation shape consumed by the settings UI and
// sessions taxonomy_snapshot. Options are addressed by `fieldKey:optionKey`.
// ---------------------------------------------------------------------------

export type TaxonomyFieldKey = "category" | "priority" | "route_to_team";

export interface TaxonomyOption {
  id: string;
  key: string;
  label: string;
  description: string;
  sortOrder: number;
}

export interface Taxonomy {
  category: TaxonomyOption[];
  priority: TaxonomyOption[];
  route_to_team: TaxonomyOption[];
}

export function taxonomyFromProject(project: Project): Taxonomy {
  const out: Taxonomy = { category: [], priority: [], route_to_team: [] };
  for (const field of project.outputSchema) {
    if (field.key === "category" || field.key === "priority" || field.key === "route_to_team") {
      out[field.key] = (field.options ?? []).map((o, i) => ({
        id: `${field.key}:${o.key}`,
        key: o.key,
        label: o.label,
        description: o.description,
        sortOrder: i,
      }));
    }
  }
  return out;
}

const KEY_RE = /^[a-z][a-z0-9_-]*$/;

export function addTaxonomyOption(
  projectId: string,
  field: TaxonomyFieldKey,
  input: { key: string; label: string; description?: string },
): { ok: true; option: TaxonomyOption } | { ok: false; error: string } {
  const project = getProject(projectId);
  if (!project) return { ok: false, error: "Project not found." };
  const key = input.key.trim();
  if (!KEY_RE.test(key)) {
    return { ok: false, error: "Key must be lowercase letters, digits, dashes, or underscores, starting with a letter." };
  }
  if (!input.label.trim()) return { ok: false, error: "Label is required." };
  const schema = project.outputSchema.map((f) => ({ ...f }));
  const target = schema.find((f) => f.key === field);
  if (!target || target.type !== "enum") return { ok: false, error: `Field "${field}" is not an enum.` };
  target.options = target.options ?? [];
  if (target.options.some((o) => o.key === key)) {
    return { ok: false, error: `Option "${key}" already exists.` };
  }
  target.options.push({ key, label: input.label.trim(), description: (input.description ?? "").trim() });
  updateProject(projectId, { outputSchema: schema });
  return {
    ok: true,
    option: {
      id: `${field}:${key}`,
      key,
      label: input.label.trim(),
      description: (input.description ?? "").trim(),
      sortOrder: target.options.length - 1,
    },
  };
}

export function updateTaxonomyOption(
  projectId: string,
  compositeId: string,
  patch: Partial<{ label: string; description: string; sortOrder: number }>,
): { ok: true } | { ok: false; error: string } {
  const project = getProject(projectId);
  if (!project) return { ok: false, error: "Project not found." };
  const [field, key] = compositeId.split(":");
  const targetIdx = project.outputSchema.findIndex((f) => f.key === field);
  if (targetIdx === -1) return { ok: false, error: "Option not found." };
  const schema = project.outputSchema.map((f) => ({ ...f, options: f.options?.map((o) => ({ ...o })) }));
  const opts = schema[targetIdx].options ?? [];
  const idx = opts.findIndex((o) => o.key === key);
  if (idx === -1) return { ok: false, error: "Option not found." };
  if (patch.label !== undefined) {
    if (!patch.label.trim()) return { ok: false, error: "Label cannot be empty." };
    opts[idx].label = patch.label.trim();
  }
  if (patch.description !== undefined) opts[idx].description = patch.description.trim();
  if (patch.sortOrder !== undefined && schema[targetIdx].options) {
    const [item] = opts.splice(idx, 1);
    opts.splice(Math.min(patch.sortOrder, opts.length), 0, item);
  }
  schema[targetIdx].options = opts;
  updateProject(projectId, { outputSchema: schema });
  return { ok: true };
}

export function deleteTaxonomyOption(
  projectId: string,
  compositeId: string,
): { ok: true } | { ok: false; error: string } {
  const project = getProject(projectId);
  if (!project) return { ok: false, error: "Project not found." };
  const [field, key] = compositeId.split(":");
  const schema = project.outputSchema.map((f) => ({
    ...f,
    options: f.options?.filter((o) => !(f.key === field && o.key === key)),
  }));
  const targetIdx = schema.findIndex((f) => f.key === field);
  if (targetIdx === -1) return { ok: false, error: "Option not found." };
  if (schema[targetIdx].options && schema[targetIdx].options.length === project.outputSchema[targetIdx].options?.length) {
    return { ok: false, error: "Option not found." };
  }
  updateProject(projectId, { outputSchema: schema });
  return { ok: true };
}

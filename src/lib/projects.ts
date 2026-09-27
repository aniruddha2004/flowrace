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

export interface OutputField {
  key: string;
  label: string;
  type: "enum" | "float_range" | "boolean" | "free_text";
  options?: OutputFieldOption[];
  range?: { min: number; max: number };
}

export type OutputSchema = OutputField[];

export interface Project {
  id: string;
  name: string;
  inputSchema: { kind: "text" };
  outputSchema: OutputSchema;
  personaContext: string;
  createdAt: string;
}

function toProject(r: {
  id: string;
  name: string;
  input_schema_json: string;
  output_schema_json: string;
  persona_context: string;
  created_at: string;
}): Project {
  return {
    id: r.id,
    name: r.name,
    inputSchema: JSON.parse(r.input_schema_json) as { kind: "text" },
    outputSchema: JSON.parse(r.output_schema_json) as OutputSchema,
    personaContext: r.persona_context,
    createdAt: r.created_at,
  };
}

function parseSchema(raw: string): OutputSchema {
  return JSON.parse(raw) as OutputSchema;
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
  patch: Partial<{ name: string; outputSchema: OutputSchema; personaContext: string }>,
): { ok: true } | { ok: false; error: string } {
  const existing = getProject(id);
  if (!existing) return { ok: false, error: "Project not found." };
  getDb()
    .prepare("UPDATE projects SET name = ?, output_schema_json = ?, persona_context = ? WHERE id = ?")
    .run(
      patch.name ?? existing.name,
      JSON.stringify(patch.outputSchema ?? existing.outputSchema),
      patch.personaContext ?? existing.personaContext,
      id,
    );
  return { ok: true };
}

export function deleteProject(id: string): { ok: true } | { ok: false; error: string } {
  if (!getProject(id)) return { ok: false, error: "Project not found." };
  // TODO(flow-builder phase): block deletion when any flow/race references
  // this project. Flows are still hardcoded ticket-triage for now.
  getDb().prepare("DELETE FROM projects WHERE id = ?").run(id);
  return { ok: true };
}

export function createProject(input: {
  id: string;
  name: string;
  outputSchema: OutputSchema;
  personaContext?: string;
}): { ok: true; project: Project } | { ok: false; error: string } {
  try {
    getDb()
      .prepare(
        `INSERT INTO projects (id, name, input_schema_json, output_schema_json, persona_context)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.name,
        JSON.stringify({ kind: "text" }),
        JSON.stringify(input.outputSchema),
        input.personaContext ?? "",
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

export function seedProjects(): void {
  const d = getDb();
  const count = (d.prepare("SELECT COUNT(*) AS n FROM projects").get() as { n: number }).n;
  if (count > 0) return;

  const rows = d
    .prepare(
      `SELECT taxonomy_type, key, label, description FROM taxonomy_options
       ORDER BY taxonomy_type, sort_order, id`,
    )
    .all() as { taxonomy_type: string; key: string; label: string; description: string }[];
  const byType = (t: string): OutputFieldOption[] =>
    rows.filter((r) => r.taxonomy_type === t).map((r) => ({ key: r.key, label: r.label, description: r.description }));

  const persona = (
    d.prepare("SELECT value FROM settings WHERE key = 'business_context'").get() as
      | { value: string }
      | undefined
  )?.value ?? "";
  createProject({
    id: "support-ticket-triage",
    name: "Support Ticket Triage",
    outputSchema: [
      { key: "category", label: "Category", type: "enum", options: byType("category") },
      { key: "priority", label: "Priority", type: "enum", options: byType("priority") },
      { key: "sentiment", label: "Sentiment", type: "float_range", range: { min: -1, max: 1 } },
      { key: "route_to_team", label: "Route to team", type: "enum", options: byType("route_to_team") },
    ],
    personaContext: persona,
  });
}

export function seedPlatform(): void {
  seedModels();
  seedProjects();
}

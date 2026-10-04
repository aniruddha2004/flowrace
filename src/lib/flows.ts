import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { getDb } from "./db";
import { getModel, type ModelRow } from "./models";
import { getProject, type OutputSchema } from "./projects";

export interface FlowStep {
  id: string;
  modelId: string;
  role: "decide" | "generate";
  ownsFields: string[];
  seesPriorStepOutput: boolean;
  promptOverride?: string;
}

export interface Flow {
  id: string;
  projectId: string;
  name: string;
  steps: FlowStep[];
  createdAt: string;
}

export const SEEDED_FLOW_IDS = ["llm-only", "jev-hybrid"] as const;

function toFlow(row: { id: string; project_id: string; name: string; steps_json: string; created_at: string }): Flow {
  return { id: row.id, projectId: row.project_id, name: row.name, steps: JSON.parse(row.steps_json) as FlowStep[], createdAt: row.created_at };
}

export function listFlows(projectId: string): Flow[] {
  return (getDb().prepare("SELECT * FROM flows WHERE project_id = ? ORDER BY created_at, rowid").all(projectId) as Parameters<typeof toFlow>[0][]).map(toFlow);
}

export function getFlow(id: string): Flow | null {
  const row = getDb().prepare("SELECT * FROM flows WHERE id = ?").get(id) as Parameters<typeof toFlow>[0] | undefined;
  return row ? toFlow(row) : null;
}

export function validateFlow(steps: unknown, schema: OutputSchema, models: ModelRow[]): string[] {
  if (!Array.isArray(steps) || steps.length === 0) return ["Add at least one step."];
  const errors: string[] = [];
  const owners = new Map<string, number>();
  const fields = new Map(schema.map((field) => [field.key, field]));
  const ids = new Set<string>();
  for (const [i, candidate] of steps.entries()) {
    if (!candidate || typeof candidate !== "object") { errors.push(`Step ${i + 1} is invalid.`); continue; }
    const step = candidate as Partial<FlowStep>;
    if (typeof step.id !== "string" || !step.id.trim() || ids.has(step.id)) errors.push(`Step ${i + 1} needs a unique id.`);
    else ids.add(step.id);
    const model = models.find((m) => m.id === step.modelId);
    if (!model) errors.push(`Step ${i + 1}: model "${String(step.modelId)}" is not registered.`);
    else if (model.adapterType === "custom_http") errors.push(`Step ${i + 1}: custom_http model "${model.name}" is not implemented yet.`);
    else if (model.adapterType === "system_one" && step.role === "generate") errors.push(`Step ${i + 1}: system_one model "${model.name}" cannot generate free text.`);
    if (step.role !== "decide" && step.role !== "generate") errors.push(`Step ${i + 1} needs a decide or generate role.`);
    if (typeof step.seesPriorStepOutput !== "boolean") errors.push(`Step ${i + 1}: seesPriorStepOutput must be a boolean.`);
    if (step.promptOverride !== undefined && typeof step.promptOverride !== "string") errors.push(`Step ${i + 1}: promptOverride must be text.`);
    if (!Array.isArray(step.ownsFields)) { errors.push(`Step ${i + 1}: ownsFields must be an array.`); continue; }
    for (const key of step.ownsFields) {
      const field = fields.get(key);
      if (!field) { errors.push(`Step ${i + 1}: unknown field "${key}".`); continue; }
      if ((field.type === "free_text") !== (step.role === "generate")) errors.push(`Step ${i + 1}: ${field.label} must be owned by a ${field.type === "free_text" ? "generate" : "decide"} step.`);
      owners.set(key, (owners.get(key) ?? 0) + 1);
    }
  }
  const unowned = schema.filter((f) => !owners.has(f.key)).map((f) => f.label);
  if (unowned.length) errors.push(`Unowned fields: ${unowned.join(", ")}.`);
  const duplicated = schema.filter((f) => (owners.get(f.key) ?? 0) > 1).map((f) => f.label);
  if (duplicated.length) errors.push(`Fields owned more than once: ${duplicated.join(", ")}.`);
  return errors;
}

export function createFlow(input: { projectId: string; name: string; steps: FlowStep[]; id?: string }): { ok: true; flow: Flow } | { ok: false; errors: string[] } {
  const project = getProject(input.projectId);
  if (!project) return { ok: false, errors: ["Project not found."] };
  const errors = [...validateFlow(input.steps, project.outputSchema, modelsForValidation())];
  if (typeof input.name !== "string" || !input.name.trim()) errors.unshift("Flow name is required.");
  if (errors.length) return { ok: false, errors };
  const id = input.id ?? randomUUID();
  try {
    getDb().prepare("INSERT INTO flows (id, project_id, name, steps_json) VALUES (?, ?, ?, ?)").run(id, input.projectId, input.name.trim(), JSON.stringify(input.steps));
  } catch (err) {
    if (err instanceof Error && err.message.includes("UNIQUE constraint")) return { ok: false, errors: [`Flow "${id}" already exists.`] };
    throw err;
  }
  return { ok: true, flow: getFlow(id)! };
}

function modelsForValidation(): ModelRow[] {
  return (getDb().prepare("SELECT id FROM models").all() as { id: string }[]).map(({ id }) => getModel(id)!);
}

export function updateFlow(id: string, patch: { name?: string; steps?: FlowStep[] }): { ok: true; flow: Flow } | { ok: false; errors: string[] } {
  const current = getFlow(id);
  if (!current) return { ok: false, errors: ["Flow not found."] };
  const project = getProject(current.projectId)!;
  const steps = patch.steps ?? current.steps;
  const errors = validateFlow(steps, project.outputSchema, modelsForValidation());
  if (typeof (patch.name ?? current.name) !== "string" || !(patch.name ?? current.name).trim()) errors.unshift("Flow name is required.");
  if (errors.length) return { ok: false, errors };
  getDb().prepare("UPDATE flows SET name = ?, steps_json = ? WHERE id = ?").run((patch.name ?? current.name).trim(), JSON.stringify(steps), id);
  return { ok: true, flow: getFlow(id)! };
}

export function deleteFlow(id: string): boolean {
  return getDb().prepare("DELETE FROM flows WHERE id = ?").run(id).changes > 0;
}

export function seedFlows(d: Database.Database): void {
  if (d.prepare("SELECT 1 FROM settings WHERE key = 'flows_seeded_v1'").get()) return;
  const project = d.prepare("SELECT output_schema_json FROM projects WHERE id = 'support-ticket-triage'").get() as { output_schema_json: string } | undefined;
  if (!project) return;
  const schema = JSON.parse(project.output_schema_json) as OutputSchema;
  const decide = schema.filter((field) => field.type !== "free_text").map((field) => field.key);
  const generate = schema.filter((field) => field.type === "free_text").map((field) => field.key);
  const insert = d.prepare("INSERT OR IGNORE INTO flows (id, project_id, name, steps_json) VALUES (?, ?, ?, ?)");
  for (const [id, name, modelId] of [["llm-only", "LLM only", "kimi-k3"], ["jev-hybrid", "Jev hybrid", "jev"]]) {
    insert.run(id, "support-ticket-triage", name, JSON.stringify([
      { id: "decide", modelId, role: "decide", ownsFields: decide, seesPriorStepOutput: false },
      { id: "generate", modelId: "kimi-k3", role: "generate", ownsFields: generate, seesPriorStepOutput: true },
    ]));
  }
  d.prepare("INSERT INTO settings (key, value) VALUES ('flows_seeded_v1', '1')").run();
}

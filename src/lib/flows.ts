import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { getDb } from "./db";
import { getModel, type ModelRow } from "./models";
import { getProject, type OutputSchema } from "./projects";
import { validateFlow } from "./flow-validation";
export { validateFlow } from "./flow-validation";

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

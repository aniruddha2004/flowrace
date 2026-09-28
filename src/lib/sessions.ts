import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import type { OutputSchema } from "./projects";
import { normalizeAnalysis, SCHEMA_VERSION } from "./schema";

// ---------------------------------------------------------------------------
// Session persistence. result JSON carries flows keyed A/B with FlowAnalysis
// payloads (schemaVersion-stamped). taxonomy_snapshot now stores the output
// schema in effect at run time so old sessions render after schema edits.
// ---------------------------------------------------------------------------

export type SessionType = "single" | "bulk";

export interface SessionSummary {
  id: string;
  type: SessionType;
  label: string;
  projectId: string | null;
  createdAt: string;
}

export interface SessionFull extends SessionSummary {
  input: unknown;
  result: unknown;
  schemaSnapshot: OutputSchema | null;
}

export function saveSession(input: {
  type: SessionType;
  label: string;
  projectId: string;
  input: unknown;
  result: unknown;
  schemaSnapshot?: OutputSchema | null;
}): SessionFull {
  const d = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  const result =
    typeof input.result === "object" && input.result !== null
      ? { ...(input.result as Record<string, unknown>), schemaVersion: SCHEMA_VERSION }
      : input.result;
  d.prepare(
    `INSERT INTO sessions (id, type, label, input, result, taxonomy_snapshot, project_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.type,
    input.label.slice(0, 50),
    JSON.stringify(input.input),
    JSON.stringify(result),
    input.schemaSnapshot ? JSON.stringify(input.schemaSnapshot) : null,
    input.projectId,
    now,
  );
  return {
    id,
    type: input.type,
    label: input.label.slice(0, 50),
    projectId: input.projectId,
    createdAt: now,
    input: input.input,
    result,
    schemaSnapshot: input.schemaSnapshot ?? null,
  };
}

export function listSessions(projectId?: string): SessionSummary[] {
  const d = getDb();
  const rows = (
    projectId
      ? d
          .prepare(
            `SELECT id, type, label, project_id, created_at
             FROM sessions WHERE project_id = ?
             ORDER BY created_at DESC LIMIT 100`,
          )
          .all(projectId)
      : d
          .prepare(
            `SELECT id, type, label, project_id, created_at
             FROM sessions ORDER BY created_at DESC LIMIT 100`,
          )
          .all()
  ) as {
    id: string;
    type: SessionType;
    label: string;
    project_id: string | null;
    created_at: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    label: r.label,
    projectId: r.project_id,
    createdAt: r.created_at,
  }));
}

interface StoredFlowShape {
  analysis?: unknown;
  freeText?: Record<string, string>;
  reply?: string;
  [k: string]: unknown;
}

/** Legacy sessions stored analysis as the ticket-hardcoded pre-v2 shape and
 * reply text as a top-level `reply` string; normalize both on the way out. */
function normalizeResult(result: unknown): unknown {
  if (typeof result !== "object" || result === null) return result;
  const r = result as { flows?: Partial<Record<"A" | "B", StoredFlowShape>> };
  if (!r.flows) return result;
  const out: Partial<Record<"A" | "B", StoredFlowShape>> = {};
  for (const flow of ["A", "B"] as const) {
    const f = r.flows[flow];
    if (!f) continue;
    out[flow] = {
      ...f,
      analysis: normalizeAnalysis(f.analysis),
      freeText:
        f.freeText ?? (typeof f.reply === "string" ? { reply: f.reply } : {}),
    };
  }
  return { ...r, flows: out };
}

export function getSessionById(id: string): SessionFull | null {
  const d = getDb();
  const row = d
    .prepare(
      `SELECT id, type, label, input, result, taxonomy_snapshot, project_id, created_at
       FROM sessions WHERE id = ?`,
    )
    .get(id) as
    | {
        id: string;
        type: SessionType;
        label: string;
        input: string;
        result: string;
        taxonomy_snapshot: string | null;
        project_id: string | null;
        created_at: string;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    label: row.label,
    projectId: row.project_id,
    createdAt: row.created_at,
    input: JSON.parse(row.input),
    result: normalizeResult(JSON.parse(row.result)),
    schemaSnapshot: row.taxonomy_snapshot
      ? (JSON.parse(row.taxonomy_snapshot) as OutputSchema)
      : null,
  };
}

export function deleteSessions(ids: string[]): number {
  if (ids.length === 0) return 0;
  const d = getDb();
  const placeholders = ids.map(() => "?").join(",");
  const info = d
    .prepare(`DELETE FROM sessions WHERE id IN (${placeholders})`)
    .run(...ids);
  return info.changes;
}

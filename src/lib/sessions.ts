import { randomUUID } from "node:crypto";
import { getDb, seed } from "./db";
import type { Taxonomy } from "./taxonomy";

// ---------------------------------------------------------------------------
// Session persistence. Input and result are stored as JSON strings; the
// taxonomy_snapshot captures what taxonomy was in effect at run time so that
// deleting an option later doesn't break historical lookups.
// ---------------------------------------------------------------------------

seed();

export type SessionType = "single" | "bulk";

export interface SessionSummary {
  id: string;
  type: SessionType;
  label: string;
  createdAt: string;
}

export interface SessionFull extends SessionSummary {
  input: unknown;
  result: unknown;
  taxonomySnapshot: Taxonomy | null;
}

export function saveSession(input: {
  type: SessionType;
  label: string;
  input: unknown;
  result: unknown;
  taxonomySnapshot?: Taxonomy | null;
}): SessionFull {
  const d = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  d.prepare(
    `INSERT INTO sessions (id, type, label, input, result, taxonomy_snapshot, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.type,
    input.label.slice(0, 50),
    JSON.stringify(input.input),
    JSON.stringify(input.result),
    input.taxonomySnapshot ? JSON.stringify(input.taxonomySnapshot) : null,
    now,
  );
  return {
    id,
    type: input.type,
    label: input.label.slice(0, 50),
    createdAt: now,
    input: input.input,
    result: input.result,
    taxonomySnapshot: input.taxonomySnapshot ?? null,
  };
}

export function listSessions(): SessionSummary[] {
  const d = getDb();
  const rows = d
    .prepare(
      `SELECT id, type, label, created_at
       FROM sessions
       ORDER BY created_at DESC
       LIMIT 100`,
    )
    .all() as {
    id: string;
    type: SessionType;
    label: string;
    created_at: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    label: r.label,
    createdAt: r.created_at,
  }));
}

export function getSessionById(id: string): SessionFull | null {
  const d = getDb();
  const row = d
    .prepare(
      `SELECT id, type, label, input, result, taxonomy_snapshot, created_at
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
        created_at: string;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    label: row.label,
    createdAt: row.created_at,
    input: JSON.parse(row.input),
    result: JSON.parse(row.result),
    taxonomySnapshot: row.taxonomy_snapshot
      ? (JSON.parse(row.taxonomy_snapshot) as Taxonomy)
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

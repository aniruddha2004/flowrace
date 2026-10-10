import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import type { DatasetItem } from "./dataset-format";

export interface Dataset {
  id: string;
  projectId: string;
  name: string;
  items: DatasetItem[];
  createdAt: string;
}

function toDataset(row: { id: string; project_id: string; name: string; items_json: string; created_at: string }): Dataset {
  return { id: row.id, projectId: row.project_id, name: row.name, items: JSON.parse(row.items_json) as DatasetItem[], createdAt: row.created_at };
}

export function listDatasets(projectId: string): Dataset[] {
  return (getDb().prepare("SELECT * FROM datasets WHERE project_id = ? ORDER BY created_at DESC, id DESC").all(projectId) as Parameters<typeof toDataset>[0][]).map(toDataset);
}
export function getDataset(id: string): Dataset | null {
  const row = getDb().prepare("SELECT * FROM datasets WHERE id = ?").get(id) as Parameters<typeof toDataset>[0] | undefined;
  return row ? toDataset(row) : null;
}
export function createDataset(projectId: string, name: string, items: DatasetItem[]): Dataset {
  const id = randomUUID();
  getDb().prepare("INSERT INTO datasets (id, project_id, name, items_json) VALUES (?, ?, ?, ?)").run(id, projectId, name.trim(), JSON.stringify(items));
  return getDataset(id)!;
}
export function updateDataset(id: string, name: string, items: DatasetItem[]): Dataset {
  getDb().prepare("UPDATE datasets SET name = ?, items_json = ? WHERE id = ?").run(name.trim(), JSON.stringify(items), id);
  return getDataset(id)!;
}
export function deleteDataset(id: string): void {
  getDb().prepare("DELETE FROM datasets WHERE id = ?").run(id);
}

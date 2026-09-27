import { getDb, seed } from "./db";

// ---------------------------------------------------------------------------
// Taxonomy — dynamic category/priority/route_to_team options loaded from SQLite.
// Always read fresh from the DB; never cache across requests.
// ---------------------------------------------------------------------------

export type TaxonomyType = "category" | "priority" | "route_to_team";
export const TAXONOMY_TYPES: TaxonomyType[] = [
  "category",
  "priority",
  "route_to_team",
];

export interface TaxonomyOption {
  id: number;
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

export interface Settings {
  businessContext: string;
  systemPrompt: string;
}

export interface AppConfig {
  settings: Settings;
  taxonomy: Taxonomy;
}

seed();

export function getTaxonomy(): Taxonomy {
  const d = getDb();
  const rows = d
    .prepare(
      `SELECT id, taxonomy_type, key, label, description, sort_order
       FROM taxonomy_options
       ORDER BY taxonomy_type, sort_order, id`,
    )
    .all() as {
    id: number;
    taxonomy_type: TaxonomyType;
    key: string;
    label: string;
    description: string;
    sort_order: number;
  }[];

  const taxonomy: Taxonomy = {
    category: [],
    priority: [],
    route_to_team: [],
  };
  for (const r of rows) {
    taxonomy[r.taxonomy_type].push({
      id: r.id,
      key: r.key,
      label: r.label,
      description: r.description,
      sortOrder: r.sort_order,
    });
  }
  return taxonomy;
}

export function getSettings(): Settings {
  const d = getDb();
  const rows = d.prepare(`SELECT key, value FROM settings`).all() as {
    key: string;
    value: string;
  }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    businessContext: map.get("business_context") ?? "",
    systemPrompt:
      map.get("system_prompt") ??
      "You are a senior support-ticket triage engine.\n" +
        "Analyze the customer's ticket and call the submit_ticket_analysis tool exactly once.\n" +
        "Rules:\n" +
        "- Provide an honest confidence (0..1) for each field independently.\n" +
        "- The exact allowed values for category/priority/route_to_team are enforced by the tool schema — use exactly one of the provided options.",
  };
}

export function getConfig(): AppConfig {
  return { settings: getSettings(), taxonomy: getTaxonomy() };
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const d = getDb();
  const upsert = d.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );
  if (patch.businessContext !== undefined) {
    upsert.run("business_context", patch.businessContext);
  }
  if (patch.systemPrompt !== undefined) {
    upsert.run("system_prompt", patch.systemPrompt);
  }
  return getSettings();
}

const KEY_RE = /^[a-z][a-z0-9_-]*$/;

export function addTaxonomyOption(
  type: TaxonomyType,
  input: { key: string; label: string; description?: string },
): { ok: true; option: TaxonomyOption } | { ok: false; error: string } {
  const d = getDb();
  const key = input.key.trim();
  const label = input.label.trim();
  const description = (input.description ?? "").trim();
  if (!KEY_RE.test(key)) {
    return {
      ok: false,
      error:
        "Key must be lowercase letters, digits, dashes, or underscores, starting with a letter.",
    };
  }
  if (!label) return { ok: false, error: "Label is required." };
  const maxOrder = d
    .prepare(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM taxonomy_options WHERE taxonomy_type = ?",
    )
    .get(type) as { next: number };
  try {
    const res = d
      .prepare(
        `INSERT INTO taxonomy_options (taxonomy_type, key, label, description, sort_order)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(type, key, label, description, maxOrder.next);
    return {
      ok: true,
      option: {
        id: Number(res.lastInsertRowid),
        key,
        label,
        description,
        sortOrder: maxOrder.next,
      },
    };
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.includes("UNIQUE constraint failed")
    ) {
      return { ok: false, error: `Option "${key}" already exists.` };
    }
    throw err;
  }
}

export function updateTaxonomyOption(
  id: number,
  patch: Partial<{ key: string; label: string; description: string; sortOrder: number }>,
): { ok: true } | { ok: false; error: string } {
  const d = getDb();
  const existing = d
    .prepare("SELECT id FROM taxonomy_options WHERE id = ?")
    .get(id) as { id: number } | undefined;
  if (!existing) return { ok: false, error: "Option not found." };
  if (patch.key !== undefined && !KEY_RE.test(patch.key)) {
    return { ok: false, error: "Invalid key format." };
  }
  if (patch.label !== undefined && !patch.label.trim()) {
    return { ok: false, error: "Label cannot be empty." };
  }
  const sets: string[] = [];
  const args: unknown[] = [];
  if (patch.key !== undefined) { sets.push("key = ?"); args.push(patch.key.trim()); }
  if (patch.label !== undefined) { sets.push("label = ?"); args.push(patch.label.trim()); }
  if (patch.description !== undefined) { sets.push("description = ?"); args.push(patch.description.trim()); }
  if (patch.sortOrder !== undefined) { sets.push("sort_order = ?"); args.push(patch.sortOrder); }
  if (sets.length === 0) return { ok: true };
  args.push(id);
  try {
    d.prepare(`UPDATE taxonomy_options SET ${sets.join(", ")} WHERE id = ?`).run(...args);
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.message.includes("UNIQUE constraint failed")) {
      return { ok: false, error: "An option with that key already exists in this taxonomy type." };
    }
    throw err;
  }
}

export function deleteTaxonomyOption(
  id: number,
): { ok: true } | { ok: false; error: string } {
  const d = getDb();
  const existing = d
    .prepare("SELECT id FROM taxonomy_options WHERE id = ?")
    .get(id) as { id: number } | undefined;
  if (!existing) return { ok: false, error: "Option not found." };
  d.prepare("DELETE FROM taxonomy_options WHERE id = ?").run(id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Structured shapes fed into LLM tool schema and Jev question criteria.
// ---------------------------------------------------------------------------

export interface LlmTaxonomyShape {
  categories: string[];
  priorities: string[];
  routes: string[];
  categoryHints: Record<string, string>;
  priorityHints: Record<string, string>;
  routeHints: Record<string, string>;
}

export function getTaxonomyForLLM(taxonomy?: Taxonomy): LlmTaxonomyShape {
  const t = taxonomy ?? getTaxonomy();
  const categories = t.category.map((o) => o.key);
  const priorities = t.priority.map((o) => o.key);
  const routes = t.route_to_team.map((o) => o.key);
  return {
    categories,
    priorities,
    routes,
    categoryHints: Object.fromEntries(t.category.map((o) => [o.key, o.description])),
    priorityHints: Object.fromEntries(t.priority.map((o) => [o.key, o.description])),
    routeHints: Object.fromEntries(t.route_to_team.map((o) => [o.key, o.description])),
  };
}

export interface JevTaxonomyShape {
  categoryCriteria: Record<string, string>;
  priorityCriteria: Record<string, string>;
  routeCriteria: Record<string, string>;
}

export function getTaxonomyForJev(taxonomy?: Taxonomy): JevTaxonomyShape {
  const t = taxonomy ?? getTaxonomy();
  return {
    categoryCriteria: Object.fromEntries(
      t.category.map((o) => [o.key, o.description] as const),
    ),
    priorityCriteria: Object.fromEntries(
      t.priority.map((o) => [o.key, o.description]),
    ),
    routeCriteria: Object.fromEntries(
      t.route_to_team.map((o) => [o.key, o.description]),
    ),
  };
}

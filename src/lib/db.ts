import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// SQLite via better-sqlite3. Singleton per process. The caller (API route)
// must be running in the Node.js runtime (`export const runtime = "nodejs"`),
// never edge.
// ---------------------------------------------------------------------------

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "flowrace.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    mkdirSync(DB_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    migrate(db);
  }
  return db;
}

function migrate(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS taxonomy_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      taxonomy_type TEXT NOT NULL CHECK(taxonomy_type IN ('category','priority','route_to_team')),
      key TEXT NOT NULL,
      label TEXT NOT NULL,
      description TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(taxonomy_type, key)
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('single','bulk')),
      label TEXT NOT NULL,
      input TEXT NOT NULL,
      result TEXT NOT NULL,
      taxonomy_snapshot TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_taxonomy_type ON taxonomy_options(taxonomy_type, sort_order);
  `);
}

/** True when the taxonomy table has never been seeded. */
export function isEmpty(): boolean {
  const d = getDb();
  const row = d
    .prepare("SELECT COUNT(*) AS n FROM taxonomy_options")
    .get() as { n: number };
  return row.n === 0;
}

/** Idempotent seed. Safe to call on every cold start. */
export function seed(): void {
  const d = getDb();
  if (!isEmpty()) return;

  const insertOption = d.prepare(`
    INSERT INTO taxonomy_options (taxonomy_type, key, label, description, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertSetting = d.prepare(`
    INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
  `);

  const tx = d.transaction(() => {
    const seeds: [string, string, string, string, number][] = [
      // category
      ["category", "billing", "Billing, payments, invoicing, refunds, charges", "Billing, payments, invoicing, refunds, charges", 0],
      ["category", "bug", "Something is broken, erroring, or behaving incorrectly", "Something is broken, erroring, or behaving incorrectly", 1],
      ["category", "feature_request", "Request for new functionality or improvement", "Request for new functionality or improvement", 2],
      ["category", "churn_risk", "Customer threatens to leave, cancel, or expresses deep dissatisfaction", "Customer threatens to leave, cancel, or expresses deep dissatisfaction", 3],
      ["category", "spam", "Unsolicited marketing, scam, or empty content", "Unsolicited marketing, scam, or empty content", 4],
      ["category", "other", "None of the above", "None of the above", 5],
      // priority
      ["priority", "low", "General question or nice-to-have; no time pressure", "General question or nice-to-have; no time pressure", 0],
      ["priority", "medium", "Standard issue; customer is inconvenienced but work continues", "Standard issue; customer is inconvenienced but work continues", 1],
      ["priority", "high", "Customer is blocked or very frustrated; needs prompt attention", "Customer is blocked or very frustrated; needs prompt attention", 2],
      ["priority", "urgent", "Outage, security, legal, or financial emergency; drop everything", "Outage, security, legal, or financial emergency; drop everything", 3],
      // route_to_team
      ["route_to_team", "billing", "Billing", "Payments, invoices, refunds, subscription charges", 0],
      ["route_to_team", "engineering", "Engineering", "Product defects, errors, outages, technical failures", 1],
      ["route_to_team", "sales", "Sales", "Pricing inquiries, upgrades, new purchases, expansions", 2],
      ["route_to_team", "support", "Support", "General help, how-to questions, account assistance", 3],
      ["route_to_team", "trust_and_safety", "Trust & Safety", "Abuse, spam, fraud, security, policy violations", 4],
    ];
    for (const [type, key, label, description, order] of seeds) {
      insertOption.run(type, key, label, description, order);
    }
    insertSetting.run("business_context", "");
    insertSetting.run(
      "system_prompt",
      "You are a senior support-ticket triage engine.\n" +
        "Analyze the customer's ticket and call the submit_ticket_analysis tool exactly once.\n" +
        "Rules:\n" +
        "- Provide an honest confidence (0..1) for each field independently.\n" +
        "- The exact allowed values for category/priority/route_to_team are enforced by the tool schema — use exactly one of the provided options.",
    );
  });
  tx();
}

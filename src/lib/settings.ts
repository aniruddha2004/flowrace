import { getDb } from "./db";

export interface Settings {
  businessContext: string;
  systemPrompt: string;
}

const DEFAULT_SYSTEM_PROMPT =
  "You are a senior support-ticket triage engine.\n" +
  "Analyze the customer's ticket and call the submit_ticket_analysis tool exactly once.\n" +
  "Rules:\n" +
  "- Provide an honest confidence (0..1) for each field independently.\n" +
  "- The exact allowed values for category/priority/route_to_team are enforced by the tool schema — use exactly one of the provided options.";

export function getSystemPrompt(): string {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = 'system_prompt'")
    .get() as { value: string } | undefined;
  return row?.value ?? DEFAULT_SYSTEM_PROMPT;
}

export function setSystemPrompt(value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES ('system_prompt', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(value);
}

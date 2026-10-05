import { readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDb } from "./db";
import type { ProviderProtocol } from "./provider-catalog";

export interface ProviderRow {
  id: string;
  name: string;
  protocol: ProviderProtocol;
  apiBase: string;
  apiKeyEnvVar: string;
  hasCredential: boolean;
  createdAt: string;
}

const KEY_FILE = path.join(process.cwd(), "data", "provider-credentials.json");
const ID_RE = /^[a-z][a-z0-9_-]*$/;
const ENV_RE = /^[A-Z_][A-Z0-9_]*$/;

function secrets(): Record<string, string> {
  try { return JSON.parse(readFileSync(KEY_FILE, "utf8")) as Record<string, string>; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}; throw error; }
}

function setSecret(id: string, key: string | null): void {
  const updated = secrets();
  if (key) updated[id] = key;
  else delete updated[id];
  const temporary = `${KEY_FILE}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(updated), { mode: 0o600 });
  renameSync(temporary, KEY_FILE);
}

export function providerKey(provider: Pick<ProviderRow, "id" | "apiKeyEnvVar">): string | undefined {
  return secrets()[provider.id] ?? (provider.apiKeyEnvVar ? process.env[provider.apiKeyEnvVar] : undefined);
}

type Stored = Omit<ProviderRow, "hasCredential">;
function row(raw: { id: string; name: string; protocol: ProviderProtocol; api_base: string; api_key_env_var: string; created_at: string }): ProviderRow {
  const result: Stored = { id: raw.id, name: raw.name, protocol: raw.protocol, apiBase: raw.api_base, apiKeyEnvVar: raw.api_key_env_var, createdAt: raw.created_at };
  return { ...result, hasCredential: Boolean(providerKey(result)) };
}

export function listProviders(): ProviderRow[] {
  return (getDb().prepare("SELECT * FROM providers ORDER BY created_at, id").all() as Parameters<typeof row>[0][]).map(row);
}

export function getProvider(id: string): ProviderRow | null {
  const found = getDb().prepare("SELECT * FROM providers WHERE id = ?").get(id) as Parameters<typeof row>[0] | undefined;
  return found ? row(found) : null;
}

export function validateProvider(input: { id?: unknown; name?: unknown; protocol?: unknown; apiBase?: unknown; apiKeyEnvVar?: unknown; apiKey?: unknown }): string | null {
  if (input.id !== undefined && (typeof input.id !== "string" || !ID_RE.test(input.id))) return "Provider ID must start with a lowercase letter and contain only letters, digits, - or _.";
  if (typeof input.name !== "string" || !input.name.trim()) return "Provider name is required.";
  if (!["openai_chat", "anthropic_messages", "gemini_generate", "custom_http"].includes(input.protocol as string)) return "Unsupported provider protocol.";
  if (typeof input.apiBase !== "string") return "API base URL is required.";
  try { const url = new URL(input.apiBase); if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return "Use an HTTP(S) base URL without credentials, query or fragment."; }
  catch { return "Enter a valid API base URL."; }
  if (typeof input.apiKeyEnvVar !== "string" || (input.apiKeyEnvVar && !ENV_RE.test(input.apiKeyEnvVar))) return "API key env var must be an uppercase environment variable name or blank.";
  if (input.apiKey !== undefined && (typeof input.apiKey !== "string" || /[\r\n]/.test(input.apiKey))) return "API key must be a single line of text.";
  return null;
}

export function createProvider(input: { id: string; name: string; protocol: ProviderProtocol; apiBase: string; apiKeyEnvVar: string; apiKey?: string }): ProviderRow {
  const d = getDb();
  d.prepare("INSERT INTO providers (id, name, protocol, api_base, api_key_env_var) VALUES (?, ?, ?, ?, ?)")
    .run(input.id, input.name, input.protocol, input.apiBase.replace(/\/$/, ""), input.apiKeyEnvVar);
  if (input.apiKey?.trim()) setSecret(input.id, input.apiKey.trim());
  return getProvider(input.id)!;
}

export function updateProvider(id: string, input: { name: string; protocol: ProviderProtocol; apiBase: string; apiKeyEnvVar: string; apiKey?: string; clearKey?: boolean }): ProviderRow | null {
  const previous = getProvider(id);
  if (!previous) return null;
  const count = (getDb().prepare("SELECT COUNT(*) AS n FROM models WHERE provider_id = ?").get(id) as { n: number }).n;
  if (count && previous.protocol !== input.protocol) throw new Error("Remove registered models before changing the provider protocol.");
  getDb().prepare("UPDATE providers SET name = ?, protocol = ?, api_base = ?, api_key_env_var = ? WHERE id = ?")
    .run(input.name, input.protocol, input.apiBase.replace(/\/$/, ""), input.apiKeyEnvVar, id);
  if (input.clearKey) setSecret(id, null);
  else if (input.apiKey?.trim()) setSecret(id, input.apiKey.trim());
  return getProvider(id)!;
}

export function deleteProvider(id: string): { ok: true } | { ok: false; error: string; status: number } {
  if (!getProvider(id)) return { ok: false, error: "Provider not found.", status: 404 };
  const count = (getDb().prepare("SELECT COUNT(*) AS n FROM models WHERE provider_id = ?").get(id) as { n: number }).n;
  if (count) return { ok: false, error: `Provider has ${count} registered model(s). Remove those models first.`, status: 409 };
  getDb().prepare("DELETE FROM providers WHERE id = ?").run(id);
  setSecret(id, null);
  return { ok: true };
}

export function seedProviders(): void {
  const d = getDb();
  const insert = d.prepare("INSERT OR IGNORE INTO providers (id, name, protocol, api_base, api_key_env_var) VALUES (?, ?, ?, ?, ?)");
  const legacy = [
    { id: "juspay", modelId: "kimi-k3", name: "Juspay AI Grid", protocol: "openai_chat" as const },
    { id: "typesafe", modelId: "jev", name: "TypeSafe", protocol: "custom_http" as const },
  ];
  for (const item of legacy) {
    const model = d.prepare("SELECT api_config_json FROM models WHERE id = ?").get(item.modelId) as { api_config_json: string } | undefined;
    if (!model) continue;
    const cfg = JSON.parse(model.api_config_json) as { apiBase: string; apiKeyEnvVar: string };
    insert.run(item.id, item.name, item.protocol, cfg.apiBase, cfg.apiKeyEnvVar);
    d.prepare("UPDATE models SET provider_id = ? WHERE id = ? AND provider_id IS NULL").run(item.id, item.modelId);
  }
  // Custom providers added through the UI are never overwritten by presets.
}

export async function discoverModels(provider: ProviderRow): Promise<{ id: string; name: string }[]> {
  const key = providerKey(provider);
  if (provider.apiKeyEnvVar && !key) throw new Error(`Connect ${provider.name} with an API key before fetching models.`);
  const base = provider.apiBase.replace(/\/$/, "");
  const url = provider.protocol === "gemini_generate" ? `${base}/models` : `${base}/models`;
  const headers: Record<string, string> = {};
  if (key) {
    if (provider.protocol === "anthropic_messages") { headers["x-api-key"] = key; headers["anthropic-version"] = "2023-06-01"; }
    else if (provider.protocol === "gemini_generate") headers["x-goog-api-key"] = key;
    else headers.Authorization = `Bearer ${key}`;
  }
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Model discovery failed: HTTP ${response.status}. You can still enter a model ID manually.`);
  const data = await response.json() as { data?: { id: string; name?: string; display_name?: string }[]; models?: { name: string; displayName?: string }[] };
  return (data.data ?? data.models ?? []).slice(0, 500).map((item) => {
    const id = "id" in item && typeof item.id === "string" ? item.id : item.name ?? "";
    const display = "displayName" in item && item.displayName ? item.displayName : "display_name" in item && item.display_name ? item.display_name : item.name ?? id;
    return { id: provider.protocol === "gemini_generate" ? id.replace(/^models\//, "") : id, name: display };
  }).filter((item) => item.id);
}

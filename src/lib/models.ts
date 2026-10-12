import { getDb } from "./db";
import { usd, type TokenRates } from "./pricing";
import { parseMapping } from "./http-mapping";
import { getProvider } from "./providers";
import { endpointError, seededLlmBaseUrl } from "./server-config";

// ---------------------------------------------------------------------------
// Model Registry — every LLM / System One endpoint the platform can call is a
// row here. Adapter code resolves API keys from apiKeyEnvVar at call time, so
// editing a model row takes effect on the next request without a restart.
// ---------------------------------------------------------------------------

export type AdapterType = "llm_chat" | "system_one" | "custom_http";
export const ADAPTER_TYPES: AdapterType[] = ["llm_chat", "system_one", "custom_http"];

export interface ModelApiConfig {
  apiBase: string;
  apiKeyEnvVar: string;
  modelId?: string;
  /** Declarative request and response mapping for custom_http. */
  requestTemplate?: string;
}

export interface ModelPricing {
  inputPerM: number;
  outputPerM: number;
  outputFree: boolean;
}

export interface ModelRow {
  id: string;
  name: string;
  adapterType: AdapterType;
  providerId?: string | null;
  apiConfig: ModelApiConfig;
  pricing: ModelPricing;
  createdAt: string;
}

export function modelRates(m: ModelRow): TokenRates {
  return { inputPerMTok: m.pricing.inputPerM, outputPerMTok: m.pricing.outputPerM };
}

export function modelCost(m: ModelRow, inputTokens: number, outputTokens: number): number {
  return usd(inputTokens, outputTokens, modelRates(m));
}

function toRow(r: {
  id: string;
  name: string;
  adapter_type: AdapterType;
  api_config_json: string;
  pricing_json: string;
  created_at: string;
  provider_id: string | null;
}): ModelRow {
  return {
    id: r.id,
    name: r.name,
    adapterType: r.adapter_type,
    providerId: r.provider_id,
    apiConfig: JSON.parse(r.api_config_json) as ModelApiConfig,
    pricing: JSON.parse(r.pricing_json) as ModelPricing,
    createdAt: r.created_at,
  };
}

export function listModels(): ModelRow[] {
  const d = getDb();
  const rows = d
    .prepare("SELECT * FROM models ORDER BY created_at ASC, id ASC")
    .all() as Parameters<typeof toRow>[0][];
  return rows.map(toRow);
}

export function getModel(id: string): ModelRow | null {
  const d = getDb();
  const row = d.prepare("SELECT * FROM models WHERE id = ?").get(id) as
    | Parameters<typeof toRow>[0]
    | undefined;
  return row ? toRow(row) : null;
}

const ID_RE = /^[a-z][a-z0-9_-]*$/;

export function validateModelInput(raw: {
  id?: unknown;
  name?: unknown;
  adapterType?: unknown;
  providerId?: unknown;
  apiConfig?: unknown;
  pricing?: unknown;
}): { ok: true } | { ok: false; error: string } {
  if (raw.id !== undefined && (typeof raw.id !== "string" || !ID_RE.test(raw.id) || raw.id.length > 100)) {
    return { ok: false, error: "id must be 1–100 lowercase letters/digits/dash/underscore starting with a letter." };
  }
  if (typeof raw.name !== "string" || !raw.name.trim() || raw.name.length > 120) {
    return { ok: false, error: "name must be 1–120 characters." };
  }
  if (!ADAPTER_TYPES.includes(raw.adapterType as AdapterType)) {
    return { ok: false, error: `adapterType must be one of ${ADAPTER_TYPES.join(", ")}.` };
  }
  if (raw.providerId !== undefined && raw.providerId !== null && (typeof raw.providerId !== "string" || !getProvider(raw.providerId))) return { ok: false, error: "Select a registered provider." };
  const provider = typeof raw.providerId === "string" ? getProvider(raw.providerId) : null;
  if (provider && raw.adapterType === "llm_chat" && provider.protocol !== "openai_chat") return { ok: false, error: "Non-OpenAI providers need a custom HTTP mapping." };
  const cfg = (raw.apiConfig ?? {}) as Partial<ModelApiConfig>;
  if (!provider && (typeof cfg.apiBase !== "string" || !cfg.apiBase.trim())) {
    return { ok: false, error: "apiConfig.apiBase is required." };
  }
  if (cfg.apiBase !== undefined) {
    if (typeof cfg.apiBase !== "string" || cfg.apiBase.length > 2048) return { ok: false, error: "apiConfig.apiBase must be at most 2,048 characters." };
    const error = endpointError(cfg.apiBase, Boolean(cfg.apiKeyEnvVar));
    if (error) return { ok: false, error: `apiConfig.apiBase: ${error}` };
  }
  if (!provider && (typeof cfg.apiKeyEnvVar !== "string" || !cfg.apiKeyEnvVar.trim())) {
    return { ok: false, error: "apiConfig.apiKeyEnvVar is required." };
  }
  if (cfg.apiKeyEnvVar !== undefined && (typeof cfg.apiKeyEnvVar !== "string" || cfg.apiKeyEnvVar.length > 128 || (cfg.apiKeyEnvVar && !/^[A-Z_][A-Z0-9_]*$/.test(cfg.apiKeyEnvVar)))) return { ok: false, error: "apiConfig.apiKeyEnvVar must be a short uppercase environment variable name." };
  if (cfg.modelId !== undefined && (typeof cfg.modelId !== "string" || cfg.modelId.length > 200)) return { ok: false, error: "apiConfig.modelId must be at most 200 characters." };
  if (raw.adapterType !== "custom_http" && (typeof cfg.modelId !== "string" || !cfg.modelId.trim())) {
    return { ok: false, error: "apiConfig.modelId is required for llm_chat and system_one." };
  }
  if (raw.adapterType === "custom_http") {
    if (!provider) return { ok: false, error: "custom_http requires a registered provider." };
    if (typeof cfg.requestTemplate !== "string") return { ok: false, error: "custom_http requires a JSON mapping." };
    try { parseMapping(cfg.requestTemplate); } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Invalid JSON mapping." }; }
  }
  const p = raw.pricing as Partial<ModelPricing> | undefined;
  if (typeof p?.inputPerM !== "number" || typeof p?.outputPerM !== "number" || !Number.isFinite(p.inputPerM) || !Number.isFinite(p.outputPerM) || p.inputPerM < 0 || p.outputPerM < 0 || p.inputPerM > 100_000 || p.outputPerM > 100_000) {
    return { ok: false, error: "pricing rates must be finite values between 0 and 100,000 USD per million tokens." };
  }
  if (typeof p.outputFree !== "boolean") return { ok: false, error: "pricing.outputFree must be true or false." };
  return { ok: true };
}

export function createModel(input: {
  id: string;
  name: string;
  adapterType: AdapterType;
  providerId?: string | null;
  apiConfig: ModelApiConfig;
  pricing: ModelPricing;
}): { ok: true; model: ModelRow } | { ok: false; error: string } {
  const d = getDb();
  try {
    d.prepare(
      `INSERT INTO models (id, name, adapter_type, api_config_json, pricing_json)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      input.id,
      input.name,
      input.adapterType,
      JSON.stringify(input.apiConfig),
      JSON.stringify(input.pricing),
    );
    if (input.providerId) d.prepare("UPDATE models SET provider_id = ? WHERE id = ?").run(input.providerId, input.id);
    return { ok: true, model: getModel(input.id)! };
  } catch (err) {
    if (err instanceof Error && err.message.includes("UNIQUE constraint failed")) {
      return { ok: false, error: `Model "${input.id}" already exists.` };
    }
    throw err;
  }
}

export function updateModel(
  id: string,
  patch: Partial<{ name: string; adapterType: AdapterType; providerId: string | null; apiConfig: ModelApiConfig; pricing: ModelPricing }>,
): { ok: true } | { ok: false; error: string } {
  const existing = getModel(id);
  if (!existing) return { ok: false, error: "Model not found." };
  const d = getDb();
  d.prepare(
    `UPDATE models SET name = ?, adapter_type = ?, api_config_json = ?, pricing_json = ?, provider_id = ? WHERE id = ?`,
  ).run(
    patch.name ?? existing.name,
    patch.adapterType ?? existing.adapterType,
    JSON.stringify(patch.apiConfig ?? existing.apiConfig),
    JSON.stringify(patch.pricing ?? existing.pricing),
    patch.providerId === undefined ? existing.providerId ?? null : patch.providerId,
    id,
  );
  return { ok: true };
}

export function deleteModel(id: string): { ok: true } | { ok: false; error: string; references?: { id: string; name: string }[] } {
  if (!getModel(id)) return { ok: false, error: "Model not found." };
  const references = getDb().prepare(`SELECT id, name FROM flows
    WHERE EXISTS (SELECT 1 FROM json_each(flows.steps_json)
      WHERE json_extract(json_each.value, '$.modelId') = ?)`)
    .all(id) as { id: string; name: string }[];
  if (references.length) return { ok: false, error: `Model is used by flows: ${references.map((flow) => flow.name).join(", ")}.`, references };
  getDb().prepare("DELETE FROM models WHERE id = ?").run(id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Seed — persists the two models the app has always used, sourced from the
// env/config they were previously hardcoded to.
// ---------------------------------------------------------------------------

export function seedModels(): void {
  const d = getDb();
  const count = (d.prepare("SELECT COUNT(*) AS n FROM models").get() as { n: number }).n;
  if (count > 0) return;
  const insert = d.prepare(
    `INSERT INTO models (id, name, adapter_type, api_config_json, pricing_json) VALUES (?, ?, ?, ?, ?)`,
  );
  insert.run(
    "kimi-k3",
    "kimi-k3 (chat + tools)",
    "llm_chat",
    JSON.stringify({
       apiBase: seededLlmBaseUrl(),
      apiKeyEnvVar: "LLM_API_KEY",
      modelId: process.env.LLM_MODEL ?? "kimi-k3",
    }),
    JSON.stringify({ inputPerM: 3.0, outputPerM: 15.0, outputFree: false }),
  );
  insert.run(
    "jev",
    "Jev (TypeSafe System One)",
    "system_one",
    JSON.stringify({
      apiBase: "https://api.typesafe.ai/v1/systemone",
      apiKeyEnvVar: "TYPESAFE_API_KEY",
      modelId: "jev-latest",
    }),
    JSON.stringify({ inputPerM: 0.042, outputPerM: 0, outputFree: true }),
  );
}

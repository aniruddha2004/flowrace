import { LlmChatAdapter } from "./adapters/llm-chat";
import { SystemOneAdapter } from "./adapters/system-one";
import type { ModelAdapter } from "./adapters/types";
import { getModel } from "./models";

// ---------------------------------------------------------------------------
// Registry — resolves a models-table row + its API key into a live adapter.
// ---------------------------------------------------------------------------

function resolveApiKey(envVar: string): string | undefined {
  return (
    process.env[envVar] ??
    // Historical fallbacks from the pre-registry config — keep resolving so
    // existing .env setups keep working without a rename.
    process.env.JUSPAY_API_KEY ??
    process.env.ANTHROPIC_API_KEY
  );
}

export function getAdapter(modelId: string): ModelAdapter {
  const model = getModel(modelId);
  if (!model) throw new Error(`Model "${modelId}" is not in the registry.`);
  if (model.adapterType === "custom_http") {
    throw new Error("custom_http adapters are reserved but not implemented yet.");
  }
  const key = resolveApiKey(model.apiConfig.apiKeyEnvVar);
  if (!key) {
    throw new Error(
      `No API key configured for model "${modelId}" — add ${model.apiConfig.apiKeyEnvVar} to .env.local.`,
    );
  }
  if (model.adapterType === "llm_chat") return new LlmChatAdapter(model, key);
  return new SystemOneAdapter(model, key);
}

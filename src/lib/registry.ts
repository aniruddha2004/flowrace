import { LlmChatAdapter } from "./adapters/llm-chat";
import { SystemOneAdapter } from "./adapters/system-one";
import { CustomHttpAdapter } from "./adapters/custom-http";
import type { ModelAdapter } from "./adapters/types";
import { getModel } from "./models";
import { getProvider, providerKey } from "./providers";

// ---------------------------------------------------------------------------
// Registry — resolves a models-table row + its API key into a live adapter.
// ---------------------------------------------------------------------------

function resolveApiKey(envVar: string, modelId: string): string | undefined {
  return process.env[envVar] ?? (modelId === "kimi-k3" || modelId === "jev" ? process.env.JUSPAY_API_KEY ?? process.env.ANTHROPIC_API_KEY : undefined);
}

export function getAdapter(modelId: string): ModelAdapter {
  const model = getModel(modelId);
  if (!model) throw new Error(`Model "${modelId}" is not in the registry.`);
  const provider = model.providerId ? getProvider(model.providerId) : null;
  if (model.providerId && !provider) throw new Error(`Provider "${model.providerId}" no longer exists.`);
  const key = provider ? providerKey(provider) ?? resolveApiKey(provider.apiKeyEnvVar, model.id) : resolveApiKey(model.apiConfig.apiKeyEnvVar, model.id);
  if (!key && (provider?.apiKeyEnvVar || !provider)) {
    throw new Error(
      `No API key configured for model "${modelId}" — connect provider or set ${provider?.apiKeyEnvVar ?? model.apiConfig.apiKeyEnvVar} in .env.local.`,
    );
  }
  const effective = provider ? { ...model, apiConfig: { ...model.apiConfig, apiBase: provider.apiBase, apiKeyEnvVar: provider.apiKeyEnvVar } } : model;
  if (model.adapterType === "custom_http") {
    if (!provider) throw new Error("Custom HTTP models require a connected provider.");
    return new CustomHttpAdapter(effective, provider, key);
  }
  if (model.adapterType === "llm_chat") return new LlmChatAdapter(effective, key ?? "");
  return new SystemOneAdapter(effective, key ?? "");
}

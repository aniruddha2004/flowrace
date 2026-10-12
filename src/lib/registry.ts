import { LlmChatAdapter } from "./adapters/llm-chat";
import { SystemOneAdapter } from "./adapters/system-one";
import { CustomHttpAdapter } from "./adapters/custom-http";
import type { ModelAdapter } from "./adapters/types";
import { getModel } from "./models";
import { getProvider, providerKey } from "./providers";
import { modelEnvKey } from "./server-config";

// ---------------------------------------------------------------------------
// Registry — resolves a models-table row + its API key into a live adapter.
// ---------------------------------------------------------------------------

export function getAdapter(modelId: string): ModelAdapter {
  const model = getModel(modelId);
  if (!model) throw new Error(`Model "${modelId}" is not in the registry.`);
  const provider = model.providerId ? getProvider(model.providerId) : null;
  if (model.providerId && !provider) throw new Error(`Provider "${model.providerId}" no longer exists.`);
  const key = provider ? providerKey(provider) ?? modelEnvKey(provider.apiKeyEnvVar, model.id) : modelEnvKey(model.apiConfig.apiKeyEnvVar, model.id);
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

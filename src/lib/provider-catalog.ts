export type ProviderProtocol = "openai_chat" | "anthropic_messages" | "gemini_generate" | "custom_http";

export interface ProviderPreset {
  id: string;
  name: string;
  protocol: ProviderProtocol;
  apiBase: string;
  apiKeyEnvVar: string;
}

// A starting point, not a fixed list of models. Model IDs come from the
// provider's /models endpoint or can be entered manually.
export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: "openai", name: "OpenAI", protocol: "openai_chat", apiBase: "https://api.openai.com/v1", apiKeyEnvVar: "OPENAI_API_KEY" },
  { id: "anthropic", name: "Anthropic", protocol: "anthropic_messages", apiBase: "https://api.anthropic.com/v1", apiKeyEnvVar: "ANTHROPIC_API_KEY" },
  { id: "google", name: "Google Gemini", protocol: "gemini_generate", apiBase: "https://generativelanguage.googleapis.com/v1beta", apiKeyEnvVar: "GEMINI_API_KEY" },
  { id: "openrouter", name: "OpenRouter", protocol: "openai_chat", apiBase: "https://openrouter.ai/api/v1", apiKeyEnvVar: "OPENROUTER_API_KEY" },
  { id: "groq", name: "Groq", protocol: "openai_chat", apiBase: "https://api.groq.com/openai/v1", apiKeyEnvVar: "GROQ_API_KEY" },
  { id: "together", name: "Together AI", protocol: "openai_chat", apiBase: "https://api.together.xyz/v1", apiKeyEnvVar: "TOGETHER_API_KEY" },
  { id: "fireworks", name: "Fireworks", protocol: "openai_chat", apiBase: "https://api.fireworks.ai/inference/v1", apiKeyEnvVar: "FIREWORKS_API_KEY" },
  { id: "mistral", name: "Mistral", protocol: "openai_chat", apiBase: "https://api.mistral.ai/v1", apiKeyEnvVar: "MISTRAL_API_KEY" },
  { id: "xai", name: "xAI", protocol: "openai_chat", apiBase: "https://api.x.ai/v1", apiKeyEnvVar: "XAI_API_KEY" },
  { id: "deepseek", name: "DeepSeek", protocol: "openai_chat", apiBase: "https://api.deepseek.com/v1", apiKeyEnvVar: "DEEPSEEK_API_KEY" },
  { id: "cerebras", name: "Cerebras", protocol: "openai_chat", apiBase: "https://api.cerebras.ai/v1", apiKeyEnvVar: "CEREBRAS_API_KEY" },
  { id: "ollama", name: "Ollama / local", protocol: "openai_chat", apiBase: "http://127.0.0.1:11434/v1", apiKeyEnvVar: "" },
];

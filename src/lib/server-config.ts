/** Server-side configuration that fails clearly instead of silently using an
 * unexpected default when an environment variable is malformed. */
export function nonnegativeEnvNumber(name: string, fallback: number, maximum: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > maximum) {
    throw new Error(`${name} must be a finite number between 0 and ${maximum}.`);
  }
  return parsed;
}

function isLoopback(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

export function endpointError(value: unknown, hasKey: boolean): string | null {
  if (typeof value !== "string" || !value.trim()) return "API base URL is required.";
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      return "Use an HTTP(S) base URL without credentials, query or fragment.";
    }
    if (hasKey && url.protocol === "http:" && !isLoopback(url.hostname)) {
      return "Providers with API keys must use HTTPS (except loopback development endpoints).";
    }
    return null;
  } catch { return "Enter a valid API base URL."; }
}

export function seededLlmBaseUrl(): string {
  const value = process.env.LLM_BASE_URL ?? "https://grid.ai.juspay.net";
  const error = endpointError(value, true);
  if (error) throw new Error(`LLM_BASE_URL: ${error}`);
  return value.replace(/\/$/, "");
}

/** Historical key name for the seeded Juspay model. Credentials from a
 * different provider must never be silently forwarded to Jev or the grid. */
export function modelEnvKey(envVar: string, modelId: string): string | undefined {
  return (envVar ? process.env[envVar] : undefined) ??
    (modelId === "kimi-k3" && envVar === "LLM_API_KEY" ? process.env.JUSPAY_API_KEY : undefined);
}

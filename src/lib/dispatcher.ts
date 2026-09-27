import https from "node:https";

// Shared HTTP transport for all server-side API calls. We deliberately avoid
// global fetch: its default undici connect timeout (10s) is fatal against
// gateways with slow TLS admission (observed ~15s on the LLM gateway), and
// npm-undici dispatchers don't interoperate with the Node-bundled fetch.
// postJson gives us one explicit overall timeout covering connect + transfer.

export interface JsonHttpResponse {
  status: number;
  body: string;
}

// The LLM gateway occasionally resets sockets mid-transfer (observed
// ECONNRESET). Retry transient network faults; HTTP error statuses are still
// surfaced to callers unchanged.
const TRANSIENT_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "EAI_AGAIN",
]);

export async function postJsonWithRetry(
  url: string,
  headers: Record<string, string>,
  payload: unknown,
  timeoutMs = 300_000,
  attempts = 3,
): Promise<JsonHttpResponse> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await postJson(url, headers, payload, timeoutMs);
    } catch (err) {
      lastErr = err;
      const code = (err as NodeJS.ErrnoException | null | undefined)?.code;
      const transient =
        (code !== undefined && TRANSIENT_CODES.has(code)) ||
        (err instanceof Error && err.message.includes("timed out"));
      if (!transient || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr;
}

export function postJson(
  url: string,
  headers: Record<string, string>,
  payload: unknown,
  timeoutMs = 300_000,
): Promise<JsonHttpResponse> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const target = new URL(url);
    const req = https.request(
      {
        hostname: target.hostname,
        port: target.port || 443,
        path: target.pathname + target.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          clearTimeout(timer);
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    const timer = setTimeout(() => {
      req.destroy(new Error(`HTTP request to ${target.hostname} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    req.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    req.write(data);
    req.end();
  });
}

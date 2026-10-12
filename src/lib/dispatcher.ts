import https from "node:https";
import http from "node:http";
import { MAX_PROVIDER_RESPONSE_BYTES } from "./http-limits";

// Shared HTTP transport for all server-side API calls. We deliberately avoid
// global fetch: its default undici connect timeout (10s) is fatal against
// gateways with slow TLS admission (observed ~15s on the LLM gateway), and
// npm-undici dispatchers don't interoperate with the Node-bundled fetch.
// postJson gives us one explicit overall timeout covering connect + transfer.

export interface JsonHttpResponse {
  status: number;
  body: string;
  retryAfterMs?: number;
}

// The LLM gateway occasionally resets sockets mid-transfer (observed
// ECONNRESET). Retry transient network faults and bounded 429 backoffs;
// adapters still receive the final HTTP status unchanged.
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
      const response = await postJson(url, headers, payload, timeoutMs);
      if (response.status === 429 && i < attempts - 1) {
        await new Promise((r) => setTimeout(r, response.retryAfterMs ?? Math.min(3000 * 2 ** i, 10_000)));
        continue;
      }
      return response;
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
    if (target.protocol !== "https:" && target.protocol !== "http:") throw new Error("Only HTTP(S) endpoints are supported.");
    if (Object.keys(headers).some((name) => ["host", "content-length", "content-type", "transfer-encoding", "connection"].includes(name.toLowerCase()))) {
      throw new Error("Provider headers cannot override the JSON transport headers.");
    }
    const transport = target.protocol === "http:" ? http : https;
    const req = transport.request(
      {
        hostname: target.hostname,
        port: target.port || (target.protocol === "http:" ? 80 : 443),
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
        let size = 0;
        res.on("error", (error) => { clearTimeout(timer); reject(error); });
        const tooLarge = () => {
          clearTimeout(timer);
          res.destroy();
          reject(new Error("Provider response exceeds the allowed size."));
        };
        const length = Number(res.headers["content-length"]);
        if (Number.isFinite(length) && length > MAX_PROVIDER_RESPONSE_BYTES) { tooLarge(); return; }
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_PROVIDER_RESPONSE_BYTES) { tooLarge(); return; }
          chunks.push(chunk);
        });
        res.on("end", () => {
          clearTimeout(timer);
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            retryAfterMs: retryAfterMs(res.headers["retry-after"]),
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

function retryAfterMs(value: string | string[] | undefined): number | undefined {
  if (!value || Array.isArray(value)) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30_000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.min(Math.max(0, date - Date.now()), 30_000) : undefined;
}

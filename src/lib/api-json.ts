/** Bounded JSON parsing for Node.js route handlers. A Content-Length check
 * alone is insufficient for chunked requests, so the stream is capped too. */
export const JSON_LIMITS = {
  settings: 32_768,
  provider: 65_536,
  model: 65_536,
  project: 262_144,
  dataset: 12_000_000,
  race: 65_536,
  evaluation: 8_192,
  sessionDelete: 32_768,
} as const;

export type JsonBodyResult = { ok: true; value: Record<string, unknown> } | { ok: false; error: string; status: number };

export async function readJsonObject(request: Request, maxBytes: number): Promise<JsonBodyResult> {
  const mediaType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (mediaType && mediaType !== "application/json") return { ok: false, error: "Content-Type must be application/json.", status: 415 };
  const declared = request.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) return { ok: false, error: `JSON body exceeds ${maxBytes} bytes.`, status: 413 };
  if (!request.body) return { ok: false, error: "Request body must be JSON.", status: 400 };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, error: `JSON body exceeds ${maxBytes} bytes.`, status: 413 };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, error: "Could not read request body.", status: 400 };
  } finally { reader.releaseLock(); }

  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, error: "JSON body must be an object.", status: 400 };
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch { return { ok: false, error: "Request body must be valid JSON.", status: 400 }; }
}

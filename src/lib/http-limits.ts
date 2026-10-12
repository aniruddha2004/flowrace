export const MAX_PROVIDER_RESPONSE_BYTES = 8 * 1024 * 1024;
export const MAX_MODEL_CATALOG_BYTES = 4 * 1024 * 1024;

/** Limit discovery responses even when the server streams without a length. */
export async function readResponseText(response: Response, maxBytes: number): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    await response.body?.cancel();
    throw new Error("Provider response exceeds the allowed size.");
  }
  if (!response.body) throw new Error("Provider returned an empty response.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel(); throw new Error("Provider response exceeds the allowed size."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

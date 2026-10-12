import { randomUUID } from "node:crypto";
import { chmodSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const KEY_FILE = path.join(process.cwd(), "data", "provider-credentials.json");

function credentials(): Record<string, string> {
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(KEY_FILE, "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}; throw error; }
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.values(raw).some((value) => typeof value !== "string")) {
    throw new Error("Provider credential store has an invalid format.");
  }
  return raw as Record<string, string>;
}

export function savedProviderKey(id: string): string | undefined {
  const saved = credentials();
  return Object.hasOwn(saved, id) ? saved[id] : undefined;
}

export function setProviderKey(id: string, key: string | null): void {
  const updated = credentials();
  if (key) updated[id] = key;
  else delete updated[id];
  const temporary = `${KEY_FILE}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(updated), { mode: 0o600, flag: "wx" });
  try {
    renameSync(temporary, KEY_FILE);
    chmodSync(KEY_FILE, 0o600);
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* Rename may have already succeeded. */ }
    throw error;
  }
}

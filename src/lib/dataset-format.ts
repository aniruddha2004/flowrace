import type { OutputSchema } from "./projects";

export interface DatasetItem {
  id: string;
  input: string;
  expected?: Record<string, string | number | boolean>;
}

export interface DatasetIssue { item: number; id: string; message: string }

export function validateDatasetItems(raw: unknown, schema: OutputSchema): DatasetIssue[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > 500) return [{ item: 0, id: "", message: "Provide 1–500 dataset items." }];
  const issues: DatasetIssue[] = [];
  const seen = new Set<string>();
  const fields = new Map(schema.map((field) => [field.key, field]));
  raw.forEach((item: unknown, index) => {
    const row = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {};
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const problem = (message: string) => issues.push({ item: index + 1, id, message });
    if (!id || id.length > 80) problem("id must be a non-empty string of at most 80 characters.");
    else if (seen.has(id)) problem(`Duplicate item id "${id}".`);
    else seen.add(id);
    if (typeof row.input !== "string" || !row.input.trim() || row.input.length > 20_000) problem("input must be 1–20,000 characters of text.");
    if (row.expected === undefined) return;
    if (!row.expected || typeof row.expected !== "object" || Array.isArray(row.expected)) { problem("expected must be an object keyed by output field."); return; }
    for (const [key, value] of Object.entries(row.expected)) {
      const field = fields.get(key);
      if (!field || field.type === "free_text") { problem(`"${key}" is not a scorable output field.`); continue; }
      if (field.type === "enum" && (typeof value !== "string" || !field.options?.some((option) => option.key === value))) problem(`${field.label}: unknown enum option "${String(value)}".`);
      if (field.type === "boolean" && typeof value !== "boolean") problem(`${field.label}: expected true or false.`);
      if (field.type === "float_range" && (typeof value !== "number" || !Number.isFinite(value) || value < (field.range?.min ?? 0) || value > (field.range?.max ?? 1))) problem(`${field.label}: expected a number from ${field.range?.min ?? 0} to ${field.range?.max ?? 1}.`);
    }
  });
  return issues;
}

export function parseDatasetJson(source: string): DatasetItem[] {
  const data: unknown = JSON.parse(source);
  const items = Array.isArray(data) ? data : data && typeof data === "object" && "items" in data ? (data as { items: unknown }).items : null;
  if (!Array.isArray(items)) throw new Error("JSON must be an array of items or an object with an items array.");
  return items as DatasetItem[];
}

export function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function csvRows(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], value = "", quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { value += '"'; i++; }
      else if (quoted || !value) quoted = !quoted;
      else throw new Error(`Unexpected quote in CSV row ${rows.length + 1}.`);
    } else if (char === "," && !quoted) { row.push(value); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(value); if (row.some((cell) => cell.trim())) rows.push(row);
      row = []; value = "";
    } else value += char;
  }
  if (quoted) throw new Error("Unclosed quoted CSV field.");
  row.push(value); if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

export function parseDatasetCsv(source: string, schema: OutputSchema): DatasetItem[] {
  const rows = csvRows(source.replace(/^\uFEFF/, ""));
  const header = rows.shift()?.map((cell) => cell.trim()) ?? [];
  if (!header.includes("id") || !header.includes("input") || new Set(header).size !== header.length) throw new Error("CSV needs unique id and input columns.");
  const fields = new Map(schema.map((field) => [field.key, field]));
  for (const column of header) if (column !== "id" && column !== "input" && !column.startsWith("expected.")) throw new Error(`Unknown CSV column "${column}". Use expected.field_key for ground truth.`);
  return rows.map((cells, index) => {
    if (cells.length !== header.length) throw new Error(`CSV row ${index + 2} has ${cells.length} columns; expected ${header.length}.`);
    const record = Object.fromEntries(header.map((key, i) => [key, cells[i]]));
    const expected: DatasetItem["expected"] = {};
    for (const [column, raw] of Object.entries(record)) {
      if (!column.startsWith("expected.") || !raw.trim()) continue;
      const key = column.slice(9), field = fields.get(key);
      if (field?.type === "float_range") expected[key] = Number(raw);
      else if (field?.type === "boolean") expected[key] = raw.toLowerCase() === "true" ? true : raw.toLowerCase() === "false" ? false : raw;
      else expected[key] = raw;
    }
    return { id: record.id, input: record.input, ...(Object.keys(expected).length ? { expected } : {}) };
  });
}

export function datasetSamples(schema: OutputSchema): { json: string; csv: string } {
  const expected = Object.fromEntries(schema.filter((field) => field.type !== "free_text" && (field.type !== "enum" || field.options?.length)).map((field) => [field.key,
    field.type === "enum" ? field.options?.[0]?.key ?? "option_key" : field.type === "boolean" ? true : field.range?.min ?? 0]));
  const fields = Object.keys(expected);
  return {
    json: JSON.stringify([{ id: "item-1", input: "Paste one input here", expected }, { id: "item-2", input: "An unscored input" }], null, 2),
    csv: `id,input${fields.map((key) => `,expected.${key}`).join("")}\nitem-1,Paste one input here${fields.map((key) => `,${csvCell(String(expected[key]))}`).join("")}\nitem-2,An unscored input${fields.map(() => ",").join("")}`,
  };
}

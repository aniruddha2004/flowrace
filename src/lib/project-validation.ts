const KEY = /^[a-z][a-z0-9_]*$/;
const OPTION_KEY = /^[a-z][a-z0-9_-]*$/;
const PROJECT_ID = /^[a-z][a-z0-9-]*$/;
const TYPES = new Set(["enum", "float_range", "boolean", "free_text"]);

function text(value: unknown, limit: number, required = false): boolean {
  return typeof value === "string" && value.length <= limit && (!required || value.trim().length > 0);
}

export function projectIssues(input: {
  id?: unknown; name: unknown; outputSchema: unknown; personaContext?: unknown;
  taskDescription?: unknown; inputLabel?: unknown; crossCuttingClues?: unknown;
}): string[] {
  const errors: string[] = [];
  if (input.id !== undefined && (typeof input.id !== "string" || !PROJECT_ID.test(input.id) || input.id.length > 80)) errors.push("Project ID must be 1–80 lowercase letters, numbers or dashes, starting with a letter.");
  if (!text(input.name, 120, true)) errors.push("Project name must be 1–120 characters.");
  if (input.personaContext !== undefined && !text(input.personaContext, 20_000)) errors.push("Project context must be at most 20,000 characters.");
  if (input.taskDescription !== undefined && !text(input.taskDescription, 500)) errors.push("Task description must be at most 500 characters.");
  if (input.inputLabel !== undefined && !text(input.inputLabel, 120)) errors.push("Input label must be at most 120 characters.");
  if (!Array.isArray(input.outputSchema) || input.outputSchema.length > 64) {
    errors.push("Output schema must contain at most 64 fields.");
    return errors;
  }
  const keys = new Set<string>();
  for (const [index, raw] of input.outputSchema.entries()) {
    const field = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const label = `Field ${index + 1}`;
    if (typeof field.key !== "string" || !KEY.test(field.key) || field.key.length > 80 || keys.has(field.key)) errors.push(`${label}: key must be unique, lowercase snake_case, at most 80 characters.`);
    else keys.add(field.key);
    if (!text(field.label, 120, true)) errors.push(`${label}: label must be 1–120 characters.`);
    if (!TYPES.has(field.type as string)) { errors.push(`${label}: unsupported type.`); continue; }
    if (field.type === "enum") {
      if (!Array.isArray(field.options) || field.options.length > 100) errors.push(`${label}: enum options must be an array of at most 100 items.`);
      else {
        const options = new Set<string>();
        for (const option of field.options) {
          if (!option || typeof option !== "object" || Array.isArray(option) || !text(option.key, 80, true) || !OPTION_KEY.test(option.key) || options.has(option.key) || !text(option.label, 120, true) || !text(option.description, 2000)) {
            errors.push(`${label}: enum options need distinct keys, labels and descriptions.`); break;
          }
          options.add(option.key);
        }
      }
    }
    if (field.type === "float_range") {
      const range = field.range as { min?: unknown; max?: unknown } | undefined;
      if (!range || typeof range.min !== "number" || typeof range.max !== "number" || !Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min >= range.max) errors.push(`${label}: range needs finite min < max.`);
    }
    for (const name of ["prompt", "promptHint", "generatePrompt", "constrainedPrompt"] as const) if (field[name] !== undefined && !text(field[name], 4000)) errors.push(`${label}: ${name} must be at most 4,000 characters.`);
    if (field.systemHint !== undefined && (!Array.isArray(field.systemHint) || field.systemHint.length !== 3 || field.systemHint.some((part: unknown) => !text(part, 500)))) errors.push(`${label}: systemHint needs three short strings.`);
    if (field.scale !== undefined && (!Array.isArray(field.scale) || field.scale.length > 21 || field.scale.some((part: unknown) => !text(part, 500)))) errors.push(`${label}: scale must contain at most 21 short strings.`);
    if (field.clues !== undefined && clueIssues(field.clues)) errors.push(`${label}: clues must contain at most 80 valid key/label/question objects.`);
    for (const name of ["supportClues", "opposeClues"] as const) if (field[name] !== undefined && (!Array.isArray(field[name]) || field[name].length > 80 || field[name].some((value: unknown) => !text(value, 80)))) errors.push(`${label}: ${name} must be a list of clue keys.`);
  }
  if (input.crossCuttingClues !== undefined && clueIssues(input.crossCuttingClues)) errors.push("Cross-cutting clues must contain at most 80 valid key/label/question objects.");
  return errors;
}

function clueIssues(raw: unknown): boolean {
  return !Array.isArray(raw) || raw.length > 80 || raw.some((clue) => !clue || typeof clue !== "object" || Array.isArray(clue) || !text(clue.key, 80, true) || !KEY.test(clue.key) || !text(clue.label, 120, true) || !text(clue.question, 4000, true));
}

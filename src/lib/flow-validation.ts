import type { FlowStep } from "./flows";
import type { ModelRow } from "./models";
import type { OutputSchema } from "./projects";
import { parseMapping } from "./http-mapping";

/** Shared pure validation for the builder and the API; neither trusts the other. */
export function validateFlow(steps: unknown, schema: OutputSchema, models: ModelRow[]): string[] {
  if (!Array.isArray(steps) || steps.length === 0) return ["Add at least one step."];
  const errors: string[] = [];
  const owners = new Map<string, number>();
  const fields = new Map(schema.map((field) => [field.key, field]));
  for (const field of schema) if (field.type === "enum" && !field.options?.length) errors.push(`Project field "${field.label}" needs an enum option before this flow can run.`);
  const ids = new Set<string>();
  for (const [i, candidate] of steps.entries()) {
    if (!candidate || typeof candidate !== "object") { errors.push(`Step ${i + 1} is invalid.`); continue; }
    const step = candidate as Partial<FlowStep>;
    if (typeof step.id !== "string" || !step.id.trim() || ids.has(step.id)) errors.push(`Step ${i + 1} needs a unique id.`);
    else ids.add(step.id);
    const model = models.find((m) => m.id === step.modelId);
    if (!model) errors.push(`Step ${i + 1}: model "${String(step.modelId)}" is not registered.`);
    else if (model.adapterType === "custom_http") {
      try {
        const mapping = parseMapping(model.apiConfig.requestTemplate ?? "");
        if (!mapping[step.role === "generate" ? "generate" : "decision"]) errors.push(`Step ${i + 1}: model "${model.name}" has no ${step.role} mapping.`);
      } catch { errors.push(`Step ${i + 1}: model "${model.name}" has an invalid HTTP mapping.`); }
    }
    else if (model.adapterType === "system_one" && step.role === "generate") errors.push(`Step ${i + 1}: system_one model "${model.name}" cannot generate free text.`);
    if (step.role !== "decide" && step.role !== "generate") errors.push(`Step ${i + 1} needs a decide or generate role.`);
    if (typeof step.seesPriorStepOutput !== "boolean") errors.push(`Step ${i + 1}: seesPriorStepOutput must be a boolean.`);
    if (step.promptOverride !== undefined && typeof step.promptOverride !== "string") errors.push(`Step ${i + 1}: promptOverride must be text.`);
    if (!Array.isArray(step.ownsFields)) { errors.push(`Step ${i + 1}: ownsFields must be an array.`); continue; }
    for (const key of step.ownsFields) {
      const field = fields.get(key);
      if (!field) { errors.push(`Step ${i + 1}: unknown field "${key}".`); continue; }
      if ((field.type === "free_text") !== (step.role === "generate")) errors.push(`Step ${i + 1}: ${field.label} must be owned by a ${field.type === "free_text" ? "generate" : "decide"} step.`);
      owners.set(key, (owners.get(key) ?? 0) + 1);
    }
  }
  const unowned = schema.filter((f) => !owners.has(f.key)).map((f) => f.label);
  if (unowned.length) errors.push(`Unowned fields: ${unowned.join(", ")}.`);
  const duplicated = schema.filter((f) => (owners.get(f.key) ?? 0) > 1).map((f) => f.label);
  if (duplicated.length) errors.push(`Fields owned more than once: ${duplicated.join(", ")}.`);
  return errors;
}

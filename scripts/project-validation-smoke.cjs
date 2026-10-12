/* eslint-disable @typescript-eslint/no-require-imports -- compile existing TS for a dependency-free contract check */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { projectIssues } = require("../src/lib/project-validation.ts");
const { validateFlow } = require("../src/lib/flow-validation.ts");

const base = { id: "resume-screening", name: "Resume screening", outputSchema: [
  { key: "fit", label: "Fit", type: "enum", options: [{ key: "strong-fit", label: "Strong", description: "Relevant experience" }] },
  { key: "years_experience", label: "Years", type: "float_range", range: { min: 0, max: 30 } },
  { key: "summary", label: "Summary", type: "free_text" },
] };
assert.deepEqual(projectIssues(base), []);
assert.match(projectIssues({ ...base, id: "../secrets" })[0], /Project ID/);
assert.ok(projectIssues({ ...base, outputSchema: [...base.outputSchema, { key: "fit", label: "Duplicate", type: "boolean" }] }).some((error) => error.includes("unique")));
assert.ok(projectIssues({ ...base, outputSchema: [{ key: "score", label: "Score", type: "float_range", range: { min: 10, max: 0 } }] }).some((error) => error.includes("min < max")));
assert.ok(projectIssues({ ...base, outputSchema: [{ key: "fit", label: "Fit", type: "enum", options: [{ key: "x", label: "X", description: "" }, { key: "x", label: "Again", description: "" }] }] }).length);
const incomplete = [{ key: "fit", label: "Fit", type: "enum", options: [] }];
assert.deepEqual(projectIssues({ id: "draft", name: "Draft", outputSchema: incomplete }), []);
assert.ok(validateFlow([{ id: "decide", modelId: "model", role: "decide", ownsFields: ["fit"], seesPriorStepOutput: false }], incomplete, [{ id: "model", adapterType: "llm_chat" }]).some((error) => error.includes("enum option")));
console.log("Project schema and flow validation rejects unsafe or incomplete definitions.");

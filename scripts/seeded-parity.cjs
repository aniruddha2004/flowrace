// Compare Phase 2 and Phase 3's exact adapter inputs with deterministic models.
// No network calls, no new packages: TypeScript is already a dev dependency.
/* eslint-disable @typescript-eslint/no-require-imports -- the harness must intercept `.ts` requires, so ESM imports cannot be used */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { execFileSync } = require("node:child_process");
const ts = require("typescript");
const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true };

require.extensions[".ts"] = (mod, file) => {
  const source = fs.readFileSync(file, "utf8");
  mod._compile(ts.transpileModule(source, { compilerOptions }).outputText, file);
};

function phase2(file) {
  const filename = path.resolve(__dirname, "..", file);
  const source = execFileSync("git", ["show", `e67e2b0:${file}`], { cwd: path.resolve(__dirname, ".."), env: { ...process.env, GIT_MASTER: "1" }, encoding: "utf8" });
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(ts.transpileModule(source, { compilerOptions }).outputText, filename);
  return mod.exports;
}

const { getDefaultProject } = require("../src/lib/projects.ts");
const { getSystemPrompt } = require("../src/lib/settings.ts");
const oldLlm = phase2("src/lib/flows/llmTriage.ts");
const oldJev = phase2("src/lib/flows/jevTriage.ts");
const newLlm = require("../src/lib/flows/llmTriage.ts");
const newJev = require("../src/lib/flows/jevTriage.ts");
const project = getDefaultProject();
const schema = project.outputSchema;
const settings = { project, systemPrompt: getSystemPrompt() };
const ticket = "The invoice was charged twice and I need a refund.";
const ownedSchema = schema.filter((field) => ["category", "priority", "sentiment", "route_to_team"].includes(field.key) || field.type === "free_text");
assert.equal(JSON.stringify(ownedSchema), JSON.stringify(schema), "Seeded step must pass the same schema as Phase 2");

function fakeLlm() {
  const calls = [];
  return {
    calls,
    cost: () => 0,
    async runDecision(input) {
      calls.push(JSON.stringify(input));
      const answers = Object.fromEntries(input.questions.map((q) => [q.key, {
        value: q.type === "enum" ? q.options[0].key : q.type === "float_range" ? 0 : q.type === "boolean" ? true : "fixture reasoning",
        confidence: 0.8,
      }]));
      return { answers, inputTokens: 12, outputTokens: 8, parseErrors: 0 };
    },
    async runGenerate(input) { calls.push(JSON.stringify(input)); return { text: "Fixture reply", inputTokens: 15, outputTokens: 10 }; },
  };
}

function fakeJev() {
  const calls = [];
  return {
    calls,
    cost: () => 0,
    async runDecision(input) {
      calls.push(JSON.stringify(input));
      const answers = Object.fromEntries(input.questions.map((q) => [q.key, {
        value: q.type === "enum" ? q.options[0].key : q.type === "float_range" ? 2 : 0.75,
        confidence: 0.8,
      }]));
      return { answers, inputTokens: 20, outputTokens: 0, parseErrors: 0 };
    },
  };
}

(async () => {
  const a0 = fakeLlm(), a1 = fakeLlm();
  const first0 = await oldLlm.decide(ticket, schema, settings, a0);
  const first1 = await newLlm.decide(ticket, ownedSchema, settings, a1);
  await oldLlm.generate(ticket, "reply", first0.analysis, settings, schema, a0);
  await newLlm.generate(ticket, "reply", first1.analysis, settings, schema, a1);
  assert.equal(JSON.stringify(a1.calls), JSON.stringify(a0.calls), "LLM only adapter inputs differ from Phase 2");
  assert.equal(JSON.stringify(first1), JSON.stringify(first0), "LLM only analysis differs from Phase 2");

  const b0 = fakeJev(), b1 = fakeJev(), writer0 = fakeLlm(), writer1 = fakeLlm();
  const jev0 = await oldJev.classifyWithJev(ticket, schema, settings, b0);
  const jev1 = await newJev.classifyWithJev(ticket, schema, settings, b1);
  await oldLlm.generateFrom(ticket, "reply", jev0.analysis, settings, schema, writer0);
  await newLlm.generateFrom(ticket, "reply", jev1.analysis, settings, schema, writer1);
  assert.equal(JSON.stringify(b1.calls), JSON.stringify(b0.calls), "Jev question payload differs from Phase 2");
  assert.equal(JSON.stringify(writer1.calls), JSON.stringify(writer0.calls), "Jev hybrid reply payload differs from Phase 2");
  assert.equal(JSON.stringify(jev1), JSON.stringify(jev0), "Jev analysis differs from Phase 2");
  console.log("Phase 2 seeded-flow parity: LLM decide/generate and Jev decide/generate request bytes and mapped analyses match.");
})().catch((err) => { console.error(err); process.exitCode = 1; });

/* eslint-disable @typescript-eslint/no-require-imports -- test project TypeScript without adding dependencies */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const ts = require("typescript");

require.extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
};

const { csvCell, datasetSamples, parseDatasetCsv, parseDatasetJson, validateDatasetItems } = require("../src/lib/dataset-format.ts");
const schema = [
  { key: "category", label: "Category", type: "enum", options: [{ key: "billing", label: "Billing" }, { key: "bug", label: "Bug" }] },
  { key: "sentiment", label: "Sentiment", type: "float_range", range: { min: -1, max: 1 } },
  { key: "urgent", label: "Urgent", type: "boolean" },
  { key: "reply", label: "Reply", type: "free_text" },
];

assert.equal(csvCell('quoted, "text"'), '"quoted, ""text"""');
assert.equal(parseDatasetCsv('id,input,expected.category,expected.sentiment,expected.urgent\na,"A, quoted ""message""",billing,-0.5,true\nb,Unscored,,,', schema)[0].input, 'A, quoted "message"');
assert.equal(parseDatasetJson(datasetSamples(schema).json).length, 2);
assert.equal(validateDatasetItems([{ id: "a", input: "x", expected: { category: "other", sentiment: 2, urgent: "yes" } }], schema).length, 3);

const temporary = fs.mkdtempSync(path.join("/tmp/opencode", "flowrace-eval-smoke-"));
process.chdir(temporary);
const { getDb } = require("../src/lib/db.ts");
const { createProvider } = require("../src/lib/providers.ts");
const { createModel } = require("../src/lib/models.ts");
const { getDefaultProject } = require("../src/lib/projects.ts");
const { createFlow } = require("../src/lib/flows.ts");
const { createDataset } = require("../src/lib/datasets.ts");
const { estimateEvaluation, getEvaluation, setEvaluationStatus } = require("../src/lib/evaluations.ts");
const { startEvaluation } = require("../src/lib/evaluation-runner.ts");
const { computeEvaluationReport, evaluationCsv, itemHasDisagreement, itemHasWrongAnswer } = require("../src/lib/evaluation-report.ts");

const mapping = { path: "/run", auth: { mode: "none" },
  decision: { body: { kind: "decide", text: "{{text}}", questions: "{{questionsByKey}}" }, answersPath: "answers", valuePath: "value", confidencePath: "confidence" },
  generate: { body: { kind: "generate", text: "{{text}}" }, textPath: "text" },
  usage: { inputTokensPath: "usage.in", outputTokensPath: "usage.out" },
};

(async () => {
  let activeRequests = 0, peakRequests = 0;
  const server = http.createServer(async (request, response) => {
    activeRequests++;
    peakRequests = Math.max(activeRequests, peakRequests);
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    await new Promise((resolve) => setTimeout(resolve, 25));
    response.setHeader("content-type", "application/json");
    if (body.text.includes("FAIL_CASE")) { response.statusCode = 502; response.end(JSON.stringify({ error: "fixture failure" })); activeRequests--; return; }
    if (body.kind === "decide") {
      const values = { category: "billing", priority: "medium", sentiment: -0.5, route_to_team: "billing", reasoning: "It is a billing request." };
      response.end(JSON.stringify({ answers: Object.fromEntries(Object.keys(body.questions).map((key) => [key, { value: values[key], confidence: 0.8 }])), usage: { in: 30, out: 8 } }));
    } else response.end(JSON.stringify({ text: "We will review your invoice.", usage: { in: 15, out: 12 } }));
    activeRequests--;
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    createProvider({ id: "fixture", name: "Fixture", protocol: "custom_http", apiBase: base, apiKeyEnvVar: "" });
    assert.equal(createModel({ id: "fixture-model", name: "Fixture", adapterType: "custom_http", providerId: "fixture", apiConfig: { apiBase: base, apiKeyEnvVar: "", modelId: "fixture", requestTemplate: JSON.stringify(mapping) }, pricing: { inputPerM: 1, outputPerM: 1, outputFree: false } }).ok, true);
    const project = getDefaultProject();
    const steps = [{ id: "decide", modelId: "fixture-model", role: "decide", ownsFields: project.outputSchema.filter((field) => field.type !== "free_text").map((field) => field.key), seesPriorStepOutput: false }, { id: "generate", modelId: "fixture-model", role: "generate", ownsFields: ["reply"], seesPriorStepOutput: true }];
    const flowA = createFlow({ id: "fixture-a", name: "Fixture A", projectId: project.id, steps });
    const flowB = createFlow({ id: "fixture-b", name: "Fixture B", projectId: project.id, steps });
    assert.equal(flowA.ok, true); assert.equal(flowB.ok, true);
    const flows = [flowA.flow, flowB.flow];
    const items = [{ id: "a", input: "Charge duplicated", expected: { category: "billing", priority: "medium", sentiment: -0.5, route_to_team: "billing" } }, { id: "b", input: "Unscored" }, { id: "c", input: "FAIL_CASE", expected: { category: "billing" } }, { id: "d", input: "Another invoice", expected: { category: "billing" } }];
    const dataset = createDataset(project.id, "Fixture dataset", items);
    const estimate = estimateEvaluation(project, flows, [require("../src/lib/models.ts").getModel("fixture-model")], items, 2);
    assert.equal(estimate.calls, 32);
    const result = { datasetName: dataset.name, items: dataset.items, schemaSnapshot: project.outputSchema, flowSnapshot: flows, options: { repeats: 2, concurrency: 2 }, estimate, completed: 0, total: 16, perFlow: { "fixture-a": 0, "fixture-b": 0 }, entries: [] };
    const run = startEvaluation(project.id, dataset.id, flows.map((flow) => flow.id), result, { project, systemPrompt: "Classify this input." });
    let saved;
    for (let i = 0; i < 100; i++) {
      saved = getEvaluation(run.id);
      if (["completed", "cancelled", "failed"].includes(saved.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    assert.equal(saved.status, "completed");
    assert.equal(saved.result.completed, 16);
    assert.equal(saved.result.entries.length, 16);
    assert.ok(peakRequests <= 4, `bounded concurrency exceeded: ${peakRequests}`);
    assert.equal(saved.result.entries.filter((entry) => entry.result.error).length, 4);
    const report = computeEvaluationReport(saved);
    assert.equal(report.flows.length, 2);
    assert.equal(report.flows[0].fields.find((field) => field.key === "category").accuracy, 2 / 3);
    assert.equal(report.flows[0].fields.find((field) => field.key === "sentiment").mae, 0);
    assert.ok(report.flows[0].latencyP95 >= report.flows[0].latencyP50);
    assert.ok(report.flows[0].totalCost > 0);
    assert.equal(report.flows[0].failed, 2);
    assert.equal(itemHasWrongAnswer(saved, items[2], 0.2), true);
    assert.equal(itemHasDisagreement(saved, items[0], 0.2), false);
    assert.ok(evaluationCsv(saved).includes("expected.category"));
    const longer = createDataset(project.id, "Cancel fixture", Array.from({ length: 30 }, (_, i) => ({ id: `cancel-${i}`, input: "Another invoice" })));
    const cancelResult = { ...result, items: longer.items, completed: 0, total: 60, perFlow: { "fixture-a": 0, "fixture-b": 0 }, entries: [] };
    const cancelled = startEvaluation(project.id, longer.id, flows.map((flow) => flow.id), cancelResult, { project, systemPrompt: "Classify this input." });
    setEvaluationStatus(cancelled.id, "cancel_requested");
    let after;
    for (let i = 0; i < 100; i++) { after = getEvaluation(cancelled.id); if (after.status === "cancelled") break; await new Promise((resolve) => setTimeout(resolve, 80)); }
    assert.equal(after.status, "cancelled");
    assert.ok(after.result.completed < after.result.total);
    console.log("Dataset parsing, bounded evaluation, partial failures, report metrics, CSV and cancellation passed.");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    getDb().close();
    fs.rmSync(temporary, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });

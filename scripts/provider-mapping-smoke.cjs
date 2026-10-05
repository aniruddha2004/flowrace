/* eslint-disable @typescript-eslint/no-require-imports -- load TS modules without adding a runtime dependency */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const ts = require("typescript");

require.extensions[".ts"] = (mod, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  mod._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
};

const { validateModelInput, createModel, deleteModel } = require("../src/lib/models.ts");
const { createProvider, providerKey, discoverModels, deleteProvider } = require("../src/lib/providers.ts");
const { runFlowDefinition } = require("../src/lib/flow-runner.ts");
const { parseMapping } = require("../src/lib/http-mapping.ts");
const { GLINER_MAPPING } = require("../src/lib/http-mapping.ts");
const { mappingForProtocol } = require("../src/lib/http-mapping.ts");
const { CustomHttpAdapter } = require("../src/lib/adapters/custom-http.ts");

const mapping = {
  path: "/invoke", auth: { mode: "bearer" },
  questionTemplates: { enum: { type: "choice", instructions: "{{question.instructions}}", criteria: "{{question.optionsMap}}" } },
  decision: { body: { kind: "decide", state: "{{text}}", model: "{{model}}", questions: "{{questionsByKey}}" }, answersPath: "answers", valueByType: { enum: "choice", free_text: "text" }, confidencePath: "confidence" },
  generate: { body: { kind: "generate", text: "{{text}}", context: "{{context}}" }, textPath: "output.text" },
  usage: { inputTokensPath: "usage.in", outputTokensPath: "usage.out" },
};

(async () => {
  assert.throws(() => parseMapping(JSON.stringify({ path: "//outside", decision: mapping.decision })), /absolute path/);
  assert.throws(() => parseMapping(JSON.stringify({ ...mapping, generate: { body: { leak: "{{secret}}" }, textPath: "output.text" } })), /Unknown template variable/);
  const seen = [];
  const server = http.createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/models") {
      response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ data: [{ id: "future-model", name: "Future model" }] })); return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    seen.push({ path: request.url, auth: request.headers.authorization, headers: request.headers, body });
    response.setHeader("content-type", "application/json");
    if (request.url === "/messages" || request.url?.startsWith("/models/gemini-fixture:generateContent")) {
      const prompt = request.url === "/messages" ? body.messages[0].content : body.contents[0].parts[0].text;
      const content = prompt.includes("Return only valid JSON") ? JSON.stringify({ answers: { fit: { value: "strong", confidence: 0.8 } } }) : "Generated response.";
      response.end(JSON.stringify(request.url === "/messages"
        ? { content: [{ text: content }], usage: { input_tokens: 9, output_tokens: 3 } }
        : { candidates: [{ content: { parts: [{ text: content }] } }], usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 3 } }));
      return;
    }
    response.end(JSON.stringify(body.kind === "decide" ? {
      answers: { fit: { choice: "strong", confidence: 0.9 }, reasoning: { text: "Matches the criteria", confidence: 0 } },
      usage: { in: 13, out: 6 },
    } : { output: { text: "Qualified candidate." }, usage: { in: 8, out: 4 } }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const id = `fixture_${process.pid}`;
  const modelId = `fixture_model_${process.pid}`;
  try {
    const provider = createProvider({ id, name: "Fixture API", protocol: "custom_http", apiBase: `http://127.0.0.1:${server.address().port}`, apiKeyEnvVar: "", apiKey: "fixture-private-key" });
    assert.equal(provider.hasCredential, true);
    assert.equal(Object.hasOwn(provider, "apiKey"), false);
    assert.equal(providerKey(provider), "fixture-private-key");
    const discovered = await discoverModels(provider);
    assert.equal(discovered[0].id, "future-model");
    const input = { id: modelId, name: "Fixture model", adapterType: "custom_http", providerId: id,
      apiConfig: { apiBase: provider.apiBase, apiKeyEnvVar: "", modelId: "future-model", requestTemplate: JSON.stringify(mapping) },
      pricing: { inputPerM: 2, outputPerM: 4, outputFree: false } };
    assert.deepEqual(validateModelInput(input), { ok: true });
    assert.equal(createModel(input).ok, true);
    const project = { id: "fixture-project", name: "Fixture", inputSchema: { kind: "text" }, inputLabel: "Input", taskDescription: "Review fit", personaContext: "", crossCuttingClues: [], createdAt: "",
      outputSchema: [{ key: "fit", label: "Fit", type: "enum", options: [{ key: "strong", label: "Strong", description: "Matches" }] }, { key: "summary", label: "Summary", type: "free_text" }] };
    const flow = { id: "fixture-flow", name: "Mock specialized pipeline", projectId: project.id, createdAt: "", steps: [
      { id: "step1", modelId, role: "decide", ownsFields: ["fit"], seesPriorStepOutput: false },
      { id: "step2", modelId, role: "generate", ownsFields: ["summary"], seesPriorStepOutput: true },
    ] };
    const events = [];
    const result = await runFlowDefinition(flow, "8 years of relevant experience", { project, systemPrompt: "Evaluate the input." }, (event) => events.push(event.type));
    assert.equal(result.error, undefined);
    assert.equal(result.analysis.values.fit.value, "strong");
    assert.equal(result.freeText.summary, "Qualified candidate.");
    assert.equal(result.totals.inputTokens, 21);
    assert.deepEqual(events, ["step_start", "step_done", "step_start", "step_done", "flow_done"]);
    assert.equal(seen.length, 2);
    assert.ok(seen.every((request) => request.path === "/invoke" && request.auth === "Bearer fixture-private-key"));
    assert.equal(seen[0].body.questions.fit.type, "choice");
    assert.equal(seen[0].body.questions.fit.criteria.strong, "Matches");
    console.log("Provider discovery, server-only credential, JSON mapping and two-step custom HTTP flow passed.");
    for (const [protocol, modelName, expectedPath, headerName] of [
      ["anthropic_messages", "claude-fixture", "/messages", "x-api-key"],
      ["gemini_generate", "gemini-fixture", "/models/gemini-fixture:generateContent", "x-goog-api-key"],
    ]) {
      const adapter = new CustomHttpAdapter({ ...input, apiConfig: { ...input.apiConfig, modelId: modelName, requestTemplate: JSON.stringify(mappingForProtocol(protocol)) } },
        { id: protocol, name: protocol, protocol, apiBase: `http://127.0.0.1:${server.address().port}`, apiKeyEnvVar: "", hasCredential: true, createdAt: "" }, "fixture-key");
      const decision = await adapter.runDecision({ text: "Applicant profile", context: "Evaluate fit.", questions: [{ key: "fit", type: "enum", instructions: "Select fit", options: [{ key: "strong", label: "Strong", description: "Matches" }] }] });
      assert.equal(decision.answers.fit.value, "strong");
      assert.equal(decision.inputTokens, 9);
      const generated = await adapter.runGenerate({ text: "Write a summary", context: "Be concise." });
      assert.equal(generated.text, "Generated response.");
      assert.ok(seen.slice(-2).every((entry) => entry.path === expectedPath && entry.headers[headerName] === "fixture-key"));
    }
    console.log("Anthropic and Gemini preset mappings completed decision and generation requests.");
    if (process.env.FLOWRACE_TEST_GLINER === "1") {
      const { getDefaultProject } = require("../src/lib/projects.ts");
      const { decide } = require("../src/lib/flows/llmTriage.ts");
      const { getAdapter } = require("../src/lib/registry.ts");
      const liveProviderId = `gliner_test_${process.pid}`;
      const liveModelId = `gliner_model_${process.pid}`;
      try {
        createProvider({ id: liveProviderId, name: "Local GLiNER test", protocol: "custom_http", apiBase: "http://127.0.0.1:8100", apiKeyEnvVar: "" });
        createModel({ id: liveModelId, name: "GLiNER", adapterType: "custom_http", providerId: liveProviderId,
          apiConfig: { apiBase: "http://127.0.0.1:8100", apiKeyEnvVar: "", modelId: "gliner2", requestTemplate: JSON.stringify(GLINER_MAPPING) },
          pricing: { inputPerM: 0, outputPerM: 0, outputFree: true } });
        const project = getDefaultProject();
        const result = await decide("I was billed twice and need a refund.", project.outputSchema, { project, systemPrompt: "Classify the input." }, getAdapter(liveModelId));
        assert.equal(typeof result.analysis.values.category.value, "string");
        assert.equal(typeof result.analysis.values.sentiment.value, "number");
        assert.equal(result.costUsd, 0);
        console.log("Real GLiNER /classify response mapped through JSON blueprint.");
      } finally { deleteModel(liveModelId); deleteProvider(liveProviderId); }
    }
  } finally {
    deleteModel(modelId); deleteProvider(id);
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });

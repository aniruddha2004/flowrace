/* eslint-disable @typescript-eslint/no-require-imports -- run TS utility without a new test dependency */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { readJsonObject } = require("../src/lib/api-json.ts");
const { readResponseText } = require("../src/lib/http-limits.ts");

(async () => {
  const object = await readJsonObject(new Request("http://localhost/", { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify({ message: "hello" }) }), 100);
  assert.deepEqual(object, { ok: true, value: { message: "hello" } });
  const large = await readJsonObject(new Request("http://localhost/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payload: "x".repeat(200) }) }), 100);
  assert.equal(large.status, 413);
  const chunked = new Request("http://localhost/", { method: "POST", headers: { "Content-Type": "application/json" }, duplex: "half", body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"x":"')); controller.enqueue(new TextEncoder().encode("x".repeat(200))); controller.enqueue(new TextEncoder().encode('"}')); controller.close(); } }) });
  assert.equal((await readJsonObject(chunked, 100)).status, 413);
  assert.equal((await readJsonObject(new Request("http://localhost/", { method: "POST", headers: { "Content-Type": "application/json" }, body: "[]" }), 100)).status, 400);
  assert.equal((await readJsonObject(new Request("http://localhost/", { method: "POST", headers: { "Content-Type": "application/json" }, body: "nope" }), 100)).status, 400);
  assert.equal((await readJsonObject(new Request("http://localhost/", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" }), 100)).status, 415);
  await assert.rejects(readResponseText(new Response("small", { headers: { "Content-Length": "1000" } }), 100), /allowed size/);
  const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("x".repeat(120))); controller.close(); } }));
  await assert.rejects(readResponseText(response, 100), /allowed size/);
  console.log("Bounded JSON parser rejects oversized, malformed and non-JSON requests.");
})().catch((error) => { console.error(error); process.exitCode = 1; });

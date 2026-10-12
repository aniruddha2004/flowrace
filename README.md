# Flow Race

A workbench for designing and racing AI pipelines. Each project defines an input and an output schema; each flow assigns those output fields to an ordered sequence of model steps. Race two or more flows on the same input and inspect streamed outputs, latency, token use, cost, and saved runs.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. The database and local provider credentials live under the gitignored `data/` directory. The original support-ticket project, Kimi model, Jev model, and their two flows are seeded automatically. Configure `LLM_API_KEY` (or the historical `JUSPAY_API_KEY`) and `TYPESAFE_API_KEY` for those two flows. Keys for other providers are only sent to their explicitly connected endpoint. The seeded requests are checked against their Phase 2 versions with `node scripts/seeded-parity.cjs`.

## Providers and models

Open **Models** → **Connect provider**. Presets include OpenAI, Anthropic, Gemini, OpenRouter, Groq, Together, Fireworks, Mistral, xAI, DeepSeek, Cerebras, and local Ollama. You can also enter any HTTP(S) provider base URL. Enter an environment-variable name or paste its API key: pasted keys are stored in `data/provider-credentials.json` (mode `0600`), separate from model definitions, and never returned by the API. Prefer environment variables for deployments. For an unauthenticated local service, leave the key blank and use `"auth": { "mode": "none" }` in its mapping.

Use **Browse models** to query the connected provider's model endpoint, filter the results, and register any model. If a provider doesn't expose a model list, type its model ID manually. The registry ID is a local stable identifier; the provider model ID is passed to the external API. Pricing is entered per million tokens. Only registered models appear in the flow builder. Connections with keys require HTTPS, except loopback development endpoints; model discovery refuses redirects so credential headers stay on the configured endpoint.

OpenAI-compatible chat providers use the existing forced-tool-call adapter, including its retries and schema validation. Anthropic Messages and Gemini generateContent get prefilled JSON mappings when you register a model. You can adjust those mappings without changing application code. The seeded Jev connection keeps its native System One adapter and request format.

### Nonstandard models: JSON wire mappings

Choose **JSON HTTP mapping** when registering a model such as GLiNER or another non-LLM service. A mapping defines its path, authentication, per-role request bodies, question conversion, and response paths. Whole-value placeholders preserve JSON arrays and objects; interpolated placeholders in text fields become strings. Supported placeholders include `{{text}}`, `{{context}}`, `{{model}}`, `{{prior}}`, `{{questions}}`, `{{questionsByKey}}`, `{{decisionPrompt}}`, and `{{maxTokens}}`. Per-question templates can also use `{{question.instructions}}`, `{{question.optionsMap}}`, and related question fields. No arbitrary JavaScript is evaluated.

Example for a service with `POST /classify` returning typed answers:

```json
{
  "path": "/classify",
  "auth": { "mode": "none" },
  "questionTemplates": {
    "enum": {
      "type": "choice",
      "instructions": "{{question.instructions}}",
      "criteria": "{{question.optionsMap}}"
    }
  },
  "decision": {
    "body": { "text": "{{text}}", "questions": "{{questionsByKey}}" },
    "answersPath": "answers",
    "valuePath": "value",
    "confidencePath": "confidence"
  },
  "usage": { "inputTokensPath": "usage.input_tokens", "outputTokensPath": "usage.output_tokens" }
}
```

For the local GLiNER2 bridge (`http://127.0.0.1:8100` or the private instance base URL), click **Load GLiNER example** in the mapping editor. Its example sends `tasks` to `/classify`, maps returned `label`/`confidence` per field, and converts an ordinal 0–10 sentiment label into the project's numeric range. GLiNER's mapping is decide-only; add an LLM generating step to produce free text. For Jev-like heterogeneous responses, `valueByType` selects a response property per question type. `transforms` support equality-to-boolean, numeric coercion, and ordinal-to-range conversion. Remove `decision` or `generate` when the service only supports one role; invalid flow assignments are rejected in the builder and API.

Mappings are validated before saving (path, placeholders, response paths, size, question types, transforms, and roles) and responses are checked against the project's output schema. Transport and credential header names cannot be set as literal mapping headers. HTTP calls and key resolution stay server-side. The shared adapter interface (`runDecision` / `runGenerate`) keeps flow execution independent of each service's wire protocol.

## API overview

- `GET/POST /api/providers`, `PATCH/DELETE /api/providers/[id]` — connections; responses include only `hasCredential`, never a key.
- `GET /api/providers/[id]/models` — discover a provider's available model IDs.
- `GET/POST /api/models`, `PATCH/DELETE /api/models/[id]` — register models; deleting a model used by a flow returns 409.
- `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/[id]` — project schema and context.
- `GET/POST /api/projects/[id]/flows`, `GET/PATCH/DELETE /api/flows/[id]` — linear flow definitions.
- `POST /api/race` with `{ "projectId": "support-ticket-triage", "flowIds": ["llm-only", "jev-hybrid"], "text": "…" }` — newline-delimited streaming `step_start`, `step_done`, `flow_done`/`flow_error`, `run_done` events.
- `GET /api/scoreboard?project=…` and `GET/DELETE /api/sessions` — aggregate comparisons and saved races.

## Dataset evaluation

Use the **Datasets** tab inside a project to paste JSON or upload CSV. Every item needs an `id` and `input`; `expected` is optional, may contain a subset of the project's non-free-text output fields, and uses enum option keys, numbers in the field range, or booleans. Unlabeled items still run and show outputs, but do not count toward accuracy. Validation reports errors by item before saving or running. The editor generates a schema-specific JSON/CSV sample.

```json
[
  { "id": "ticket-1", "input": "My invoice was charged twice.",
    "expected": { "category": "billing", "priority": "medium", "sentiment": -0.5, "route_to_team": "billing" } },
  { "id": "ticket-2", "input": "An unlabeled support request." }
]
```

CSV headers use `id,input,expected.category,expected.priority,...`; quoted commas and newlines are supported. Dataset snapshots are saved with each evaluation, so old reports remain readable after editing or deleting a dataset.

In **Evaluations**, pick a dataset and 2–8 project flows. The preview shows the estimated number of model calls and cost using registry pricing plus a token estimate. Above `EVAL_CONFIRM_THRESHOLD_USD` (default `$2`), the UI and API require explicit confirmation. Choose 1–5 simultaneous items and optionally repeat each item 1–5 times. Runs stream persistent per-flow progress; cancellation stops scheduling new items while in-flight work finishes. Individual flow failures are recorded without stopping the dataset.

The report contains per-field accuracy or numeric MAE and within-tolerance rate (tolerance defaults to `0.2` and can be changed), p50/p95 latency, total/mean cost, error counts, confidence calibration, contested-vs-clean signal accuracy, and repeat variance. Filter the per-item comparison for disagreements or errors, and download CSV or JSON. Saved reports can be reopened later.

Evaluation endpoints: `GET/POST /api/projects/[id]/datasets`, `GET/PATCH/DELETE /api/datasets/[id]`, `POST /api/eval-runs/estimate`, `POST /api/eval-runs`, `GET /api/projects/[id]/eval-runs`, `GET/PATCH/DELETE /api/eval-runs/[id]`, and `GET /api/eval-runs/[id]/events` (NDJSON progress). The 50-ticket dataset mentioned during development was not in this checkout; `node scripts/dataset-fixtures.cjs` produces a clearly labeled representative replacement for local verification.

JSON API bodies and upstream provider responses have size limits; invalid configuration values are rejected rather than silently defaulted. The seeded Juspay model accepts `LLM_API_KEY` or `JUSPAY_API_KEY`; credentials for other providers are resolved only from their own connection or environment variable. The app sends no pasted provider key back to the browser.

### Implementation boundaries

- `src/lib/project-validation.ts`, `flow-validation.ts`, `dataset-format.ts`, and `http-mapping.ts` hold validation and mapping rules shared with the builder where appropriate. API routes validate independently before persistence or execution.
- `src/lib/api-json.ts` caps incoming JSON bodies, including chunked requests; `dispatcher.ts` and `http-limits.ts` cap provider responses. Transport and credential headers cannot be overridden by a model mapping.
- `src/lib/server-config.ts` parses server environment settings and rejects malformed values. `credential-store.ts` alone reads/writes pasted provider keys in the gitignored data directory using private, atomic files. Providers carrying keys require HTTPS outside loopback development endpoints.
- `src/lib/flow-runner.ts` is the execution boundary; the same runner handles interactive races and bounded dataset evaluations. `evaluation-report.ts` computes metrics without transport or database dependencies.
- `src/components/` owns browser-only state and presentation. No API key or provider credential is serialized into a client response.

## Verify

```bash
npx next typegen
npx tsc --noEmit
npm run lint
npm run build
node scripts/seeded-parity.cjs
node scripts/provider-mapping-smoke.cjs
node scripts/evaluation-smoke.cjs
node scripts/api-json-smoke.cjs
node scripts/project-validation-smoke.cjs
```

The provider-mapping smoke test spins up a local mock HTTP provider, discovers a model, executes a decision and generation flow using only its JSON mapping, checks that the credential stays server-side, and cleans up its fixture records.

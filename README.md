# Flow Race

Race two support-ticket triage pipelines side by side on one pasted input. Paste raw
ticket text (an email, chat transcript, complaint…), press **Run Race**, and watch both
columns fill in live over a single NDJSON stream. Every number on screen is real:
API-reported token usage, measured milliseconds, and cost computed from real rates.
There is no mock data anywhere — if an API fails, that column shows a designed error
state instead of invented results.

**Features:** dynamic DB-backed taxonomy & settings (edit categories/priorities/routes,
system prompt, business context — no restarts), per-flow **transparency layer**
(Flow A shows the LLM's own reasoning, Flow B shows Jev's calibrated match signals),
per-step cost/latency/token breakdown, persistent session history with delete, light/dark
theme, and legible cost computation (rates are visible constants, not hidden env vars).

## The two flows

**Flow A — LLM tool-call**

1. `kimi-k3` classifies the ticket via a *forced* tool-call (`submit_ticket_analysis`,
   full JSON-schema with enums, per-field confidence, and a required `reasoning` field).
   Output is validated with zod; invalid payloads are fed back to the model (max 2
   retries; `parseErrors` counts every bad attempt).
2. A chained plain LLM call drafts the customer reply from the validated analysis.

**Flow B — Jev + LLM hybrid**

1. One call to [TypeSafe Jev](https://api.typesafe.ai) (`/v1/systemone`, System One)
   asks 4 main rubric questions — `category`, `priority`, `route_to_team` as `choice`,
   `sentiment` as a 5-level `score` — **plus** ~13 transparency probes:
   one `noul` (yes/no) question per taxonomy option ("does this ticket match this
   option's meaning?") and 3 fixed cross-cutting probes (multiple issues / explicit
   deadline / churn threat). Each `noul` answer is a probability 0..1 used directly as
   match confidence. Jev evaluates all questions in parallel, so the extra probes add
   almost no latency.
2. A chained LLM call drafts the reply **only** — handed Jev's decisions, explicitly
   forbidden from re-deriving them.

## Why it's interesting

| Concern | Flow A (LLM-only) | Flow B (Jev + LLM) |
| --- | --- | --- |
| Latency | classification wait for tool-call completion | Jev answers in ~0.5 s (all questions parallel) |
| Cost | kimi-k3 tokens for both steps | kimi-k3 only for the reply; Jev classification is ~71× cheaper per input token, output free |
| Reliability | LLM may emit malformed JSON → parseErrors/retries | Jev returns typed answers; structurally impossible to fail parsing |
| Transparency | LLM's own prose reasoning (uncalibrated but insightful) | Calibrated per-option match probabilities + mismatch flags |

Both flows stream live over the same NDJSON channel; the UI shows per-step
engine-labelled metric lines (which engine, which tokens, how long, how much).

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in keys
npm run dev                  # http://localhost:3000
```

### Keys

| Key | Needed for | Where to get it |
| --- | --- | --- |
| `TYPESAFE_API_KEY` | Flow B (Jev) | https://console.typesafe.ai/keys |
| `LLM_API_KEY` | Both flows (LLM calls) | your OpenAI-compatible gateway; falls back to `JUSPAY_API_KEY`, then `ANTHROPIC_API_KEY` |
| `ANTHROPIC_API_KEY` | optional LLM fallback | https://console.anthropic.com |

Without `TYPESAFE_API_KEY` the app still works: Flow B's column renders a designed
"TypeSafe API key needed" card (the error travels through the stream as data — the
route never crashes, Flow A is unaffected).

### Pricing

Cost is **not** env-var driven. `src/lib/pricing.ts` holds one `PRICING` constant set —
approximate, point-in-time rates per million tokens (rates drift; update there and
nowhere else):

```ts
export const PRICING = {
  kimi_k3: { inputPerM: 3.0, outputPerM: 15.0 },
  jev:     { inputPerM: 0.042, outputPerM: 0 }, // Jev never bills output tokens
};
```

The ⓘ icon next to each card's cost figure shows exactly which rates produced that
number.

## The stream

`POST /api/race` with `{"text": "…"}` returns `application/x-ndjson` — one JSON object
per line:

```ts
{type:"step_start", flow:"A"|"B", step:"classification"|"reply", at:number}
{type:"step_done",  flow, step:"classification", ms, data:TicketAnalysis, metrics}
{type:"step_done",  flow, step:"reply", ms, reply:string, metrics}
{type:"flow_done",  flow, totalMs, totals:{inputTokens,outputTokens,costUsd,parseErrors}}
{type:"flow_error", flow, step, code, message}
{type:"run_done"}
```

`TicketAnalysis` carries the flow-specific transparency field (`reasoning` for A,
`signals` + `signalMismatch` for B — never both).

Try it:

```bash
curl -N -X POST http://localhost:3000/api/race \
  -H "Content-Type: application/json" \
  -d '{"text":"I was charged twice for my October invoice and support has ignored me for a week. Fix this or I am canceling."}'
```

## Swapping the LLM provider

`src/lib/llm.ts` is the **only** module that talks to the LLM. At the top it builds
`llmConfig` from env vars:

```ts
baseURL: process.env.LLM_BASE_URL ?? "https://grid.ai.juspay.net",
apiKey:  process.env.LLM_API_KEY ?? process.env.JUSPAY_API_KEY ?? process.env.ANTHROPIC_API_KEY,
model:   process.env.LLM_MODEL ?? "kimi-k3",
```

Point `LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODEL` at any OpenAI-compatible
chat-completions endpoint (Anthropic's gateway, OpenAI itself, a local vLLM, …) and
both LLM steps use it. If you move to a non-OpenAI wire protocol, `chatCompletion()`
is the single function to reimplement; `classifyTicket`, `draftReply`, and
`draftReplyOnly` are protocol-agnostic.

Note for reasoning models (like kimi-k3): reasoning tokens count against the
completion budget, so classification calls must use `max_tokens >= 4096` and reply
calls `>= 3000`, or outputs truncate.

## Settings & taxonomy

The gear icon opens the settings modal with three tabs:

- **Business context** — free-form text describing your product/tone/policies. Injected
  into both Flows' prompts and into Jev's question `state` on the very next run.
- **System prompt** — the base LLM instruction; taxonomy lists are appended dynamically
  at request time so edits here never fight the taxonomy editor.
- **Taxonomy editor** — add/edit/delete `category`, `priority`, and `route_to_team`
  options (key + label + description). Both flows build their request schemas from the
  database at each request — changes apply to the next race immediately, no restart.
  Sentiment stays a fixed continuous field (-1..1). Past sessions store a
  `taxonomy_snapshot` so history renders exactly what was used at run time, even after
  options are deleted.

Config endpoints: `GET/PATCH /api/config`, `GET/POST /api/taxonomy`,
`PATCH/DELETE /api/taxonomy/[id]`.

## Session history

Every finished race is persisted to SQLite (`./data/flowrace.db`, via better-sqlite3) in
the `sessions` table, alongside `settings` and `taxonomy_options`. The left sidebar lists
newest-first with per-row trash + checkbox bulk-delete; click a row to reopen it
read-only. Per-step metrics are stored with the session, so history preserves the full
cost/timing breakdown. `GET /api/sessions`, `GET /api/sessions/[id]`,
`DELETE /api/sessions` (body `{ids:[]}`), `DELETE /api/sessions/[id]`.

## Theme

Light/dark toggle in the header; persisted to `localStorage("flowrace-theme")` and
bootstrapped pre-paint via an inline script in `layout.tsx`, so no flash on reload.

## Verification

```bash
npx tsc --noEmit
npm run build
npm run lint
```

import { postJsonWithRetry } from "../dispatcher";
import { modelCost, type ModelRow } from "../models";
import type {
  DecisionInput,
  DecisionOutput,
  GenerateInput,
  GenerateOutput,
  ModelAdapter,
  QuestionSpec,
} from "./types";

// ---------------------------------------------------------------------------
// system_one adapter — typed/calibrated questions answered in one parallel
// pass (Jev today). Implements runDecision only; free-text generation is not
// supported — runGenerate throws on purpose.
// ---------------------------------------------------------------------------

export class JevAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JevAuthError";
  }
}

export class JevError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "JevError";
  }
}

interface JevAnswerChoice {
  type: "choice";
  choice: string;
  probabilities?: Record<string, number>;
  confidence: number;
}

interface JevAnswerScore {
  type: "score";
  score: number;
  probabilities?: number[];
  confidence: number;
}

interface JevAnswerNoul {
  type: "noul";
  noul: number;
}

export type JevAnswer = JevAnswerChoice | JevAnswerScore | JevAnswerNoul;

interface JevResponse {
  model: string;
  answers: Record<string, JevAnswer>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

function toJevQuestion(spec: QuestionSpec): Record<string, unknown> {
  switch (spec.type) {
    case "enum":
      return {
        type: "choice",
        instructions: spec.instructions,
        criteria: Object.fromEntries((spec.options ?? []).map((o) => [o.key, o.description])),
      };
    case "float_range":
      return { type: "score", instructions: spec.instructions, criteria: spec.scale ?? [] };
    case "noul":
      return {
        type: "noul",
        instructions: spec.instructions,
        criteria: spec.noulCriteria ?? { true: "Yes", false: "No" },
      };
    default:
      throw new JevError(`system_one cannot answer free_text question "${spec.key}".`);
  }
}

export class SystemOneAdapter implements ModelAdapter {
  constructor(
    readonly model: ModelRow,
    private readonly apiKey: string,
  ) {}

  async runDecision(input: DecisionInput): Promise<DecisionOutput> {
    const startedAt = performance.now();
    const res = await postJsonWithRetry(
      this.model.apiConfig.apiBase,
      { Authorization: `Bearer ${this.apiKey}` },
      {
        state: input.text,
        model: this.model.apiConfig.modelId,
        questions: Object.fromEntries(input.questions.map((s) => [s.key, toJevQuestion(s)])),
      },
    );
    if (res.status === 401 || res.status === 403) {
      throw new JevAuthError(
        `API key was rejected (HTTP ${res.status}). Check ${this.model.apiConfig.apiKeyEnvVar} in .env.local, then restart the dev server.`,
      );
    }
    if (res.status < 200 || res.status >= 300) {
      throw new JevError(`Jev request failed: HTTP ${res.status} ${res.body.slice(0, 300)}`, res.status);
    }
    let json: JevResponse;
    try {
      json = JSON.parse(res.body) as JevResponse;
    } catch {
      throw new JevError(`Jev response was not JSON: HTTP ${res.status} ${res.body.slice(0, 300)}`, res.status);
    }

    const answers: DecisionOutput["answers"] = {};
    for (const spec of input.questions) {
      const a = json.answers[spec.key];
      if (!a) {
        throw new JevError("Jev response was missing expected typed answers.");
      }
      if (spec.type === "enum" && a.type === "choice") {
        answers[spec.key] = { value: a.choice, confidence: a.confidence };
      } else if (spec.type === "float_range" && a.type === "score") {
        answers[spec.key] = { value: a.score, confidence: a.confidence };
      } else if (spec.type === "noul" && a.type === "noul") {
        answers[spec.key] = { value: a.noul, confidence: a.noul };
      } else {
        throw new JevError("Jev response was missing expected typed answers.");
      }
    }
    return {
      answers,
      inputTokens: json.usage?.input_tokens ?? 0,
      outputTokens: json.usage?.output_tokens ?? 0,
      ms: Math.round(performance.now() - startedAt),
      parseErrors: 0,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  runGenerate(_input: GenerateInput): Promise<GenerateOutput> {
    throw new JevError(
      "system_one adapters can only answer typed questions — use an llm_chat model for free-text generation.",
    );
  }

  cost(inputTokens: number, outputTokens: number): number {
    return modelCost(this.model, inputTokens, outputTokens);
  }
}

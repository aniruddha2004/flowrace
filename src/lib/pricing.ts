// ---------------------------------------------------------------------------
// Cost rates in USD per million tokens. These are APPROXIMATE, point-in-time
// values — provider pricing drifts over time. Update this one place when
// rates change; never hardcode rates anywhere else.
// ---------------------------------------------------------------------------

export const PRICING = {
  kimi_k3: { inputPerM: 3.0, outputPerM: 15.0 },
  // Jev never generates free-form output tokens, so output is always free.
  jev: { inputPerM: 0.042, outputPerM: 0 },
} as const;

export interface TokenRates {
  inputPerMTok: number;
  outputPerMTok: number;
}

export const LLM_RATES: TokenRates = {
  inputPerMTok: PRICING.kimi_k3.inputPerM,
  outputPerMTok: PRICING.kimi_k3.outputPerM,
};

export const JEV_RATES: TokenRates = {
  inputPerMTok: PRICING.jev.inputPerM,
  outputPerMTok: PRICING.jev.outputPerM,
};

/** Cost in USD for a call, given token counts and per-MTok rates. */
export function usd(
  inputTokens: number,
  outputTokens: number,
  rates: TokenRates,
): number {
  return (
    (inputTokens / 1_000_000) * rates.inputPerMTok +
    (outputTokens / 1_000_000) * rates.outputPerMTok
  );
}

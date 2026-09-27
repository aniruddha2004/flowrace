// Display formatting helpers (client-safe, no secrets).

export function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function fmtCost(usd: number): string {
  if (usd === 0) return "$0.000000";
  if (usd < 0.000001) return `$${usd.toExponential(2)}`;
  return `$${usd.toFixed(6)}`;
}

export function fmtTokens(n: number): string {
  return n.toLocaleString("en-US");
}

export function fmtPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

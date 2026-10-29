export type ModelUsage = {
  input_tokens: number;
  cached_input_tokens: number;
  cache_write_input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
};

type Rates = { input: number; cachedInput: number; output: number; cacheWrite?: number };

export const COACHING_PRICING_VERSION = "openai-standard-2026-10-29";

// USD per one million tokens. Keep this explicit and versioned; unknown models are not estimated.
const rates: Record<string, Rates> = {
  "gpt-5": { input: 1.25, cachedInput: 0.125, output: 10 },
  "gpt-5.1": { input: 1.25, cachedInput: 0.125, output: 10 },
  "gpt-5.2": { input: 1.75, cachedInput: 0.175, output: 14 },
  "gpt-5.4": { input: 2.5, cachedInput: 0.25, output: 15 },
  "gpt-5-mini": { input: 0.25, cachedInput: 0.025, output: 2 },
  "gpt-5-nano": { input: 0.05, cachedInput: 0.005, output: 0.4 },
  "gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.5 },
  "gpt-5.4-nano": { input: 0.2, cachedInput: 0.02, output: 1.25 },
  "gpt-4.1": { input: 2, cachedInput: 0.5, output: 8 },
  "gpt-4.1-mini": { input: 0.4, cachedInput: 0.1, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, cachedInput: 0.025, output: 0.4 },
};

function modelRates(model: string): Rates | null {
  const exact = rates[model];
  if (exact) return exact;
  const base = Object.keys(rates).sort((a, b) => b.length - a.length)
    .find((name) => model.startsWith(`${name}-`));
  return base ? rates[base] : null;
}

function cost(model: string, usage: ModelUsage): number | null {
  const price = modelRates(model);
  if (!price) return null;
  const cached = Math.min(usage.input_tokens, usage.cached_input_tokens);
  const cacheWrite = Math.min(Math.max(0, usage.input_tokens - cached), usage.cache_write_input_tokens);
  const regular = Math.max(0, usage.input_tokens - cached - cacheWrite);
  return (regular * price.input + cached * price.cachedInput + cacheWrite * (price.cacheWrite ?? price.input) +
    usage.output_tokens * price.output) / 1_000_000;
}

export function coachingUsagePayload(model: string, attempts: ModelUsage[]) {
  const totals = attempts.reduce<ModelUsage>((sum, attempt) => ({
    input_tokens: sum.input_tokens + attempt.input_tokens,
    cached_input_tokens: sum.cached_input_tokens + attempt.cached_input_tokens,
    cache_write_input_tokens: sum.cache_write_input_tokens + attempt.cache_write_input_tokens,
    output_tokens: sum.output_tokens + attempt.output_tokens,
    reasoning_tokens: sum.reasoning_tokens + attempt.reasoning_tokens,
    total_tokens: sum.total_tokens + attempt.total_tokens,
  }), { input_tokens: 0, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 0, reasoning_tokens: 0, total_tokens: 0 });
  const attemptCosts = attempts.map((attempt) => cost(model, attempt));
  const estimated = attemptCosts.every((value) => value !== null)
    ? attemptCosts.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : null;
  return {
    schema_version: 1,
    pricing_version: COACHING_PRICING_VERSION,
    currency: "USD",
    model,
    attempt_count: attempts.length,
    attempts: attempts.map((attempt, index) => ({ ...attempt, estimated_cost_usd: attemptCosts[index] })),
    totals: { ...totals, estimated_cost_usd: estimated },
  };
}

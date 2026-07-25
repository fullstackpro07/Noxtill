export const AI_ERROR_CODES = {
  RATE_LIMITED: 'AI_RATE_LIMITED',
  COST_CAP_EXCEEDED: 'AI_COST_CAP_EXCEEDED',
} as const;

/** claude-3-5-haiku pricing (USD per token, public list price) — good enough for a cost-cap estimate. */
export const HAIKU_INPUT_COST_PER_TOKEN = 0.8 / 1_000_000;
export const HAIKU_OUTPUT_COST_PER_TOKEN = 4 / 1_000_000;

export const RATE_LIMIT_WINDOW_MS = 60_000;

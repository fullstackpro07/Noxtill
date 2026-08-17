export const AI_ERROR_CODES = {
  RATE_LIMITED: 'AI_RATE_LIMITED',
  COST_CAP_EXCEEDED: 'AI_COST_CAP_EXCEEDED',
} as const;

/** claude-3-5-haiku pricing (USD per token, public list price) — good enough for a cost-cap estimate. */
export const HAIKU_INPUT_COST_PER_TOKEN = 0.8 / 1_000_000;
export const HAIKU_OUTPUT_COST_PER_TOKEN = 4 / 1_000_000;

export const RATE_LIMIT_WINDOW_MS = 60_000;

/** OpenAI DALL-E 3 standard-quality 1024x1024 public list price (UPD-BE-048) — flat per-image cost. */
export const IMAGE_GENERATION_COST_USD = 0.04;

/**
 * AI Model Routing (spec "AI Model Routing v1.0", 2026-11-12) — the ONE place a model is named.
 *
 * Feature code never names a model or provider: it passes an AI `kind`, which `ai-operations.ts`
 * maps to one of the official operations, which maps to a tier below. Changing a model is a
 * one-line edit here. A CI check (`provider-isolation.spec.ts`) fails the build if a model ID or
 * provider API host appears in a file outside `src/ai/`.
 *
 * Prices are USD per million tokens as published in November 2026 (spec §2.2), used for cost
 * logging only — verify against each provider's own pricing page before relying on them for
 * billing decisions.
 *
 * Spec §6 report, MySQL form (run after a month in production):
 *   SELECT operation, tier, COUNT(*) AS runs,
 *          ROUND(AVG(tokens_in + tokens_out)) AS avg_tokens,
 *          ROUND(SUM(cost_cents) / 100, 2) AS cost_usd,
 *          ROUND(AVG(latency_ms)) AS avg_ms,
 *          ROUND(100 * SUM(used_fallback) / COUNT(*), 1) AS fallback_pct
 *   FROM ai_usage WHERE created_at > NOW() - INTERVAL 30 DAY
 *   GROUP BY operation, tier ORDER BY cost_usd DESC;
 */

export type AiProvider = 'openai' | 'anthropic' | 'google';
export type AiTier = 'easy' | 'medium' | 'hard';
/** Spec §4 specialised (non-tier) service routed through the same failover/logging path. */
export type AiService = 'vision';
export type AiRouteKey = AiTier | AiService;

export interface ModelTarget {
  provider: AiProvider;
  model: string;
}

export interface RouteConfig {
  primary: ModelTarget;
  fallback: ModelTarget;
  timeoutMs: number;
}

export const TIERS: Record<AiTier, RouteConfig> = {
  easy: {
    primary: { provider: 'openai', model: 'gpt-6-luna' },
    fallback: { provider: 'anthropic', model: 'claude-haiku-5-5' },
    timeoutMs: 8_000,
  },
  medium: {
    primary: { provider: 'openai', model: 'gpt-6.1-terra' },
    fallback: { provider: 'anthropic', model: 'claude-sonnet-5-5' },
    timeoutMs: 20_000,
  },
  hard: {
    primary: { provider: 'anthropic', model: 'claude-opus-5-5' },
    fallback: { provider: 'openai', model: 'gpt-6.1-sol' },
    timeoutMs: 90_000,
  },
};

/**
 * Spec §4: vision is not a language-model tier. Gemini 3.1 Flash Lite reads images and PDFs
 * natively; Claude Haiku is the fallback (also image + PDF capable). Long timeout because a
 * multi-page digitizer scan can produce up to 16k output tokens.
 */
export const SERVICES: Record<AiService, RouteConfig> = {
  vision: {
    primary: { provider: 'google', model: 'gemini-3.1-flash-lite' },
    fallback: { provider: 'anthropic', model: 'claude-haiku-5-5' },
    timeoutMs: 180_000,
  },
};

export function routeConfig(key: AiRouteKey): RouteConfig {
  return key === 'vision' ? SERVICES.vision : TIERS[key];
}

/** USD per million tokens — for cost logging only. `cached` = cached-input rate where published. */
export const PRICES: Record<
  string,
  { in: number; out: number; cached?: number }
> = {
  'gpt-6-luna': { in: 0.1, out: 0.5, cached: 0.01 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5 },
  'gpt-6.1-terra': { in: 1.0, out: 5.0, cached: 0.05 },
  'claude-sonnet-5-5': { in: 2.0, out: 10.0 },
  'claude-opus-5-5': { in: 4.0, out: 20.0 },
  'gpt-6.1-sol': { in: 2.0, out: 10.0 },
  'gemini-3.1-flash-lite': { in: 0.25, out: 1.5 },
};

/** Environment variable holding each provider's API key. An unset key skips that target. */
export const PROVIDER_KEY_ENV: Record<AiProvider, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GEMINI_API_KEY',
};

/** Human-readable provider names for disclosures and operator messages. */
export const PROVIDER_LABEL: Record<AiProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google Gemini',
};

/** Estimated USD cost of one call; unknown model → 0 (logged, never guessed). */
export function costUsd(
  model: string,
  tokensIn: number,
  tokensOut: number,
  cachedIn = 0,
): number {
  const p = PRICES[model];
  if (!p) return 0;
  const uncached = Math.max(0, tokensIn - cachedIn);
  const cachedRate = p.cached ?? p.in;
  return (uncached * p.in + cachedIn * cachedRate + tokensOut * p.out) / 1e6;
}

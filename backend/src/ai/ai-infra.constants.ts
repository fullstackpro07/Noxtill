export const AI_ERROR_CODES = {
  RATE_LIMITED: 'AI_RATE_LIMITED',
  COST_CAP_EXCEEDED: 'AI_COST_CAP_EXCEEDED',
  FEATURE_DISABLED: 'AI_FEATURE_DISABLED',
} as const;

/**
 * AI Settings (UPD-BE-115) — the 7 named toggles from the spec. A key not present in
 * `Business.aiFeatureToggles` defaults to enabled, so adding a new feature here never silently
 * disables it for existing businesses.
 */
export type AiFeatureKey =
  | 'voiceEntry'
  | 'photoDigitizer'
  | 'reviewReplies'
  | 'campaignCopy'
  | 'insights'
  | 'whatIf'
  | 'assistant';

export const AI_FEATURE_KEYS: AiFeatureKey[] = [
  'voiceEntry',
  'photoDigitizer',
  'reviewReplies',
  'campaignCopy',
  'insights',
  'whatIf',
  'assistant',
];

/**
 * Maps every `AiCallLog.kind` this codebase actually writes into one of the 7 toggleable
 * features, for both enforcement (`AiInfraService.checkGuardrails`) and the AI Settings screen's
 * per-feature usage figures. Deliberately incomplete: several real AI call sites (branch advisor,
 * pricing-rationale phrasing, segment personas, competitive opportunities, the AI phone
 * receptionist, bundle-pitch copy, the pre-signup business-type mapper) don't correspond to any of
 * the spec's 7 named features and are left off this map on purpose — their usage isn't
 * independently toggleable and is reported under "Other" rather than force-fit into a bucket that
 * doesn't really describe it.
 */
export const KIND_TO_FEATURE: Record<string, AiFeatureKey> = {
  voice_entry: 'voiceEntry',
  digitizer_scan: 'photoDigitizer',
  review_reply: 'reviewReplies',
  campaign_copy: 'campaignCopy',
  generate_image: 'campaignCopy',
  ai_insights: 'insights',
  marketing_reallocation: 'insights',
  what_if: 'whatIf',
  assistant_chat: 'assistant',
  help_ask: 'assistant',
};

/** EU AI Act transparency requirement (UPD-BE-115) — shown verbatim on the AI Settings screen. */
export const AI_USAGE_DISCLOSURE_TEXT =
  'Noxtill uses AI (Anthropic Claude, and OpenAI for voice transcription and image generation) to ' +
  "power the features below. AI-generated text and suggestions are based on this business's own " +
  'data and are never presented as human-written. AI features never take an irreversible action ' +
  '(sending a message, writing a sale, changing stock) without a human explicitly confirming it ' +
  'first. Usage is metered per business against the monthly cost cap and per-minute rate limit set ' +
  'below.';

/** claude-3-5-haiku pricing (USD per token, public list price) — good enough for a cost-cap estimate. */
export const HAIKU_INPUT_COST_PER_TOKEN = 0.8 / 1_000_000;
export const HAIKU_OUTPUT_COST_PER_TOKEN = 4 / 1_000_000;

export const RATE_LIMIT_WINDOW_MS = 60_000;

/** OpenAI DALL-E 3 standard-quality 1024x1024 public list price (UPD-BE-048) — flat per-image cost. */
export const IMAGE_GENERATION_COST_USD = 0.04;

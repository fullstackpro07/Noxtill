import { STT_PROVIDER } from '../ai/specialised-services';

/**
 * Usage, Limits & Subscription system — the registry (docs/Noxtill_Usage_Limits_System.md).
 *
 * Everything here is SEED data: plans, entitlements, meters and prices are written to the
 * database at boot (`UsageSeedService`) and read back from there at runtime, so a plan or price
 * can be changed with a row update and no deploy (spec §3.4). The seed only inserts rows that are
 * missing — it never overwrites a value an operator has since changed in the database.
 */

export const USAGE_ERROR_CODES = {
  FEATURE_NOT_IN_PLAN: 'FEATURE_NOT_IN_PLAN',
  CAPACITY_REACHED: 'CAPACITY_REACHED',
  ALLOWANCE_EXHAUSTED: 'ALLOWANCE_EXHAUSTED',
  SPEND_CAP_REACHED: 'SPEND_CAP_REACHED',
  METRIC_NOT_CONFIGURED: 'METRIC_NOT_CONFIGURED',
  SUBSCRIPTION_PAST_DUE: 'SUBSCRIPTION_PAST_DUE',
  SUBSCRIPTION_PAUSED: 'SUBSCRIPTION_PAUSED',
  TRIAL_METERED_DISABLED: 'TRIAL_METERED_DISABLED',
  RESERVATION_NOT_FOUND: 'RESERVATION_NOT_FOUND',
  DOWNGRADE_BLOCKED: 'DOWNGRADE_BLOCKED',
  PLAN_NOT_AVAILABLE: 'PLAN_NOT_AVAILABLE',
  STRIPE_NOT_CONFIGURED: 'STRIPE_NOT_CONFIGURED',
  PAYMENT_METHOD_REQUIRED: 'PAYMENT_METHOD_REQUIRED',
  PASSWORD_REQUIRED: 'PASSWORD_REQUIRED',
  INVALID_PASSWORD: 'INVALID_PASSWORD',
  PURCHASE_NOT_AVAILABLE: 'PURCHASE_NOT_AVAILABLE',
} as const;

export type EntitlementKind =
  'capacity' | 'allowance' | 'spend_cap' | 'feature' | 'passthrough';
export type ResetRule = 'none' | 'period' | 'one_off';

export const METRICS = {
  USERS: 'users',
  LOCATIONS: 'locations',
  AI_CREDITS: 'ai_credits',
  EMAILS: 'emails',
  SMS_SEGMENTS: 'sms_segments',
  WHATSAPP_MESSAGES: 'whatsapp_messages',
  AI_VOICE_MINUTES: 'ai_voice_minutes',
  VOICE_MINUTES: 'voice_minutes',
  SPEECH_ANALYSIS_MINUTES: 'speech_analysis_minutes',
  PHONE_NUMBERS_LOCAL: 'phone_numbers_local',
  PHONE_NUMBERS_TOLLFREE: 'phone_numbers_tollfree',
  AGENT_SEATS: 'agent_seats',
  AUTOMATION_RUNS: 'automation_runs',
  STORAGE_BYTES: 'storage_bytes',
  DIGITIZER_PAGES: 'digitizer_pages',
  SEO_KEYWORDS: 'seo_keywords',
  ESIGN_TRANSACTIONS: 'esign_transactions',
  WEBSITES: 'websites',
  INTEGRATIONS: 'integrations',
  VIDEO_MINUTES: 'video_minutes',
  VIDEO_PARTICIPANTS: 'video_participants',
  INTELLIGENCE_RUNS: 'intelligence_runs',
  VIDEO_RECORDING_MINUTES: 'video_recording_minutes',
  CALL_RECORDING_DAYS: 'call_recording_days',
  MEETING_RECORDING_DAYS: 'meeting_recording_days',
  CONCURRENT_CALLS: 'concurrent_calls',
  API_REQUESTS: 'api_requests',
  WEBSITE_BANDWIDTH_MB: 'website_bandwidth_mb',
  TRANSCRIPTION_MINUTES: 'transcription_minutes',
  AI_PHONE_RECEPTIONIST: 'ai_phone_receptionist',
} as const;
export type MetricCode = (typeof METRICS)[keyof typeof METRICS];

export interface MeterSeed {
  metricCode: MetricCode;
  displayName: string;
  unit: string;
  kind: EntitlementKind;
  provider: string | null;
  resetRule: ResetRule;
  isBillable: boolean;
  /** Whether a not_configured allowance pauses the feature. The five meters the owner hasn't set
   * per-plan numbers for yet are counted but not blocked (decided with the product owner). */
  enforced: boolean;
}

export const METER_SEEDS: MeterSeed[] = [
  {
    metricCode: 'users',
    displayName: 'Users',
    unit: 'user',
    kind: 'capacity',
    provider: null,
    resetRule: 'none',
    isBillable: false,
    enforced: true,
  },
  {
    metricCode: 'locations',
    displayName: 'Locations',
    unit: 'location',
    kind: 'capacity',
    provider: null,
    resetRule: 'none',
    isBillable: false,
    enforced: true,
  },
  {
    metricCode: 'ai_credits',
    displayName: 'AI credits',
    unit: 'credit',
    kind: 'allowance',
    provider: 'model',
    resetRule: 'period',
    isBillable: true,
    enforced: true,
  },
  {
    metricCode: 'emails',
    displayName: 'Emails',
    unit: 'email',
    kind: 'passthrough',
    provider: 'resend',
    resetRule: 'period',
    isBillable: true,
    enforced: true,
  },
  {
    metricCode: 'sms_segments',
    displayName: 'SMS',
    unit: 'segment',
    kind: 'passthrough',
    provider: 'twilio',
    resetRule: 'period',
    isBillable: true,
    enforced: true,
  },
  {
    metricCode: 'whatsapp_messages',
    displayName: 'WhatsApp messages',
    unit: 'message',
    kind: 'passthrough',
    provider: 'meta',
    resetRule: 'period',
    isBillable: false,
    enforced: false,
  },
  {
    metricCode: 'ai_voice_minutes',
    displayName: 'AI Receptionist minutes',
    unit: 'minute',
    kind: 'passthrough',
    provider: 'twilio',
    resetRule: 'period',
    isBillable: true,
    enforced: true,
  },
  {
    metricCode: 'voice_minutes',
    displayName: 'Human call minutes',
    unit: 'minute',
    kind: 'passthrough',
    provider: 'twilio',
    resetRule: 'period',
    isBillable: true,
    enforced: true,
  },
  {
    metricCode: 'speech_analysis_minutes',
    displayName: 'Speech quality analysis',
    unit: 'minute',
    kind: 'passthrough',
    provider: 'model',
    resetRule: 'period',
    isBillable: true,
    enforced: true,
  },
  {
    metricCode: 'phone_numbers_local',
    displayName: 'Local phone numbers',
    unit: 'number',
    kind: 'capacity',
    provider: 'twilio',
    resetRule: 'none',
    isBillable: true,
    enforced: true,
  },
  {
    metricCode: 'phone_numbers_tollfree',
    displayName: 'Toll-free numbers',
    unit: 'number',
    kind: 'capacity',
    provider: 'twilio',
    resetRule: 'none',
    isBillable: true,
    enforced: true,
  },
  {
    metricCode: 'agent_seats',
    displayName: 'Human agent seats',
    unit: 'seat',
    kind: 'capacity',
    provider: null,
    resetRule: 'none',
    isBillable: true,
    enforced: true,
  },
  {
    metricCode: 'automation_runs',
    displayName: 'Automation runs',
    unit: 'run',
    kind: 'allowance',
    provider: null,
    resetRule: 'period',
    isBillable: false,
    enforced: false,
  },
  {
    metricCode: 'storage_bytes',
    displayName: 'Storage',
    unit: 'byte',
    kind: 'allowance',
    provider: null,
    resetRule: 'none',
    isBillable: false,
    enforced: false,
  },
  {
    metricCode: 'digitizer_pages',
    displayName: 'Digitizer pages',
    unit: 'page',
    kind: 'allowance',
    provider: 'model',
    resetRule: 'period',
    isBillable: false,
    enforced: false,
  },
  {
    metricCode: 'seo_keywords',
    displayName: 'SEO keywords',
    unit: 'keyword',
    kind: 'allowance',
    provider: null,
    resetRule: 'none',
    isBillable: false,
    enforced: false,
  },
  {
    metricCode: 'esign_transactions',
    displayName: 'eSign transactions',
    unit: 'transaction',
    kind: 'allowance',
    provider: null,
    resetRule: 'period',
    isBillable: false,
    enforced: false,
  },
  {
    metricCode: 'websites',
    displayName: 'Websites',
    unit: 'site',
    kind: 'capacity',
    provider: null,
    resetRule: 'none',
    isBillable: false,
    enforced: false,
  },
  {
    metricCode: 'integrations',
    displayName: 'Active integrations',
    unit: 'integration',
    kind: 'capacity',
    provider: null,
    resetRule: 'none',
    isBillable: false,
    enforced: false,
  },
  {
    metricCode: 'call_recording_days',
    displayName: 'Call recordings kept (days)',
    unit: 'day',
    kind: 'capacity',
    provider: null,
    resetRule: 'none',
    isBillable: false,
    enforced: false,
  },
  {
    metricCode: 'meeting_recording_days',
    displayName: 'Meeting recordings kept (days)',
    unit: 'day',
    kind: 'capacity',
    provider: null,
    resetRule: 'none',
    isBillable: false,
    enforced: false,
  },
  {
    metricCode: 'concurrent_calls',
    displayName: 'Concurrent calls',
    unit: 'call',
    kind: 'capacity',
    provider: null,
    resetRule: 'none',
    isBillable: false,
    enforced: false,
  },
  {
    metricCode: 'api_requests',
    displayName: 'API requests',
    unit: 'request',
    kind: 'allowance',
    provider: null,
    resetRule: 'period',
    isBillable: false,
    enforced: false,
  },
  {
    metricCode: 'website_bandwidth_mb',
    displayName: 'Website bandwidth',
    unit: 'MB',
    kind: 'allowance',
    provider: null,
    resetRule: 'period',
    isBillable: false,
    enforced: false,
  },
  {
    metricCode: 'video_recording_minutes',
    displayName: 'Meeting recording minutes',
    unit: 'minute',
    kind: 'allowance',
    provider: 'livekit',
    resetRule: 'period',
    isBillable: false,
    enforced: false,
  },
  {
    metricCode: 'intelligence_runs',
    displayName: 'Intelligence runs',
    unit: 'run',
    kind: 'allowance',
    provider: null,
    resetRule: 'period',
    isBillable: false,
    enforced: false,
  },
  {
    metricCode: 'video_participants',
    displayName: 'Video meeting participants',
    unit: 'participant',
    kind: 'capacity',
    provider: null,
    resetRule: 'none',
    isBillable: false,
    enforced: false,
  },
  {
    metricCode: 'video_minutes',
    displayName: 'Video participant minutes',
    unit: 'minute',
    kind: 'allowance',
    provider: 'livekit',
    resetRule: 'period',
    isBillable: false,
    enforced: false,
  },
  {
    metricCode: 'transcription_minutes',
    displayName: 'Transcription minutes',
    unit: 'minute',
    kind: 'passthrough',
    provider: STT_PROVIDER,
    resetRule: 'period',
    isBillable: false,
    enforced: false,
  },
  {
    metricCode: 'ai_phone_receptionist',
    displayName: 'AI Phone Receptionist',
    unit: 'flag',
    kind: 'feature',
    provider: null,
    resetRule: 'none',
    isBillable: false,
    enforced: true,
  },
];

export const ALERT_THRESHOLDS = [50, 75, 90, 100];

/** Spec §3.1. `users`/`locations`/`credits` NULL = not confirmed. Enterprise is custom (contract). */
export interface PlanSeed {
  key: string;
  name: string;
  monthly: number | null;
  yearly: number | null;
  users: number | null;
  locations: number | null;
  credits: number | null;
  creditsReset: ResetRule;
  receptionist: boolean | null;
  trialDays: number;
  purchasable: boolean;
  displayOrder: number;
}

export const PLAN_SEEDS: PlanSeed[] = [
  {
    key: 'trial',
    name: 'Trial',
    monthly: 0,
    yearly: null,
    users: 2,
    locations: 1,
    credits: 200,
    creditsReset: 'one_off',
    receptionist: null,
    trialDays: 14,
    purchasable: false,
    displayOrder: 0,
  },
  {
    key: 'starter',
    name: 'Starter',
    monthly: 39,
    yearly: 351,
    users: 2,
    locations: 1,
    credits: 500,
    creditsReset: 'period',
    receptionist: false,
    trialDays: 0,
    purchasable: true,
    displayOrder: 1,
  },
  {
    key: 'growth',
    name: 'Growth',
    monthly: 79,
    yearly: 711,
    users: 5,
    locations: 1,
    credits: 1500,
    creditsReset: 'period',
    receptionist: true,
    trialDays: 0,
    purchasable: true,
    displayOrder: 2,
  },
  {
    key: 'professional',
    name: 'Professional',
    monthly: 159,
    yearly: 1431,
    users: 15,
    locations: 3,
    credits: 4000,
    creditsReset: 'period',
    receptionist: true,
    trialDays: 0,
    purchasable: true,
    displayOrder: 3,
  },
  {
    key: 'business',
    name: 'Business',
    monthly: 319,
    yearly: 2871,
    users: 40,
    locations: 10,
    credits: 8000,
    creditsReset: 'period',
    receptionist: true,
    trialDays: 0,
    purchasable: true,
    displayOrder: 4,
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    monthly: null,
    yearly: null,
    users: null,
    locations: null,
    credits: null,
    creditsReset: 'period',
    receptionist: true,
    trialDays: 0,
    purchasable: false,
    displayOrder: 5,
  },
];

/**
 * Video Meetings limits per plan (pricing page C6). 0 = not included. null = custom (Enterprise),
 * not capped here. The trial figures are a cost-protecting default, not from the pricing page.
 */
export const VIDEO_PLAN_LIMITS: Record<
  string,
  {
    minutes: number | null;
    participants: number | null;
    /** Recorded minutes per month: 20 h on Professional, 100 h on Business, none on a trial. */
    recordingMinutes: number | null;
  }
> = {
  trial: { minutes: 100, participants: 10, recordingMinutes: 0 },
  starter: { minutes: 0, participants: 0, recordingMinutes: 0 },
  growth: { minutes: 0, participants: 0, recordingMinutes: 0 },
  professional: { minutes: 2000, participants: 25, recordingMinutes: 1200 },
  business: { minutes: 10000, participants: 50, recordingMinutes: 6000 },
  enterprise: { minutes: null, participants: null, recordingMinutes: null },
};

/**
 * The heavy intelligence features (pricing page C10 / owner decision 5): on a plan with a number
 * here, each run uses one Intelligence run instead of AI credits, so daily use of the flagship
 * features never drains the credit pool. Plans without a number keep paying for them in credits.
 */
export const INTELLIGENCE_OPERATION_CODES = new Set([
  'bi.diagnosis',
  'bi.business_simulator',
  'competitive.recommendations',
]);
export const INTELLIGENCE_RUN_LIMITS: Record<string, number | null> = {
  business: 150,
};

const GB = 1024 ** 3;
/** Bytes in one extra-storage pack ($5 per 100 GB per month). Purchases store a pack count. */
export const STORAGE_PACK_BYTES = 100 * GB;

/**
 * Per-plan numbers from the pricing page (usage limits section). null = custom / not capped here
 * (Enterprise). Seeded into plan_entitlements; existing rows are filled by the ops script.
 */
export const PLAN_LIMITS: Record<
  string,
  {
    kind: EntitlementKind;
    resetRule: ResetRule;
    byPlan: Record<string, number | null>;
  }
> = {
  storage_bytes: {
    kind: 'allowance',
    resetRule: 'none',
    byPlan: {
      trial: 10 * GB,
      starter: 10 * GB,
      growth: 50 * GB,
      professional: 200 * GB,
      business: 500 * GB,
      enterprise: null,
    },
  },
  digitizer_pages: {
    kind: 'allowance',
    resetRule: 'period',
    byPlan: {
      trial: 50,
      starter: 50,
      growth: 200,
      professional: 1000,
      business: 3000,
      enterprise: null,
    },
  },
  call_recording_days: {
    kind: 'capacity',
    resetRule: 'none',
    byPlan: {
      trial: 60,
      starter: 0,
      growth: 60,
      professional: 90,
      business: 180,
      enterprise: null,
    },
  },
  meeting_recording_days: {
    kind: 'capacity',
    resetRule: 'none',
    byPlan: {
      trial: 0,
      starter: 0,
      growth: 0,
      professional: 30,
      business: 90,
      enterprise: null,
    },
  },
  concurrent_calls: {
    kind: 'capacity',
    resetRule: 'none',
    byPlan: {
      trial: 5,
      starter: null,
      growth: 5,
      professional: 15,
      business: 40,
      enterprise: null,
    },
  },
  api_requests: {
    kind: 'allowance',
    resetRule: 'period',
    byPlan: {
      trial: 10_000,
      starter: 10_000,
      growth: 50_000,
      professional: 250_000,
      business: 1_000_000,
      enterprise: null,
    },
  },
  website_bandwidth_mb: {
    kind: 'allowance',
    resetRule: 'period',
    byPlan: {
      trial: 100 * 1024,
      starter: null,
      growth: 100 * 1024,
      professional: 250 * 1024,
      business: 1024 * 1024,
      enterprise: null,
    },
  },
};

/** One-time free setup scanning on every plan (pricing page C15). */
export const FREE_SETUP_PAGES = 300;

/** Pages this window that count against the monthly allowance, after the free setup pages. */
export function billableDigitizerPages(
  pagesBeforeWindow: number,
  pagesInWindow: number,
): number {
  const freeLeft = Math.max(0, FREE_SETUP_PAGES - pagesBeforeWindow);
  return Math.max(0, pagesInWindow - freeLeft);
}

export const TRIAL_PLAN_KEY = 'trial';
export const ENTERPRISE_PLAN_KEY = 'enterprise';
export const TRIAL_DAYS = 14;

/** Rentals/capacity every plan includes zero of — they're bought (design: "only added when you approve it"). */
export const ZERO_INCLUDED_CAPACITY: MetricCode[] = [
  'phone_numbers_local',
  'phone_numbers_tollfree',
  'agent_seats',
];

// ---------------------------------------------------------------------------------------------
// Prices (product decision: the Usage & Limits design's prices). Seeded into `meter_prices`.
// ---------------------------------------------------------------------------------------------

export interface PriceSeed {
  metricCode: string;
  countryCode?: string;
  numberType?: string;
  unitPriceUsd: number;
  per?: number;
}

/** Noxtill SMS price per segment by destination (USD) — the design's 70-country catalog. */
export const SMS_COUNTRY_PRICES =
  'US:0.015,CA:0.012,GB:0.058,IE:0.098,DE:0.108,FR:0.103,NL:0.108,BE:0.108,LU:0.100,CH:0.108,AT:0.103,IT:0.103,ES:0.103,PT:0.098,SE:0.098,NO:0.103,DK:0.086,FI:0.098,IS:0.103,PL:0.089,CZ:0.089,SK:0.093,HU:0.093,RO:0.089,BG:0.093,GR:0.098,HR:0.093,SI:0.098,EE:0.086,LV:0.093,LT:0.089,CY:0.098,MT:0.098,AU:0.079,NZ:0.089,JP:0.103,KR:0.083,SG:0.065,HK:0.065,TW:0.072,MY:0.060,TH:0.060,ID:0.065,PH:0.058,VN:0.058,IN:0.018,PK:0.050,BD:0.055,LK:0.055,NP:0.060,AE:0.058,SA:0.060,QA:0.055,KW:0.060,BH:0.050,OM:0.060,IL:0.075,TR:0.046,ZA:0.050,NG:0.055,KE:0.050,GH:0.075,EG:0.060,MA:0.065,BR:0.058,MX:0.065,AR:0.065,CL:0.069,CO:0.065,PE:0.069'
    .split(',')
    .map((entry) => {
      const [countryCode, price] = entry.split(':');
      return { countryCode, unitPriceUsd: Number(price) };
    });

export const PRICE_SEEDS: PriceSeed[] = [
  ...SMS_COUNTRY_PRICES.map((p) => ({ metricCode: 'sms_segments', ...p })),
  { metricCode: 'emails', unitPriceUsd: 1.5, per: 1000 },
  { metricCode: 'ai_voice_minutes', unitPriceUsd: 0.35 },
  { metricCode: 'voice_minutes', countryCode: 'US', unitPriceUsd: 0.03 },
  { metricCode: 'speech_analysis_minutes', unitPriceUsd: 0.05 },
  { metricCode: 'phone_numbers_local', numberType: 'local', unitPriceUsd: 4 },
  {
    metricCode: 'phone_numbers_tollfree',
    numberType: 'tollfree',
    unitPriceUsd: 7,
  },
  { metricCode: 'agent_seats', unitPriceUsd: 19 },
  { metricCode: 'digitizer_pages', unitPriceUsd: 5, per: 100 },
  { metricCode: 'seo_keywords', unitPriceUsd: 10, per: 100 },
  { metricCode: 'esign_transactions', unitPriceUsd: 1 },
  { metricCode: 'websites', unitPriceUsd: 15 },
  { metricCode: 'users', unitPriceUsd: 10 },
  { metricCode: 'locations', unitPriceUsd: 39 },
  { metricCode: 'ai_credits', unitPriceUsd: 10, per: 1000 },
  // Priced per pack: a purchase's quantity is a count of 100 GB packs.
  { metricCode: 'storage_bytes', unitPriceUsd: 5 },
  { metricCode: 'video_minutes', unitPriceUsd: 10, per: 1000 },
  { metricCode: 'video_recording_minutes', unitPriceUsd: 5, per: 600 },
];

/** What can be bought from the Usage screens (spec §3.2 + design buy dialogs). */
export const PURCHASABLES = {
  credits: {
    metricCode: 'ai_credits',
    quantity: 1000,
    recurring: false,
    label: '1,000 AI credits',
  },
  seat: {
    metricCode: 'users',
    quantity: 1,
    recurring: true,
    label: '1 additional user',
  },
  location: {
    metricCode: 'locations',
    quantity: 1,
    recurring: true,
    label: '1 additional location',
  },
  localnum: {
    metricCode: 'phone_numbers_local',
    quantity: 1,
    recurring: true,
    label: '1 local phone number',
  },
  tollfree: {
    metricCode: 'phone_numbers_tollfree',
    quantity: 1,
    recurring: true,
    label: '1 toll-free number',
  },
  agentseat: {
    metricCode: 'agent_seats',
    quantity: 1,
    recurring: true,
    label: '1 human agent seat',
  },
  storage: {
    metricCode: 'storage_bytes',
    // A pack count: entitlements convert packs to bytes (STORAGE_PACK_BYTES).
    quantity: 1,
    recurring: true,
    label: '100 GB extra storage',
  },
  videominutes: {
    metricCode: 'video_minutes',
    quantity: 1000,
    recurring: true,
    label: '1,000 extra video meeting minutes per month',
  },
  recordinghours: {
    metricCode: 'video_recording_minutes',
    quantity: 600,
    recurring: true,
    label: '10 extra hours of meeting recording per month',
  },
} as const;
export type PurchaseKey = keyof typeof PURCHASABLES;

/** Default spend caps on a new subscription (spec §5.5: "Conservative — $10 voice, $10 messaging"). */
export const DEFAULT_SPEND_CAPS = { voice: 10, messaging: 10 } as const;
export const DEFAULT_MAX_CALL_MINUTES = 10;
export type CapGroup = 'voice' | 'messaging';
export const CAP_GROUP_METRICS: Record<CapGroup, MetricCode[]> = {
  voice: ['ai_voice_minutes', 'voice_minutes', 'speech_analysis_minutes'],
  messaging: ['emails', 'sms_segments'],
};

// ---------------------------------------------------------------------------------------------
// AI credits (spec §4)
// ---------------------------------------------------------------------------------------------

export type CreditBand = 'micro' | 'small' | 'medium' | 'large' | 'heavy';

/** Provisional bands (spec §4.4) — to be replaced with measured values. */
export const BAND_CREDITS: Record<CreditBand, number> = {
  micro: 1,
  small: 3,
  medium: 8,
  large: 25,
  heavy: 75,
};

/** Token ceilings per band, used to turn a call's real token count into its actual credit cost. */
export const BAND_TOKEN_CEILING: [CreditBand, number][] = [
  ['micro', 1_000],
  ['small', 4_000],
  ['medium', 15_000],
  ['large', 50_000],
  ['heavy', Number.POSITIVE_INFINITY],
];

export function bandForTokens(tokens: number): CreditBand {
  return BAND_TOKEN_CEILING.find(([, ceiling]) => tokens < ceiling)![0];
}

export interface AiOperation {
  code: string;
  module: string;
  label: string;
  band: CreditBand;
}

/**
 * Every AI `kind` this codebase passes to `AiInfraService` → the credit operation it is billed as.
 * `metering-coverage.spec.ts` fails the build if a call site uses a kind missing from here.
 * A kind mapped to `null` never consumes credits because it is billed on its own meter (the
 * call it belongs to is charged as voice minutes, digitizer scans as pages — spec §4.3).
 */
export const KIND_TO_OPERATION: Record<string, AiOperation | null> = {
  ai_insights: {
    code: 'dashboard.ai_insights',
    module: 'Dashboard',
    label: 'AI Insights',
    band: 'medium',
  },
  bi_insights: {
    code: 'bi.diagnosis',
    module: 'Business Intelligence',
    label: 'Diagnosis Center',
    band: 'medium',
  },
  what_if: {
    code: 'bi.business_simulator',
    module: 'Business Intelligence',
    label: 'Business Simulator',
    band: 'heavy',
  },
  assistant_chat: {
    code: 'assistant.business_chat',
    module: 'AI Assistant',
    label: 'Business Chat turn',
    band: 'small',
  },
  assistant_attachment: {
    code: 'assistant.attachment',
    module: 'AI Assistant',
    label: 'Attachment reading',
    band: 'small',
  },
  help_ask: {
    code: 'assistant.help',
    module: 'AI Assistant',
    label: 'Help Assistant turn',
    band: 'micro',
  },
  pos_voice_entry: {
    code: 'pos.voice_entry',
    module: 'Fast Sale (POS)',
    label: 'Voice-entry sale',
    band: 'micro',
  },
  pricing_rationale: {
    code: 'products.pricing_rationale',
    module: 'Products & Services',
    label: 'Pricing rationale',
    band: 'micro',
  },
  commerce_listing: {
    code: 'products.description',
    module: 'Products & Services',
    label: 'Description generation',
    band: 'small',
  },
  segment_persona: {
    code: 'crm.segment_suggestion',
    module: 'Customers (CRM)',
    label: 'Segment suggestion',
    band: 'small',
  },
  review_reply: {
    code: 'reviews.reply_draft',
    module: 'Reviews',
    label: 'AI review response draft',
    band: 'small',
  },
  review_sentiment: {
    code: 'reviews.sentiment',
    module: 'Reviews',
    label: 'Sentiment analysis',
    band: 'micro',
  },
  campaign_draft: {
    code: 'marketing.campaign_copy',
    module: 'Marketing',
    label: 'Campaign copy generation',
    band: 'large',
  },
  campaign_copy: {
    code: 'marketing.campaign_copy',
    module: 'Marketing',
    label: 'Campaign copy generation',
    band: 'large',
  },
  marketing_content_ideas: {
    code: 'marketing.content_ideas',
    module: 'Marketing',
    label: 'Content ideas',
    band: 'small',
  },
  marketing_reallocation: {
    code: 'marketing.agent_run',
    module: 'Marketing',
    label: 'AI Marketing Agent run',
    band: 'medium',
  },
  offer_copy: {
    code: 'profit.offer_copy',
    module: 'Profit & Analytics',
    label: 'Dead-hours offer copy',
    band: 'small',
  },
  profit_insight: {
    code: 'profit.insight_explanation',
    module: 'Profit & Analytics',
    label: 'Insight explanation',
    band: 'medium',
  },
  social_post: {
    code: 'social.content_studio_post',
    module: 'Social Media',
    label: 'AI Content Studio post',
    band: 'small',
  },
  social_caption: {
    code: 'social.caption',
    module: 'Social Media',
    label: 'Caption and hashtags',
    band: 'micro',
  },
  generate_image: {
    code: 'social.image',
    module: 'Social Media',
    label: 'Image generation',
    band: 'large',
  },
  ad_copy: {
    code: 'advertising.ad_copy',
    module: 'Advertising',
    label: 'Ad copy variants',
    band: 'small',
  },
  competitive_recommendation: {
    code: 'competitive.recommendations',
    module: 'Competitive Insights',
    label: 'AI recommendations',
    band: 'medium',
  },
  call_summary: {
    code: 'receptionist.call_summary',
    module: 'AI Phone Receptionist',
    label: 'Call summary',
    band: 'medium',
  },
  keyword_suggestions: {
    code: 'seo.keyword_suggestions',
    module: 'SEO Autopilot',
    label: 'Keyword suggestions',
    band: 'small',
  },
  seo_guest_topics: {
    code: 'seo.content_optimiser',
    module: 'SEO Autopilot',
    label: 'Content optimiser',
    band: 'small',
  },
  seo_guest_pitch: {
    code: 'seo.content_optimiser',
    module: 'SEO Autopilot',
    label: 'Content optimiser',
    band: 'small',
  },
  seo_guest_article: {
    code: 'seo.content_optimiser',
    module: 'SEO Autopilot',
    label: 'Content optimiser',
    band: 'large',
  },
  seo_content: {
    code: 'seo.content_optimiser',
    module: 'SEO Autopilot',
    label: 'Content optimiser',
    band: 'small',
  },
  finance_categorise: {
    code: 'finance.categorise',
    module: 'Finance & Accounting',
    label: 'Transaction categorisation',
    band: 'micro',
  },
  seo_link_building_outreach: {
    code: 'seo.agent_run',
    module: 'SEO Autopilot',
    label: 'AI SEO Agent run',
    band: 'medium',
  },
  inbox_draft: {
    code: 'inbox.suggested_reply',
    module: 'Unified Inbox',
    label: 'Suggested reply',
    band: 'small',
  },
  inbox_translate: {
    code: 'inbox.translation',
    module: 'Unified Inbox',
    label: 'Translation',
    band: 'micro',
  },
  inbox_summary: {
    code: 'inbox.summary',
    module: 'Unified Inbox',
    label: 'Conversation summary',
    band: 'medium',
  },
  projects_plan: {
    code: 'projects.task_breakdown',
    module: 'Projects & Tasks',
    label: 'Task breakdown',
    band: 'small',
  },
  projects_insight: {
    code: 'projects.insight',
    module: 'Projects & Tasks',
    label: 'Project insight',
    band: 'medium',
  },
  workflow_agent: {
    code: 'automations.ai_node',
    module: 'Automations',
    label: 'AI node execution',
    band: 'small',
  },
  report_builder: {
    code: 'reports.ai_builder',
    module: 'Reports',
    label: 'AI report builder',
    band: 'small',
  },
  branch_advice: {
    code: 'branches.advisor',
    module: 'Branches',
    label: 'Branch advisor',
    band: 'medium',
  },
  onboarding_description: {
    code: 'onboarding.description',
    module: 'Onboarding',
    label: 'Business description',
    band: 'small',
  },
  onboarding_offerings: {
    code: 'onboarding.offerings',
    module: 'Onboarding',
    label: 'Offerings suggestion',
    band: 'small',
  },
  payments_draft: {
    code: 'payments.draft',
    module: 'Payments',
    label: 'Payment message draft',
    band: 'small',
  },
  website_builder: {
    code: 'website.builder',
    module: 'Website',
    label: 'Website page draft',
    band: 'large',
  },
  digitizer_assistant: {
    code: 'digitizer.assistant',
    module: 'Photo Digitizer',
    label: 'Digitizer assistant',
    band: 'small',
  },
  voice_quality_assist: {
    code: 'voice.quality_assist',
    module: 'AI Phone Receptionist',
    label: 'QA suggestions',
    band: 'small',
  },
  voice_meeting_summary: {
    code: 'meetings.summary',
    module: 'Video Meetings',
    label: 'Meeting summary',
    band: 'medium',
  },
  voice_safety_review: {
    code: 'voice.safety_review',
    module: 'AI Phone Receptionist',
    label: 'Agent safety review',
    band: 'small',
  },
  customer_import: {
    code: 'crm.import_mapping',
    module: 'Customers (CRM)',
    label: 'Import column mapping',
    band: 'small',
  },
  /** Generic fallback for a bare `complete()` with no business attached (pre-signup). */
  complete: {
    code: 'general.complete',
    module: 'Other',
    label: 'AI request',
    band: 'small',
  },
  // Billed on their own meters, never as credits:
  voice_entry: null, // live call turns → AI Receptionist / human call minutes
  voice_realtime: null,
  digitizer_scan: null, // → digitizer pages
  business_type_map: null, // pre-signup, no business
};

/** Kinds that also write the voice-billing `voice_text_tokens` record (pre-existing behaviour). */
export const VOICE_TEXT_KINDS = new Set(['voice_entry', 'pos_voice_entry']);

/** Reservation lifetime before the sweeper auto-releases it (spec §4.7). */
export const RESERVATION_TTL_MS = 15 * 60 * 1000;
/** Actual exceeding reserved by more than this ratio emits `usage.estimate_exceeded` (spec §4.8). */
export const ESTIMATE_EXCEEDED_RATIO = 1.5;

/** Dunning (spec §13.4): days past due at which metered services pause / the account suspends. */
export const DUNNING_METERED_PAUSE_DAYS = 8;
export const DUNNING_SUSPEND_DAYS = 15;

/** Fail-open budget (spec §16.1): unmetered pass-through spend allowed while metering is down. */
export const FAIL_OPEN_BUDGET_USD = 5;

export const USAGE_QUEUE = 'usage-maintenance';

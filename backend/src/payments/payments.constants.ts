/**
 * Payments & Billing — shared constants: tabs, status colours, the refund state machine, the
 * default operational policy, provider capability registry and decline-code normalization.
 * Copy and colours follow `docs/Dashboard module with sidebar/payments-core.js`.
 */

export const PAY_ERRORS = {
  NOT_FOUND: 'PAYMENTS_NOT_FOUND',
  FORBIDDEN: 'PERMISSION_DENIED',
  INVALID: 'PAYMENTS_INVALID',
  CONFLICT: 'PAYMENTS_CONFLICT',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  METHOD_NOT_SUPPORTED: 'METHOD_NOT_SUPPORTED',
  CONNECTION_REQUIRED: 'CONNECTION_REQUIRED',
  DUPLICATE_OPERATION: 'DUPLICATE_OPERATION',
  IDEMPOTENT_REPLAY: 'IDEMPOTENT_REPLAY',
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  AMOUNT_OUT_OF_RANGE: 'AMOUNT_OUT_OF_RANGE',
  DUPLICATE_OPEN_REQUEST: 'DUPLICATE_OPEN_REQUEST',
  LIVE_CONFIRM_REQUIRED: 'LIVE_CONFIRM_REQUIRED',
  VERSION_CONFLICT: 'PAYMENTS_VERSION_CONFLICT',
} as const;

export type PayEnv = 'live' | 'test';

/** [key, tab label, path suffix, page title, subtitle, icon path] — payments-core.js TABS. */
export const TABS: [string, string, string, string, string, string][] = [
  [
    'overview',
    'Overview',
    '',
    'Payments & Billing',
    'Money requested, collected, failed, refunded, disputed and paid out',
    'M2 6h20v12H2zM2 10h20M6 15h4',
  ],
  [
    'transactions',
    'Transactions',
    '/transactions',
    'All Transactions',
    'Provider-facing payment ledger across every channel · not the accounting GL',
    'M4 6h16M4 12h16M4 18h10',
  ],
  [
    'requests',
    'Payment Requests',
    '/requests',
    'Payment Links & Requests',
    'Secure collection links · invoices stay in Orders',
    'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  ],
  [
    'recovery',
    'Failed Payments',
    '/recovery',
    'Failed Payments & Recovery',
    'Recover failed collections safely · messages go through Unified Inbox',
    'M3 12a9 9 0 1 0 3-6.7M3 3v6h6',
  ],
  [
    'refunds',
    'Refunds',
    '/refunds',
    'Refund Execution',
    'Executes refunds already approved in Orders · never decides them',
    'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  ],
  [
    'disputes',
    'Disputes',
    '/disputes',
    'Disputes & Chargebacks',
    'Provider dispute lifecycle · support cases stay in Helpdesk',
    'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  ],
  [
    'payouts',
    'Payouts',
    '/payouts',
    'Payouts & Settlements',
    'Money providers owe you · bank matching stays in Finance & Accounting',
    'M3 21h18M5 21V10M19 21V10M9 21v-6h6v6M2 10l10-7 10 7',
  ],
  [
    'recurring',
    'Recurring',
    '/recurring',
    'Recurring Collections',
    'Payment mandates and scheduled collections · plans stay with their source module',
    'M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3',
  ],
  [
    'routing',
    'Methods & Routing',
    '/routing',
    'Payment Methods & Routing',
    'Which method is offered where, and which connected provider handles it',
    'M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 9a9 9 0 0 1-9 9',
  ],
  [
    'reconciliation',
    'Reconciliation',
    '/reconciliation',
    'Provider Reconciliation',
    'Provider truth vs Noxtill truth · happens before bank reconciliation',
    'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9',
  ],
  [
    'settings',
    'Settings',
    '/settings',
    'Payment Policies & Settings',
    'Operational payment policy · credentials stay in Integrations',
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  ],
];
export const TAB_KEYS = TABS.map((t) => t[0]);

/** Status → [foreground, background, glyph] — payments-core.js CST. */
export const CST: Record<string, [string, string, string]> = {
  Succeeded: ['#0E8442', '#ECFDF3', '●'],
  Completed: ['#0E8442', '#ECFDF3', '●'],
  'Provider Confirmed': ['#0E8442', '#ECFDF3', '✓'],
  Paid: ['#0E8442', '#ECFDF3', '●'],
  Matched: ['#0E8442', '#ECFDF3', '✓'],
  Resolved: ['#0E8442', '#ECFDF3', '✓'],
  Won: ['#0E8442', '#ECFDF3', '✓'],
  Active: ['#0E8442', '#ECFDF3', '●'],
  Recovered: ['#0E8442', '#ECFDF3', '✓'],
  Live: ['#0E8442', '#ECFDF3', '●'],
  Connected: ['#0E8442', '#ECFDF3', '●'],
  'Bank Matched': ['#0E8442', '#ECFDF3', '✓'],
  Enabled: ['#0E8442', '#ECFDF3', '●'],
  Added: ['#0E8442', '#ECFDF3', '✓'],
  Submitted: ['#6941C6', '#F4F3FF', '↑'],
  Pending: ['#B54708', '#FEF6E7', '◷'],
  'Pending Verification': ['#B54708', '#FEF6E7', '?'],
  Authorized: ['#175CD3', '#EFF8FF', '◐'],
  Processing: ['#175CD3', '#EFF8FF', '…'],
  Queued: ['#475467', '#F2F4F7', '…'],
  'Provider Accepted': ['#175CD3', '#EFF8FF', '↑'],
  Ready: ['#175CD3', '#EFF8FF', '▶'],
  'Approval Required': ['#B54708', '#FEF6E7', '!'],
  Approved: ['#175CD3', '#EFF8FF', '✓'],
  'In Transit': ['#175CD3', '#EFF8FF', '→'],
  Scheduled: ['#6941C6', '#F4F3FF', '◷'],
  'Bank Match Pending': ['#B54708', '#FEF6E7', '◷'],
  'Under Review': ['#6941C6', '#F4F3FF', '◷'],
  Suggested: ['#6941C6', '#F4F3FF', '≈'],
  Syncing: ['#175CD3', '#EFF8FF', '…'],
  Failed: ['#B42318', '#FEF3F2', '✕'],
  Declined: ['#B42318', '#FEF3F2', '✕'],
  Blocked: ['#B42318', '#FEF3F2', '⊘'],
  'Timed Out': ['#B42318', '#FEF3F2', '⧗'],
  'Provider Unknown': ['#B42318', '#FEF3F2', '?'],
  'Manual Review': ['#B54708', '#FEF6E7', '!'],
  'Manual Review Required': ['#B54708', '#FEF6E7', '!'],
  Delayed: ['#B42318', '#FEF3F2', '⧗'],
  Mismatch: ['#B42318', '#FEF3F2', '≠'],
  'Amount Mismatch': ['#B42318', '#FEF3F2', '≠'],
  'Fee Mismatch': ['#B54708', '#FEF6E7', '≠'],
  'Unmatched Provider': ['#B42318', '#FEF3F2', '?'],
  'Unmatched Noxtill': ['#B42318', '#FEF3F2', '?'],
  Lost: ['#B42318', '#FEF3F2', '✕'],
  'Needs Response': ['#B42318', '#FEF3F2', '!'],
  'Past Due': ['#B42318', '#FEF3F2', '!'],
  Missing: ['#B42318', '#FEF3F2', '○'],
  Degraded: ['#B54708', '#FEF6E7', '!'],
  Disconnected: ['#B42318', '#FEF3F2', '✕'],
  'Connection Required': ['#B42318', '#FEF3F2', '✕'],
  Refunded: ['#6941C6', '#F4F3FF', '↺'],
  'Partially Refunded': ['#6941C6', '#F4F3FF', '◑'],
  Disputed: ['#B42318', '#FEF3F2', '!'],
  'Partially Paid': ['#175CD3', '#EFF8FF', '◑'],
  Open: ['#175CD3', '#EFF8FF', '●'],
  Sent: ['#175CD3', '#EFF8FF', '↗'],
  Viewed: ['#6941C6', '#F4F3FF', '◉'],
  Draft: ['#475467', '#F2F4F7', '✎'],
  Expired: ['#667085', '#F2F4F7', '○'],
  Cancelled: ['#667085', '#F2F4F7', '✕'],
  Paused: ['#475467', '#F2F4F7', '❚❚'],
  Ignored: ['#667085', '#F2F4F7', '–'],
  Disabled: ['#475467', '#F2F4F7', '○'],
  Unrecoverable: ['#667085', '#F2F4F7', '✕'],
  'Not available': ['#667085', '#F2F4F7', '–'],
  'Built-in': ['#475467', '#F2F4F7', '●'],
  'Accepted (lost)': ['#B42318', '#FEF3F2', '✕'],
  'Waiting on customer': ['#B54708', '#FEF6E7', '◷'],
  'Resolved elsewhere': ['#0E8442', '#ECFDF3', '✓'],
  Requested: ['#175CD3', '#EFF8FF', '↗'],
  'Handed to Inbox': ['#175CD3', '#EFF8FF', '↗'],
  Test: ['#B54708', '#FEF6E7', '◆'],
  Recommended: ['#475467', '#F2F4F7', ''],
  'Read-only': ['#475467', '#F2F4F7', '○'],
  Incomplete: ['#B54708', '#FEF6E7', '!'],
  Warning: ['#B54708', '#FEF6E7', '!'],
  Delivered: ['#0E8442', '#ECFDF3', '✓'],
  Read: ['#0E8442', '#ECFDF3', '✓'],
};

/** Refund execution transitions (payments-core.js REFUND_T), enforced server-side. */
export const REFUND_T: Record<string, string[]> = {
  'Approved Upstream': ['Ready', 'Approval Required', 'Manual Review'],
  'Approval Required': ['Ready', 'Manual Review'],
  Ready: ['Queued', 'Manual Review'],
  Queued: ['Processing', 'Failed'],
  Processing: ['Provider Accepted', 'Failed', 'Provider Unknown', 'Succeeded'],
  'Provider Accepted': ['Pending', 'Succeeded', 'Failed'],
  Pending: ['Succeeded', 'Failed'],
  'Provider Unknown': ['Processing', 'Succeeded', 'Failed'],
  Failed: ['Queued', 'Manual Review'],
  'Manual Review': ['Queued', 'Succeeded'],
  Succeeded: [],
};
export const REFUND_IN_FLIGHT = [
  'Queued',
  'Processing',
  'Provider Accepted',
  'Pending',
  'Provider Unknown',
];
export const DISPUTE_OPEN = [
  'Needs Response',
  'Under Review',
  'Approval Required',
  'Warning',
];
export const REQUEST_OPEN = ['Open', 'Sent', 'Viewed', 'Partially Paid'];

/** The 12 provider capability flags of the design's capability registry. */
export const CAP_KEYS = [
  'supportsAuthorization',
  'supportsSeparateCapture',
  'supportsPartialCapture',
  'supportsRefund',
  'supportsPartialRefund',
  'supportsPaymentLinks',
  'supportsRecurring',
  'supportsDisputesAPI',
  'supportsPayoutAPI',
  'supportsBalanceAPI',
  'supportsIdempotency',
  'supportsWebhookSignatures',
] as const;
export type CapKey = (typeof CAP_KEYS)[number];
export type Caps = Record<CapKey, boolean>;
const caps = (on: CapKey[]): Caps =>
  Object.fromEntries(CAP_KEYS.map((k) => [k, on.includes(k)])) as Caps;

export interface ProviderDef {
  key: string;
  name: string;
  /** What Noxtill can actually do with it today. */
  adapter: 'stripe' | 'readonly' | 'manual' | 'none';
  methods: string[];
  /** Capabilities when connected with write access. */
  caps: Caps;
  /** Capabilities when connected read-only (Stripe connected before read_write, Square, PayPal). */
  readCaps: Caps;
  why?: string;
}

/**
 * Provider registry. Stripe is the only provider Noxtill can move money through; Square and PayPal
 * are read-only imports (their connectors only request read scopes); the Pakistani gateways have no
 * adapter in this codebase (grep: billing/adapters/jazzcash-gateway.adapter.ts rejects every call).
 */
export const PROVIDERS: ProviderDef[] = [
  {
    key: 'stripe',
    name: 'Stripe',
    adapter: 'stripe',
    methods: ['Card', 'Wallet'],
    caps: caps([...CAP_KEYS]),
    readCaps: caps([
      'supportsPayoutAPI',
      'supportsBalanceAPI',
      'supportsWebhookSignatures',
    ]),
  },
  {
    key: 'square',
    name: 'Square',
    adapter: 'readonly',
    methods: ['Card', 'Wallet'],
    caps: caps([]),
    readCaps: caps([]),
    why: 'Square is connected read-only — issue refunds and captures in Square Dashboard.',
  },
  {
    key: 'paypal',
    name: 'PayPal',
    adapter: 'readonly',
    methods: ['Wallet', 'Card'],
    caps: caps([]),
    readCaps: caps([]),
    why: 'PayPal is connected read-only (reporting API) — act on it in your PayPal account.',
  },
  {
    key: 'manual',
    name: 'Cash / manual',
    adapter: 'manual',
    methods: ['Cash', 'Bank transfer', 'Online'],
    caps: caps(['supportsIdempotency']),
    readCaps: caps(['supportsIdempotency']),
  },
];
/** Providers shown as not available: no adapter exists in Noxtill. */
export const UNAVAILABLE_PROVIDERS = [
  { key: 'payfast', name: 'PayFast' },
  { key: 'jazzcash', name: 'JazzCash' },
  { key: 'easypaisa', name: 'Easypaisa' },
];
export const providerDef = (k: string) => PROVIDERS.find((p) => p.key === k);
export const providerName = (k: string | null | undefined) =>
  !k
    ? '—'
    : (providerDef(k)?.name ??
      UNAVAILABLE_PROVIDERS.find((p) => p.key === k)?.name ??
      k);

export const METHODS = [
  'Card',
  'Wallet',
  'Mobile wallet',
  'Bank transfer',
  'Cash',
  'Online',
];
export const CHANNELS = [
  'POS',
  'Website',
  'Payment Link',
  'Customer Portal',
  'Recurring',
];

/** Default method matrix (PayMethodConfig rows seeded on first use). Amounts are in base currency. */
export const DEFAULT_METHODS = (big: number) => [
  {
    method: 'Card',
    enabled: true,
    channels: [
      'POS',
      'Website',
      'Payment Link',
      'Customer Portal',
      'Recurring',
    ],
    primary: 'stripe',
    fallback: null,
    minAmount: 1,
    maxAmount: big * 10,
    riskPolicy: 'Provider risk rules (3-D Secure when the issuer asks)',
  },
  {
    method: 'Wallet',
    enabled: true,
    channels: ['Website', 'Payment Link'],
    primary: 'stripe',
    fallback: null,
    minAmount: 1,
    maxAmount: big * 5,
    riskPolicy: 'Provider default',
  },
  {
    method: 'Mobile wallet',
    enabled: false,
    channels: [],
    primary: null,
    fallback: null,
    minAmount: 0,
    maxAmount: 0,
    riskPolicy: '—',
  },
  {
    method: 'Bank transfer',
    enabled: true,
    channels: ['Payment Link'],
    primary: 'manual',
    fallback: null,
    minAmount: 0,
    maxAmount: big * 50,
    riskPolicy: 'Recorded by staff after the transfer arrives',
  },
  {
    method: 'Cash',
    enabled: true,
    channels: ['POS'],
    primary: 'manual',
    fallback: null,
    minAmount: 0,
    maxAmount: big,
    riskPolicy: 'Cash-up reconciliation in Fast Sale',
  },
  {
    method: 'Online',
    enabled: true,
    channels: ['POS'],
    primary: 'manual',
    fallback: null,
    minAmount: 0,
    maxAmount: big * 50,
    riskPolicy: 'Recorded at the counter — no provider reference',
  },
];

/** Request templates (product defaults — amounts and recipients are always confirmed in the wizard). */
export const TEMPLATES = [
  {
    id: 'tpl_dep',
    name: 'Booking deposit',
    d: 'Fixed deposit linked to a booking · expires in 3 days',
    type: 'Fixed',
    link: 'Booking',
    exp: 3,
  },
  {
    id: 'tpl_inv',
    name: 'Invoice balance',
    d: 'Collect an outstanding invoice balance · partial allowed',
    type: 'Fixed',
    link: 'Invoice',
    exp: 14,
  },
  {
    id: 'tpl_khata',
    name: 'Khata settlement',
    d: 'Customer chooses how much to pay towards credit balance',
    type: 'Flexible',
    link: 'Credit balance',
    exp: 30,
  },
];

export const PRECEDENCE = [
  'Branch',
  'Channel',
  'Country / currency',
  'Global default',
];

// ── policy ───────────────────────────────────────────────────────────────

export interface PayPolicy {
  collection: {
    captureMode: string;
    manualCaptureFor: string[];
    partialPayments: boolean;
    minRequest: number;
    maxRequest: number;
    requestExpiryDays: number;
  };
  retry: {
    maxAttempts: number;
    intervals: string;
    soft: string;
    hard: string;
    pauseAfter: string;
  };
  refund: {
    roles: string[];
    approvalAbove: number;
    partial: boolean;
    requireUpstream: boolean;
  };
  disputes: {
    warnDays: number;
    ownerId: string | null;
    evidenceReview: string;
    submitApprovalAbove: number;
    aiAutoSubmit: boolean;
  };
  payout: { delayHours: number; holdPct: number; feeVariancePct: number };
  messaging: {
    receipts: string;
    requestChannel: string;
    failureNotify: string;
  };
  risk: { manualReviewAbove: number; triggers: string[] };
  retention: { operational: string; rawEvents: string; exportPII: string };
  safeguards: {
    liveConfirm: boolean;
    testSeparate: boolean;
    testRetentionDays: number;
    staleMinutes: number;
  };
}

/** Defaults scale with the business's currency: "big" is a large single sale in that currency. */
export function defaultPolicy(currency: string): PayPolicy {
  const big = bigUnit(currency);
  return {
    collection: {
      captureMode: 'Automatic',
      manualCaptureFor: [],
      partialPayments: true,
      minRequest: Math.max(1, big / 1000),
      maxRequest: big * 100,
      requestExpiryDays: 14,
    },
    retry: {
      maxAttempts: 4,
      intervals: '6h, 24h, 72h',
      soft: 'Retry on schedule',
      hard: 'Never retry — ask for a new method',
      pauseAfter: 'Pause recovery after max attempts',
    },
    refund: {
      roles: ['Owner', 'Manager'],
      approvalAbove: big * 2,
      partial: true,
      requireUpstream: true,
    },
    disputes: {
      warnDays: 3,
      ownerId: null,
      evidenceReview: 'Second reviewer for large disputes',
      submitApprovalAbove: big,
      aiAutoSubmit: false,
    },
    payout: { delayHours: 24, holdPct: 5, feeVariancePct: 15 },
    messaging: {
      receipts: 'Email + WhatsApp via Unified Inbox',
      requestChannel: 'WhatsApp via Unified Inbox',
      failureNotify: 'After 2nd failed attempt',
    },
    risk: {
      manualReviewAbove: big * 5,
      triggers: ['Provider risk block', 'Amount over threshold'],
    },
    retention: {
      operational: '7 years',
      rawEvents: '13 months (sanitised)',
      exportPII: 'Masked unless Owner',
    },
    safeguards: {
      liveConfirm: true,
      testSeparate: true,
      testRetentionDays: 30,
      staleMinutes: 30,
    },
  };
}

/** A "large single sale" in a currency (PKR 100,000; USD/EUR/GBP 1,000; others 1,000). */
export function bigUnit(currency: string): number {
  return (
    (
      {
        PKR: 100000,
        INR: 50000,
        JPY: 100000,
        KRW: 1000000,
        IDR: 10000000,
      } as Record<string, number>
    )[currency] ?? 1000
  );
}

export function mergePolicy(base: PayPolicy, raw: unknown): PayPolicy {
  const r = (raw ?? {}) as Partial<
    Record<keyof PayPolicy, Record<string, unknown>>
  >;
  const out = { ...base } as Record<string, unknown>;
  for (const k of Object.keys(base) as (keyof PayPolicy)[])
    out[k] = { ...base[k], ...(r[k] ?? {}) };
  const p = out as unknown as PayPolicy;
  p.safeguards.testSeparate = true; // fixed: test data never reaches live totals
  p.disputes.aiAutoSubmit = false; // fixed: AI never submits a dispute response
  p.retry.hard = 'Never retry — ask for a new method'; // fixed: hard declines are never retried
  p.refund.requireUpstream = true; // fixed: Payments never decides a refund
  return p;
}

/** Settings sections — payments-screens.js SECS. */
export const SECS: [keyof PayPolicy, string, string][] = [
  [
    'collection',
    'Collection policies',
    'Capture mode, partial payments and request limits.',
  ],
  ['retry', 'Retry policies', 'Max attempts, intervals and decline handling.'],
  [
    'refund',
    'Refund execution',
    'Who can execute approved refunds and when approval is needed.',
  ],
  [
    'disputes',
    'Disputes',
    'Deadline warnings, owners and submission approval.',
  ],
  [
    'payout',
    'Payout alerts',
    'When a delay, hold or fee change raises an alert.',
  ],
  [
    'messaging',
    'Transactional messaging',
    'Receipt and request behaviour · messages are sent by Unified Inbox.',
  ],
  [
    'risk',
    'Risk handoff',
    'How provider risk states hand off to manual review.',
  ],
  ['retention', 'Data retention', 'Operational retention and export rules.'],
  [
    'safeguards',
    'Test / live safeguards',
    'Environment separation and live warnings.',
  ],
];
export const HIGH_RISK = [
  'retry.maxAttempts',
  'refund.approvalAbove',
  'safeguards.liveConfirm',
  'collection.captureMode',
  'risk.manualReviewAbove',
];

/** Retry interval string ("6h, 24h, 72h") → minutes between attempts. */
export function parseIntervals(s: string): number[] {
  return s
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .map((x) => {
      const m = /^(\d+(?:\.\d+)?)\s*([mhd])$/.exec(x);
      if (!m) return NaN;
      return (
        Number(m[1]) *
        ({ m: 1, h: 60, d: 1440 } as Record<string, number>)[m[2]]
      );
    })
    .filter((n) => Number.isFinite(n) && n > 0);
}

// ── decline normalization ──────────────────────────────────────────────────

export interface Norm {
  cat: string;
  rec:
    'Soft' | 'Needs customer' | 'Unrecoverable' | 'Blocked' | 'Manual review';
  guidance: string;
}

/** Provider decline / failure code → normalized reason. Unknown codes stay "Unknown provider code". */
export function normalizeFailure(
  code: string | null | undefined,
  outcome?: string | null,
): Norm {
  const c = (code ?? '').toLowerCase();
  if (
    outcome === 'blocked' ||
    [
      'fraudulent',
      'merchant_blacklist',
      'highest_risk_level',
      'elevated_risk_level',
    ].includes(c)
  )
    return {
      cat: 'Risk/policy block',
      rec: 'Blocked',
      guidance: 'Blocked by provider risk — never retry automatically',
    };
  if (
    [
      'lost_card',
      'stolen_card',
      'pickup_card',
      'restricted_card',
      'do_not_honor',
      'revocation_of_authorization',
      'security_violation',
      'transaction_not_allowed',
    ].includes(c)
  )
    return {
      cat: 'Hard decline',
      rec: 'Unrecoverable',
      guidance: 'Issuer says do not retry',
    };
  if (
    [
      'insufficient_funds',
      'card_velocity_exceeded',
      'withdrawal_count_limit_exceeded',
    ].includes(c)
  )
    return {
      cat: 'Insufficient funds',
      rec: 'Soft',
      guidance: 'Retry allowed after the next interval',
    };
  if (['expired_card'].includes(c))
    return {
      cat: 'Expired method',
      rec: 'Needs customer',
      guidance: 'Do not retry until the customer updates the card',
    };
  if (
    [
      'authentication_required',
      'authentication_not_handled',
      'payment_intent_authentication_failure',
    ].includes(c)
  )
    return {
      cat: 'Authentication required',
      rec: 'Needs customer',
      guidance: 'Customer must complete authentication',
    };
  if (
    [
      'incorrect_number',
      'invalid_number',
      'invalid_account',
      'incorrect_cvc',
      'invalid_cvc',
      'invalid_expiry_month',
      'invalid_expiry_year',
      'incorrect_zip',
    ].includes(c)
  )
    return {
      cat: 'Invalid account',
      rec: 'Needs customer',
      guidance: 'Ask the customer to check their details',
    };
  if (
    [
      'processing_error',
      'issuer_not_available',
      'reenter_transaction',
    ].includes(c)
  )
    return {
      cat: 'Provider unavailable',
      rec: 'Soft',
      guidance: 'Safe to retry now',
    };
  if (
    [
      'try_again_later',
      'generic_decline',
      'card_declined',
      'approve_with_id',
      'call_issuer',
      'no_action_taken',
      'not_permitted',
    ].includes(c)
  )
    return {
      cat: 'Soft decline',
      rec: 'Soft',
      guidance: 'Retry allowed after the next interval',
    };
  if (['timeout', 'provider_timeout'].includes(c))
    return {
      cat: 'Timeout',
      rec: 'Soft',
      guidance: 'State checked with the provider before any retry',
    };
  return {
    cat: 'Unknown provider code',
    rec: 'Manual review',
    guidance: 'Provider gave no retry guidance',
  };
}

/** Currencies the provider expresses in whole units. */
export const ZERO_DECIMAL = new Set([
  'bif',
  'clp',
  'djf',
  'gnf',
  'jpy',
  'kmf',
  'krw',
  'mga',
  'pyg',
  'rwf',
  'ugx',
  'vnd',
  'vuv',
  'xaf',
  'xof',
  'xpf',
]);
export const toMinor = (amount: number, currency: string) =>
  Math.round(amount * (ZERO_DECIMAL.has(currency.toLowerCase()) ? 1 : 100));
export const fromMinor = (minor: number, currency: string) =>
  minor / (ZERO_DECIMAL.has(currency.toLowerCase()) ? 1 : 100);

/** Data & Privacy, DSR queue (UPD-BE-123) — the spec's own "25-of-30-day legal-limit urgency flag": a pending/in-progress request becomes urgent once fewer than 5 real days remain of the 30-day legal response window. */
export const DSR_LEGAL_WINDOW_DAYS = 30;
export const DSR_URGENT_AT_DAY = 25;

export const GDPR_ERROR_CODES = {
  ALREADY_RESOLVED: 'GDPR_REQUEST_ALREADY_RESOLVED',
  CUSTOMER_NOT_FOUND: 'GDPR_CUSTOMER_NOT_FOUND',
} as const;

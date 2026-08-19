export const VOICE_RETENTION_QUEUE = 'voice-recording-retention';

/**
 * Spoken at the start of every call, before anything else — UPD-BE-057 requires this disclosure
 * be audible and NOT configurable out of the greeting (compliance requirement, not a preference).
 */
export const CALL_DISCLOSURE_TEXT =
  'This call may be recorded, and you are speaking with an automated assistant.';

/** How long a call recording (and its transcript row) is kept before the daily job purges it. */
export const RECORDING_RETENTION_DAYS = 90;

/** Hard cap on conversation turns per call — a runaway loop must still end the call, not hang forever. */
export const MAX_CALL_TURNS = 8;

export const VOICE_ERROR_CODES = {
  NUMBER_ALREADY_PROVISIONED: 'VOICE_NUMBER_ALREADY_PROVISIONED',
  NO_NUMBERS_AVAILABLE: 'VOICE_NO_NUMBERS_AVAILABLE',
  PROVIDER_NOT_CONFIGURED: 'VOICE_PROVIDER_NOT_CONFIGURED',
  UNKNOWN_NUMBER: 'VOICE_UNKNOWN_NUMBER',
} as const;

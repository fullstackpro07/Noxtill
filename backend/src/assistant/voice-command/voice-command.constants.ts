/**
 * Voice Assistant, general-purpose (UPD-BE-113) — a curated set of supported write actions, not
 * literally every write endpoint in the app (see the `VoiceCommandDraft` schema doc comment).
 * Chosen to span multiple modules (Inventory, Expenses, Customers, Cash Register) while staying a
 * scoped, testable first pass; extending this to a new action means adding a case to
 * `VoiceCommandService.execute()` plus a line in the parse prompt.
 */
export const VOICE_COMMAND_ACTIONS = [
  'record_wastage',
  'add_expense',
  'add_customer',
  'record_cash_movement',
] as const;

export type VoiceCommandAction = (typeof VOICE_COMMAND_ACTIONS)[number];

export const VOICE_COMMAND_ERROR_CODES = {
  UNRECOGNIZED: 'VOICE_COMMAND_UNRECOGNIZED',
  DRAFT_NOT_FOUND: 'VOICE_COMMAND_DRAFT_NOT_FOUND',
  ALREADY_RESOLVED: 'VOICE_COMMAND_ALREADY_RESOLVED',
  PRODUCT_NOT_MATCHED: 'VOICE_COMMAND_PRODUCT_NOT_MATCHED',
  INVALID_ARGS: 'VOICE_COMMAND_INVALID_ARGS',
} as const;

/** Matches OpenAI Whisper's own 25MB upload limit — same convention as `voice-sale.constants.ts`. */
export const MAX_VOICE_COMMAND_AUDIO_SIZE_BYTES = 25 * 1024 * 1024;

/** Common formats a browser MediaRecorder or a phone's voice-memo file would produce. */
export const ALLOWED_VOICE_COMMAND_AUDIO_MIME_TYPES = [
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/x-m4a',
];

/**
 * Spec §4 specialised (non-language-model) services. They are not routed through the tier
 * table, never consume AI credits, and each has its own meter. Their provider/model names live
 * here so feature code outside `src/ai/` can label usage records without naming a model.
 */

/** Speech-to-text — dedicated transcription model. */
export const STT_PROVIDER = 'openai';
export const STT_MODEL = 'whisper-1';

/** Realtime audio (AI Phone Receptionist live calls). */
export const REALTIME_PROVIDER = 'openai';

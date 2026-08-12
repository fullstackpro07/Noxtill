/** Matches OpenAI Whisper's own 25MB upload limit. */
export const MAX_VOICE_AUDIO_SIZE_BYTES = 25 * 1024 * 1024;

/** Common formats a browser MediaRecorder or a phone's voice-memo file would produce. */
export const ALLOWED_VOICE_AUDIO_MIME_TYPES = [
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/x-m4a',
];

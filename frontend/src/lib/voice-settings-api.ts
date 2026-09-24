import { apiFetch } from "@/lib/api-client";

export interface CustomIntent {
  name: string;
  priority: number;
}

export interface VoiceSettings {
  id: string | null;
  businessId: string;
  voiceId: string | null;
  responseTimeoutSeconds: number;
  queueHoldMessage: string | null;
  customIntents: CustomIntent[];
  /** Where a transfer rings; null falls back to the server-wide transfer number, if any. */
  transferNumber: string | null;
  /** May the AI read a matching product/service's price and stock to answer a caller. On by default. */
  shareCatalog: boolean;
  /** May the AI read a caller's OWN recent order status (caller ID must match a saved customer). Off by default. */
  shareOrderStatus: boolean;
  /** May the AI read a caller's OWN credit balance (caller ID must match a saved customer). Off by default. */
  shareCreditBalance: boolean;
}

export interface UpdateVoiceSettingsInput {
  voiceId?: string | null;
  responseTimeoutSeconds?: number;
  queueHoldMessage?: string | null;
  customIntents?: CustomIntent[];
  transferNumber?: string | null;
  shareCatalog?: boolean;
  shareOrderStatus?: boolean;
  shareCreditBalance?: boolean;
}

/**
 * Receptionist Settings (UPD-FE-051e) — every field here is real, wired into `VoiceCallService` on
 * the very next call (not inert config). `voiceId` picks among Twilio's own built-in `<Say>`
 * voices — there's no custom TTS service in this app, and Twilio exposes no preview API, so there
 * is deliberately no in-app voice sample playback (only actually heard on a real call).
 */
export function fetchVoiceSettings(): Promise<VoiceSettings> {
  return apiFetch<VoiceSettings>("/voice/settings");
}

export function updateVoiceSettings(input: UpdateVoiceSettingsInput): Promise<VoiceSettings> {
  return apiFetch<VoiceSettings>("/voice/settings", { method: "PATCH", body: JSON.stringify(input) });
}

/**
 * Real voice preview (Receptionist Settings depth fix) — synthesizes the SAME Amazon Polly voice
 * Twilio's `<Say>` actually uses on a real call, via a real AWS Polly `SynthesizeSpeech` call
 * server-side. Returns `audioBase64: null` (never a fabricated clip) for Twilio's 3 legacy
 * non-Polly names ("alice"/"man"/"woman", no real preview source) or when AWS credentials aren't
 * configured server-side.
 */
export function fetchVoicePreview(voiceId: string): Promise<{ audioBase64: string | null }> {
  return apiFetch<{ audioBase64: string | null }>(`/voice/settings/voice-preview?voiceId=${encodeURIComponent(voiceId)}`);
}

/** Real Twilio `<Say>` voice names — not exhaustive, but every one of these is a real, valid Twilio voice. */
export const TWILIO_VOICE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Twilio default" },
  { value: "Polly.Joanna", label: "Joanna (US English, female)" },
  { value: "Polly.Matthew", label: "Matthew (US English, male)" },
  { value: "Polly.Amy", label: "Amy (British English, female)" },
  { value: "Polly.Brian", label: "Brian (British English, male)" },
  { value: "alice", label: "Alice (default female)" },
  { value: "man", label: "Generic male" },
  { value: "woman", label: "Generic female" },
];

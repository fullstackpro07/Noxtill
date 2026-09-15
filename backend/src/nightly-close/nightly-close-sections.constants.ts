/** Nightly Close Settings, full (UPD-BE-119) — one key per real data point `composeDayData()` already computes; there is no eighth section hiding anywhere, this is the exhaustive real list. */
export const NIGHTLY_CLOSE_SECTIONS = [
  'sales',
  'lowStock',
  'appointmentsTomorrow',
  'newReviews',
  'openFeedback',
  'creditPayments',
] as const;

export type NightlyCloseSection = (typeof NIGHTLY_CLOSE_SECTIONS)[number];

export const DEFAULT_NIGHTLY_CLOSE_SECTIONS: NightlyCloseSection[] = [
  ...NIGHTLY_CLOSE_SECTIONS,
];

export interface NightlyCloseCustomLine {
  label: string;
  value: string;
}

export type NightlyCloseChannel = 'whatsapp' | 'sms' | 'email';
export const NIGHTLY_CLOSE_CHANNELS: NightlyCloseChannel[] = [
  'whatsapp',
  'sms',
  'email',
];

export interface NightlyCloseConfig {
  sections: NightlyCloseSection[];
  voiceNoteEnabled: boolean;
  voiceId: string | null;
  customLines: NightlyCloseCustomLine[];
  /** Nightly-Close-only multi-channel override (fix-it) — deliberately separate from
   * `business.channelPref` (the single-channel default used by every other message type across
   * the app). `[]` means "no override, use `channel`/`channelPref` as before"; 2+ entries means
   * send the same close on every listed channel. */
  channels: NightlyCloseChannel[];
}

export const DEFAULT_NIGHTLY_CLOSE_CONFIG: NightlyCloseConfig = {
  sections: DEFAULT_NIGHTLY_CLOSE_SECTIONS,
  voiceNoteEnabled: false,
  voiceId: null,
  customLines: [],
  channels: [],
};

/** A handful of real, named options — not an open text field — matching how the screen presents a
 * voice picker. Each maps to a real Twilio `<Say voice="Polly.X">` identifier in
 * `NightlyCloseVoiceCallService`, which places a real outbound call reading the close aloud in
 * that voice when enabled. */
export const NIGHTLY_CLOSE_VOICE_OPTIONS = [
  { id: 'warm_female', label: 'Warm (female)' },
  { id: 'calm_male', label: 'Calm (male)' },
  { id: 'energetic_neutral', label: 'Energetic (neutral)' },
] as const;

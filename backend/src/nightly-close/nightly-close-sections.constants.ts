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

export interface NightlyCloseConfig {
  sections: NightlyCloseSection[];
  voiceNoteEnabled: boolean;
  voiceId: string | null;
  customLines: NightlyCloseCustomLine[];
}

export const DEFAULT_NIGHTLY_CLOSE_CONFIG: NightlyCloseConfig = {
  sections: DEFAULT_NIGHTLY_CLOSE_SECTIONS,
  voiceNoteEnabled: false,
  voiceId: null,
  customLines: [],
};

/** A handful of real, named options — not an open text field — matching how the screen presents a voice picker. Storing the id/label is real and validated; actual TTS audio generation isn't wired (see NightlyCloseService doc comment). */
export const NIGHTLY_CLOSE_VOICE_OPTIONS = [
  { id: 'warm_female', label: 'Warm (female)' },
  { id: 'calm_male', label: 'Calm (male)' },
  { id: 'energetic_neutral', label: 'Energetic (neutral)' },
] as const;

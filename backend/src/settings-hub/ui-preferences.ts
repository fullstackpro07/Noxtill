/** A person's own interface preferences, stored on their user record (`User.uiPreferences`). */
export type MotionPref = 'normal' | 'reduced' | 'off';
export type FontSizePref = 'default' | 'large' | 'xlarge';
export type SoundStyle = 'chime' | 'soft' | 'pulse';

export interface SoundPrefs {
  enabled: boolean;
  style: SoundStyle;
  /** 0–100 */
  volume: number;
  /** Minimum seconds between two sounds. */
  cooldownSec: number;
  quietFrom: string | null;
  quietTo: string | null;
  /** High-priority notifications may still sound during quiet hours. */
  quietAllowHigh: boolean;
}

export interface UiPrefs {
  motion: MotionPref;
  fontSize: FontSizePref;
  sound: SoundPrefs;
}

export const UI_PREF_DEFAULTS: UiPrefs = {
  motion: 'normal',
  fontSize: 'default',
  sound: { enabled: true, style: 'chime', volume: 60, cooldownSec: 8, quietFrom: null, quietTo: null, quietAllowHigh: true },
};

export const MOTION_OPTIONS: { value: MotionPref; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'reduced', label: 'Reduced' },
  { value: 'off', label: 'Off' },
];

export const FONT_OPTIONS: { value: FontSizePref; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'large', label: 'Large' },
  { value: 'xlarge', label: 'Extra large' },
];

export const SOUND_STYLE_OPTIONS: { value: SoundStyle; label: string }[] = [
  { value: 'chime', label: 'Chime' },
  { value: 'soft', label: 'Soft' },
  { value: 'pulse', label: 'Pulse' },
];

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Reads stored preferences, falling back to the default for anything missing or malformed. */
export function resolveUiPrefs(raw: unknown): UiPrefs {
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const s = (r.sound && typeof r.sound === 'object' ? r.sound : {}) as Record<string, unknown>;
  const d = UI_PREF_DEFAULTS;
  const num = (v: unknown, min: number, max: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fallback);
  const time = (v: unknown) => (typeof v === 'string' && TIME.test(v) ? v : null);
  return {
    motion: MOTION_OPTIONS.some((o) => o.value === r.motion) ? (r.motion as MotionPref) : d.motion,
    fontSize: FONT_OPTIONS.some((o) => o.value === r.fontSize) ? (r.fontSize as FontSizePref) : d.fontSize,
    sound: {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : d.sound.enabled,
      style: SOUND_STYLE_OPTIONS.some((o) => o.value === s.style) ? (s.style as SoundStyle) : d.sound.style,
      volume: num(s.volume, 0, 100, d.sound.volume),
      cooldownSec: num(s.cooldownSec, 1, 300, d.sound.cooldownSec),
      quietFrom: time(s.quietFrom),
      quietTo: time(s.quietTo),
      quietAllowHigh: typeof s.quietAllowHigh === 'boolean' ? s.quietAllowHigh : d.sound.quietAllowHigh,
    },
  };
}

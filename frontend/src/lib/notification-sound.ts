import type { SoundPrefs, SoundStyle } from "@/lib/ui-preferences";

export type NotificationPriority = "low" | "normal" | "high";

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Whether `now` (on this device's clock) falls in the quiet window, which may run past midnight. */
export function inQuietHours(prefs: SoundPrefs, now: Date): boolean {
  if (!prefs.quietFrom || !prefs.quietTo) return false;
  const from = toMinutes(prefs.quietFrom);
  const to = toMinutes(prefs.quietTo);
  if (from === to) return false;
  const t = minutesOfDay(now);
  return from < to ? t >= from && t < to : t >= from || t < to;
}

/**
 * Whether a new notification may make a sound: the master switch, quiet hours (high priority may
 * be allowed through), and the cooldown that turns a burst of notifications into one sound.
 */
export function shouldPlay(prefs: SoundPrefs, priority: NotificationPriority, now: Date, lastPlayedAt: number | null): boolean {
  if (!prefs.enabled || prefs.volume <= 0) return false;
  if (inQuietHours(prefs, now) && !(prefs.quietAllowHigh && priority === "high")) return false;
  if (lastPlayedAt !== null && now.getTime() - lastPlayedAt < prefs.cooldownSec * 1000) return false;
  return true;
}

type AudioCtor = typeof AudioContext;
let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor: AudioCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
}

const TONES: Record<SoundStyle, { freq: number; at: number; len: number; type: OscillatorType }[]> = {
  chime: [
    { freq: 880, at: 0, len: 0.16, type: "sine" },
    { freq: 1320, at: 0.14, len: 0.28, type: "sine" },
  ],
  soft: [{ freq: 660, at: 0, len: 0.32, type: "triangle" }],
  pulse: [
    { freq: 520, at: 0, len: 0.09, type: "sine" },
    { freq: 520, at: 0.15, len: 0.09, type: "sine" },
    { freq: 520, at: 0.3, len: 0.09, type: "sine" },
  ],
};

/** Plays the sound with the browser's audio engine. Resolves false when audio is unavailable or blocked. */
export async function playNotificationSound(style: SoundStyle, volume: number): Promise<boolean> {
  const audio = context();
  if (!audio) return false;
  try {
    if (audio.state === "suspended") await audio.resume();
    if (audio.state !== "running") return false;
    const master = audio.createGain();
    master.gain.value = Math.max(0, Math.min(1, volume / 100)) * 0.3;
    master.connect(audio.destination);
    const start = audio.currentTime;
    for (const t of TONES[style]) {
      const osc = audio.createOscillator();
      const env = audio.createGain();
      osc.type = t.type;
      osc.frequency.value = t.freq;
      env.gain.setValueAtTime(0.0001, start + t.at);
      env.gain.exponentialRampToValueAtTime(1, start + t.at + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, start + t.at + t.len);
      osc.connect(env).connect(master);
      osc.start(start + t.at);
      osc.stop(start + t.at + t.len + 0.05);
    }
    return true;
  } catch {
    return false;
  }
}

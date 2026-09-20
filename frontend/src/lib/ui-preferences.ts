import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export type MotionPref = "normal" | "reduced" | "off";
export type FontSizePref = "default" | "large" | "xlarge";
export type SoundStyle = "chime" | "soft" | "pulse";

export interface SoundPrefs {
  enabled: boolean;
  style: SoundStyle;
  volume: number;
  cooldownSec: number;
  quietFrom: string | null;
  quietTo: string | null;
  quietAllowHigh: boolean;
}

export interface UiPrefs {
  motion: MotionPref;
  fontSize: FontSizePref;
  sound: SoundPrefs;
}

export function fetchUiPreferences(): Promise<UiPrefs> {
  return apiFetch<UiPrefs>("/settings/hub/preferences");
}

/**
 * The signed-in person's own interface preferences. The key sits under "settings-hub" on purpose:
 * saving any setting there already refetches everything under it, so a change made in Settings
 * reaches the whole app immediately.
 */
export function useUiPreferences(): UiPrefs | undefined {
  return useQuery({ queryKey: ["settings-hub", "preferences"], queryFn: fetchUiPreferences, staleTime: 5 * 60_000 }).data;
}

"use client";

import { useEffect } from "react";
import { useUiPreferences } from "@/lib/ui-preferences";

/** Applies the signed-in person's motion and text-size preferences to the whole app shell. */
export function UiPreferencesApplier() {
  const prefs = useUiPreferences();
  const motion = prefs?.motion ?? "normal";
  const font = prefs?.fontSize ?? "default";

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.nxMotion = motion;
    root.dataset.nxFont = font;
    return () => {
      delete root.dataset.nxMotion;
      delete root.dataset.nxFont;
    };
  }, [motion, font]);

  return null;
}

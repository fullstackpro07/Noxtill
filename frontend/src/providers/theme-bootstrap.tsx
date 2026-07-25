"use client";

import { useEffect } from "react";
import { useUiStore, applyDocumentPreferences } from "@/store/ui-store";

/** Applies persisted theme/locale to <html> on mount and whenever they change (FE-002 RTL flip+persist). */
export function ThemeBootstrap() {
  const theme = useUiStore((s) => s.theme);
  const localeCode = useUiStore((s) => s.localeCode);

  useEffect(() => {
    applyDocumentPreferences(theme, localeCode);

    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyDocumentPreferences(theme, localeCode);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme, localeCode]);

  return null;
}

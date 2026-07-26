"use client";

import { useUiStore } from "@/store/ui-store";
import { translate } from "@/lib/i18n";

export function useTranslation() {
  const localeCode = useUiStore((s) => s.localeCode);
  return {
    locale: localeCode,
    t: (key: string, vars?: Record<string, string | number>) => translate(localeCode, key, vars),
  };
}

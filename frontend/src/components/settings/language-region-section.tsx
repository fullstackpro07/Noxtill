"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsSectionHeader } from "./settings-section-header";
import { LOCALES } from "@/lib/locales";
import { useUiStore } from "@/store/ui-store";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/use-translation";
import { translate } from "@/lib/i18n";

/**
 * Changing language here uses the same store the top bar switcher does — it flips text everywhere live.
 * Layout direction is intentionally always left-to-right, including for Urdu/Arabic — only the words change.
 */
export function LanguageRegionSection() {
  const localeCode = useUiStore((s) => s.localeCode);
  const setLocale = useUiStore((s) => s.setLocale);
  const { t } = useTranslation();

  return (
    <div>
      <SettingsSectionHeader
        title={t("settings.section.language.label")}
        description={t("settings.section.language.description")}
      />

      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <p className="mb-3 text-sm font-medium text-fg">{t("settings.language.dashboardLanguage")}</p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {LOCALES.map((locale) => {
            const active = locale.code === localeCode;
            return (
              <button
                key={locale.code}
                type="button"
                onClick={() => setLocale(locale.code)}
                className={cn(
                  "flex items-center justify-between rounded-[var(--radius-sm)] border px-3.5 py-2.5 text-start text-sm transition-colors",
                  active ? "border-primary bg-primary/6 text-fg" : "border-border hover:bg-surface-2",
                )}
              >
                <span>
                  <span className="font-medium">{locale.nativeLabel}</span>
                  <span className="ms-1.5 text-xs text-fg-faint">{locale.label}</span>
                </span>
                {active && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
              </button>
            );
          })}
        </div>

        <div className="mt-6 border-t border-border pt-5">
          <p className="mb-3 text-sm font-medium text-fg">{t("settings.language.livePreview")}</p>
          <div className="rounded-[var(--radius-noxtill)] border border-border-strong bg-surface-2 p-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                N
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-fg">Sunset Hair Studio</p>
                <p className="truncate text-xs text-fg-faint">{translate(localeCode, "preview.dashboard")}</p>
              </div>
              <Button size="sm" variant="outline">
                {translate(localeCode, "preview.newBooking")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

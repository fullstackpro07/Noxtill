"use client";

import { Languages, Check } from "lucide-react";
import { DropdownMenu, DropdownTrigger, DropdownContent, DropdownItem } from "@/components/ui/dropdown-menu";
import { useUiStore } from "@/store/ui-store";
import { LOCALES, localeByCode } from "@/lib/locales";

/** RTL flip + persist (FE-002): flipping to Urdu/Arabic mirrors the whole shell live. */
export function LanguageSwitcher() {
  const localeCode = useUiStore((s) => s.localeCode);
  const setLocale = useUiStore((s) => s.setLocale);
  const current = localeByCode(localeCode);

  return (
    <DropdownMenu>
      <DropdownTrigger>
        <span
          className="flex h-9 items-center gap-1.5 rounded-full border border-border-strong px-3 text-xs font-medium text-fg-muted hover:bg-surface-2"
          title="Change language"
        >
          <Languages className="h-3.5 w-3.5" aria-hidden />
          {current.nativeLabel}
        </span>
      </DropdownTrigger>
      <DropdownContent>
        {LOCALES.map((locale) => (
          <DropdownItem
            key={locale.code}
            active={locale.code === localeCode}
            onSelect={() => setLocale(locale.code)}
          >
            <span className="flex-1">{locale.nativeLabel}</span>
            <span className="text-xs text-fg-faint">{locale.label}</span>
            {locale.code === localeCode && <Check className="h-3.5 w-3.5 text-primary" aria-hidden />}
          </DropdownItem>
        ))}
      </DropdownContent>
    </DropdownMenu>
  );
}

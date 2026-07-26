"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import { useTranslation } from "@/hooks/use-translation";

export function SettingsNav() {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <nav className="flex gap-1 overflow-x-auto pb-2 lg:w-56 lg:shrink-0 lg:flex-col lg:overflow-visible lg:pb-0">
      {SETTINGS_SECTIONS.map((section) => {
        const active = pathname === section.href;
        const Icon = section.icon;
        return (
          <Link
            key={section.key}
            href={section.href}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-full px-3.5 py-2 text-sm font-medium transition-colors lg:rounded-[var(--radius-sm)]",
              active
                ? section.danger
                  ? "bg-destructive/10 text-destructive"
                  : "bg-primary/8 text-primary"
                : section.danger
                  ? "text-destructive/70 hover:bg-destructive/6 hover:text-destructive"
                  : "text-fg-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="whitespace-nowrap">{t(section.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

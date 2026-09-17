"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav-items";
import { useTranslation } from "@/hooks/use-translation";

interface ModuleTab {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
}

/** Among tabs whose href exactly matches or prefixes the current path, the one with the longest
 * href wins — resolves overlapping routes (a module whose base href IS one child's route, while
 * another child's route is a nested sub-path of it, e.g. Deliveries' "/deliveries" vs
 * "/deliveries/all") to exactly one active tab, never zero or more than one. */
function activeTabIndex(pathname: string, tabs: ModuleTab[]): number {
  let bestIndex = -1;
  let bestLen = -1;
  tabs.forEach((tab, i) => {
    const matches = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
    if (matches && tab.href.length > bestLen) {
      bestLen = tab.href.length;
      bestIndex = i;
    }
  });
  return bestIndex;
}

/**
 * Generic in-page tab bar for a module's subscreens (v2 design fix-it) — replaces the sidebar
 * dropdown the v2 redesign removed, which had left every module's subscreens unreachable except
 * by typing the URL directly. Exact same visual style as `DashboardTabs`, generalized to any
 * module: `NAV_ITEMS` (the sidebar's own single source of truth) supplies the tab list, so a tab
 * bar and the sidebar can never drift out of sync. One `<ModuleTabs moduleKey="..."/>` per
 * module's route-segment `layout.tsx` applies it to that module's base page and every subscreen
 * automatically. If the module's own base href isn't already one of its children's routes, a
 * synthetic "Overview" tab is prepended pointing at it (matching how `DashboardTabs` treats
 * `/dashboard` itself); modules where the base route already *is* one of the listed children
 * (e.g. AI Assistant's `/assistant/help`) skip that synthetic tab.
 */
export interface ModuleTabBadge {
  count: number;
  /** Defaults to the danger tint; "warning" matches the design's amber open/pending pills. */
  tone?: "danger" | "warning";
}

export function ModuleTabs({ moduleKey, badges }: { moduleKey: string; badges?: Record<string, ModuleTabBadge> }) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const item = NAV_ITEMS.find((i) => i.key === moduleKey);
  if (!item?.children || item.children.length === 0) return null;

  const baseIsChild = item.children.some((c) => c.href === item.href);
  const tabs: ModuleTab[] = baseIsChild
    ? item.children.map((c) => ({ key: c.key, label: t(c.labelKey), href: c.href, icon: c.icon }))
    : [
        { key: "__overview", label: "Overview", href: item.href, icon: item.icon },
        ...item.children.map((c) => ({ key: c.key, label: t(c.labelKey), href: c.href, icon: c.icon })),
      ];

  const activeIndex = activeTabIndex(pathname, tabs);

  return (
    <div className="flex gap-0.5 overflow-x-auto px-[24px]" style={{ background: "var(--app-surface)", borderBottom: "1px solid var(--app-border)" }}>
      {tabs.map((tab, i) => {
        const active = i === activeIndex;
        const Icon = tab.icon;
        const badge = badges?.[tab.key];
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className="relative flex-none whitespace-nowrap px-3 pt-3 pb-[13px] text-[13px] font-semibold transition-colors flex items-center gap-1.5"
            style={{ color: active ? "var(--app-primary)" : "var(--app-text-muted)" }}
          >
            <Icon className="h-[15px] w-[15px]" aria-hidden />
            {tab.label}
            {!!badge && badge.count > 0 && (
              <span
                className="rounded-full px-[7px] py-px text-[10px] font-extrabold"
                style={{
                  background: badge.tone === "warning" ? "var(--app-warning-bg)" : "#FEE4E2",
                  color: badge.tone === "warning" ? "var(--app-warning-text)" : "var(--app-danger-strong)",
                }}
              >
                {badge.count}
              </span>
            )}
            {active && <span className="absolute inset-x-2 bottom-0 h-[2.5px] rounded-t-[3px]" style={{ background: "var(--app-primary)" }} />}
          </Link>
        );
      })}
    </div>
  );
}

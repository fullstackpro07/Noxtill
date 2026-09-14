"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Menu, Plus, Mail } from "lucide-react";
import { SearchTrigger } from "./search-trigger";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";
import { DataStatusPill } from "./data-status-pill";
import { NAV_ITEMS } from "@/lib/nav-items";
import type { Session } from "@/lib/session";
import { useTranslation } from "@/hooks/use-translation";

/** Page title matches whichever top-level nav item owns the current route (design's `<h1>Dashboard</h1>`
 * pattern) — falls back to the business name for routes with no sidebar entry (e.g. /settings/*). */
function usePageTitle(pathname: string, t: (key: string) => string): string {
  const match = NAV_ITEMS.filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)).sort((a, b) => b.href.length - a.href.length)[0];
  return match ? t(match.labelKey) : "Dashboard";
}

export function Topbar({ session, onMenuClick }: { session: Session; onMenuClick: () => void }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const pageTitle = usePageTitle(pathname, t);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const firstName = session.user.name.split(" ")[0];

  return (
    <header
      className="flex items-center gap-[18px] px-[24px] py-[14px]"
      style={{ background: "var(--app-surface)", borderBottom: "1px solid var(--app-border)" }}
    >
      <button
        type="button"
        onClick={onMenuClick}
        aria-label={t("topbar.openMenu")}
        className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] md:hidden"
        style={{ border: "1px solid var(--app-border)", color: "var(--app-text-faint)" }}
      >
        <Menu className="h-4 w-4" aria-hidden />
      </button>

      <div className="hidden min-w-0 shrink-0 flex-col sm:flex">
        <h1 className="truncate text-[23px] font-extrabold leading-tight tracking-[-.6px]" style={{ color: "var(--app-text)" }}>
          {pageTitle}
        </h1>
        <p className="mt-[3px] truncate text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>
          {greeting}, <strong className="font-semibold" style={{ color: "var(--app-text-muted)" }}>{firstName}</strong> — {dateLabel} · {session.business.name}
        </p>
      </div>

      <div className="hidden min-w-0 flex-1 sm:block">
        <SearchTrigger />
      </div>

      <div className="ms-auto flex shrink-0 items-center gap-2 sm:gap-2.5">
        <Link
          href="/sales"
          aria-label="Quick add"
          className="flex h-[34px] w-[34px] items-center justify-center rounded-full text-white transition-colors"
          style={{ background: "var(--app-primary)" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--app-primary-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--app-primary)")}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </Link>

        <Link
          href="/social/inbox"
          aria-label="Messages"
          className="hidden h-[34px] w-[34px] items-center justify-center rounded-[9px] sm:flex"
          style={{ border: "1px solid var(--app-border)", color: "var(--app-text-faint)" }}
        >
          <Mail className="h-4 w-4" aria-hidden />
        </Link>

        <DataStatusPill />

        <NotificationBellV2 />

        <div className="ms-1 h-6 w-px" style={{ background: "var(--app-border)" }} />
        <UserMenu user={session.user} />
      </div>
    </header>
  );
}

/** Thin visual wrapper around the existing real NotificationBell so its badge/dropdown logic is untouched. */
function NotificationBellV2() {
  return (
    <span className="[&_button]:!h-[34px] [&_button]:!w-[34px] [&_button]:!rounded-[9px] [&_button]:!border [&_svg]:!h-4 [&_svg]:!w-4">
      <NotificationBell />
    </span>
  );
}

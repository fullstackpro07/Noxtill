"use client";

import { Menu } from "lucide-react";
import { SearchTrigger } from "./search-trigger";
import { LanguageSwitcher } from "./language-switcher";
import { BranchSwitcher } from "./branch-switcher";
import { NotificationBell } from "./notification-bell";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import type { Session } from "@/lib/session";
import { useTranslation } from "@/hooks/use-translation";

export function Topbar({ session, onMenuClick }: { session: Session; onMenuClick: () => void }) {
  const { t } = useTranslation();
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label={t("topbar.openMenu")}
        className="flex h-9 w-9 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2 md:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      <div className="min-w-0 flex-1">
        <SearchTrigger />
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
        <div className="hidden sm:block">
          <BranchSwitcher branches={session.business.branches} />
        </div>
        <div className="hidden sm:block">
          <LanguageSwitcher />
        </div>
        <ThemeToggle />
        <NotificationBell />
        <div className="ms-1 h-6 w-px bg-border" />
        <UserMenu user={session.user} />
      </div>
    </header>
  );
}

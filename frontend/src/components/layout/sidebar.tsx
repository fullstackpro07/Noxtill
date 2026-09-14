"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { navItemsForRole, type Role } from "@/lib/nav-items";
import { useTranslation } from "@/hooks/use-translation";

interface SidebarProps {
  role: Role;
  businessName: string;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

function isRouteActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavList({ role, pathname, onNavigate }: { role: Role; pathname: string; onNavigate?: () => void }) {
  const { t } = useTranslation();
  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-2.5 pb-3.5" style={{ paddingTop: 0 }}>
      {navItemsForRole(role).map((item) => {
        const active = !item.disabled && isRouteActive(pathname, item.href);
        const Icon = item.icon;

        const divider = item.dividerBefore && <div className="my-[9px] mx-1.5 h-px" style={{ background: "var(--app-sidebar-border)" }} />;
        const sectionLabel = item.sectionLabel && (
          <div
            className="mx-2.5 mb-1.5 mt-3 text-[9.5px] font-extrabold uppercase tracking-[.6px]"
            style={{ color: "#5E7488" }}
          >
            {item.sectionLabel}
          </div>
        );

        if (item.disabled) {
          return (
            <div key={item.key}>
              {divider}
              {sectionLabel}
              <div
                className="flex cursor-not-allowed items-center gap-2.5 rounded-[9px] px-2.5 py-[9px] text-[13px] font-medium opacity-60"
                style={{ color: "var(--app-sidebar-fg)" }}
                aria-disabled
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
                <span
                  className="rounded-[5px] px-1.5 py-0.5 text-[9px] font-bold"
                  style={{ background: "var(--app-sidebar-hover)", color: "var(--app-sidebar-fg)" }}
                >
                  Soon
                </span>
              </div>
            </div>
          );
        }

        return (
          <div key={item.key}>
            {divider}
            {sectionLabel}
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex items-center gap-2.5 rounded-[9px] px-2.5 py-[9px] text-[13px] transition-colors",
                active ? "font-semibold" : "font-medium hover:text-white",
              )}
              style={{
                background: active ? "var(--app-primary)" : "transparent",
                color: active ? "var(--app-sidebar-fg-active)" : "var(--app-sidebar-fg)",
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.background = "var(--app-sidebar-hover)";
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.background = "transparent";
              }}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
              {item.isNew && (
                <span
                  className="rounded-[5px] px-[5px] py-[2px] text-[9px] font-bold"
                  style={{ background: "var(--app-new-badge-bg)", color: "var(--app-new-badge-fg)" }}
                >
                  New
                </span>
              )}
              {item.badge?.count !== undefined && (
                <span
                  className="rounded-full px-1.5 py-px text-[10px] font-bold text-white"
                  style={{ background: item.badge.color ?? "var(--app-orange)" }}
                >
                  {item.badge.count}
                </span>
              )}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5 px-[18px] pb-4 pt-5">
      <div
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] text-[17px] font-extrabold text-white"
        style={{ background: "linear-gradient(145deg, #16B85C, #0E8442)" }}
      >
        N
      </div>
      <span className="text-[19px] font-extrabold tracking-[-0.4px] text-white">Noxtill</span>
    </div>
  );
}

function HelpCard() {
  return (
    <div
      className="mx-3 mb-3.5 rounded-xl p-3.5"
      style={{ background: "var(--app-sidebar-card-bg)", border: "1px solid var(--app-sidebar-border)" }}
    >
      <div className="mb-1 text-[12.5px] font-bold text-white">Need Help?</div>
      <div className="mb-2.5 text-[11px] leading-relaxed" style={{ color: "var(--app-sidebar-fg)" }}>
        Visit our Help Center or chat with support.
      </div>
      <Link
        href="/assistant/help"
        className="block w-full rounded-lg py-2 text-center text-[11.5px] font-bold text-white transition-colors"
        style={{ background: "var(--app-primary)" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--app-primary-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "var(--app-primary)")}
      >
        Go to Help Center
      </Link>
    </div>
  );
}

/** Desktop: fixed 205px navy rail (v2 design). Mobile (<768px): slide-in drawer with backdrop. */
export function Sidebar({ role, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <>
      <aside
        className="hidden h-dvh min-h-0 w-[205px] shrink-0 flex-col md:flex"
        style={{ background: "var(--app-sidebar-bg)" }}
      >
        <Wordmark />
        <NavList role={role} pathname={pathname} />
        <HelpCard />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button aria-label={t("topbar.closeMenu")} className="absolute inset-0 bg-black/40" onClick={onMobileClose} />
          <div
            className="animate-sheet-in absolute inset-y-0 start-0 flex w-[80vw] max-w-[280px] flex-col shadow-[var(--shadow-lg)]"
            style={{ background: "var(--app-sidebar-bg)" }}
          >
            <div className="flex items-center justify-between">
              <Wordmark />
              <button
                aria-label={t("topbar.closeMenu")}
                onClick={onMobileClose}
                className="me-4 mt-4 flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10"
                style={{ color: "var(--app-sidebar-fg)" }}
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <NavList role={role} pathname={pathname} onNavigate={onMobileClose} />
            <HelpCard />
          </div>
        </div>
      )}
    </>
  );
}

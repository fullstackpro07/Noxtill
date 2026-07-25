"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { navItemsForRole, type Role } from "@/lib/nav-items";

interface SidebarProps {
  role: Role;
  businessName: string;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

function NavList({ role, pathname, onNavigate }: { role: Role; pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2">
      {navItemsForRole(role).map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.key}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-full px-3.5 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-fg-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            <Icon
              className={cn(
                "h-[18px] w-[18px] shrink-0",
                active ? "text-primary-foreground" : "text-fg-faint group-hover:text-fg-muted",
              )}
              aria-hidden
            />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function Wordmark({ businessName }: { businessName: string }) {
  return (
    <div className="flex items-center gap-2.5 px-5 pb-2 pt-5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-primary font-display text-sm font-bold text-primary-foreground">
        N
      </div>
      <div className="min-w-0">
        <p className="font-display text-sm font-bold leading-tight text-fg">Noxtill</p>
        <p className="truncate text-xs leading-tight text-fg-faint">{businessName}</p>
      </div>
    </div>
  );
}

/** Desktop: fixed 220px rail. Mobile (<768px): slide-in drawer with backdrop (FE-002). */
export function Sidebar({ role, businessName, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      <aside className="hidden w-[220px] shrink-0 flex-col border-e border-border bg-surface md:flex">
        <Wordmark businessName={businessName} />
        <NavList role={role} pathname={pathname} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={onMobileClose}
          />
          <div className="animate-sheet-in absolute inset-y-0 start-0 flex w-[80vw] max-w-[280px] flex-col bg-surface shadow-[var(--shadow-lg)]">
            <div className="flex items-center justify-between">
              <Wordmark businessName={businessName} />
              <button
                aria-label="Close menu"
                onClick={onMobileClose}
                className="me-4 mt-4 flex h-9 w-9 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <NavList role={role} pathname={pathname} onNavigate={onMobileClose} />
          </div>
        </div>
      )}
    </>
  );
}

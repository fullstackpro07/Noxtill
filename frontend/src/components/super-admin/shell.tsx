"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  BarChart3,
  Bot,
  Boxes,
  Building2,
  CreditCard,
  FileClock,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Plug,
  ShieldAlert,
  ShieldCheck,
  Users,
  UserCog,
  X,
  Layers,
} from "lucide-react";
import { useSuperAdminAuth } from "@/store/super-admin-auth-store";
import { saApi } from "@/lib/super-admin-api";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Activity;
  permission: string;
}

const NAV: { section: string; items: NavItem[] }[] = [
  { section: "Overview", items: [{ href: "/super-admin", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard.view" }] },
  {
    section: "Tenants",
    items: [
      { href: "/super-admin/businesses", label: "Businesses", icon: Building2, permission: "businesses.view" },
      { href: "/super-admin/users", label: "Users", icon: Users, permission: "users.view" },
    ],
  },
  {
    section: "Subscriptions",
    items: [
      { href: "/super-admin/subscriptions", label: "Subscriptions", icon: CreditCard, permission: "subscriptions.view" },
      { href: "/super-admin/plans", label: "Plans", icon: Layers, permission: "plans.view" },
    ],
  },
  {
    section: "Usage & access",
    items: [
      { href: "/super-admin/usage", label: "Usage & limits", icon: Gauge, permission: "limits.view" },
      { href: "/super-admin/modules", label: "Modules", icon: Boxes, permission: "modules.view" },
      { href: "/super-admin/ai", label: "AI credits", icon: Bot, permission: "ai.view" },
      { href: "/super-admin/communications", label: "Communications", icon: MessageSquare, permission: "communications.view" },
      { href: "/super-admin/integrations", label: "Integrations", icon: Plug, permission: "integrations.view" },
    ],
  },
  {
    section: "Monitoring",
    items: [
      { href: "/super-admin/activity", label: "Activity", icon: Activity, permission: "activity.view" },
      { href: "/super-admin/security", label: "Security", icon: ShieldAlert, permission: "security.view" },
    ],
  },
  {
    section: "Administration",
    items: [
      { href: "/super-admin/admin/users", label: "Admin users", icon: UserCog, permission: "admins.manage" },
      { href: "/super-admin/admin/roles", label: "Admin roles", icon: KeyRound, permission: "admins.manage" },
      { href: "/super-admin/admin/audit", label: "Audit log", icon: FileClock, permission: "audit.view" },
    ],
  },
];

function NavList({ permissions, onNavigate }: { permissions: string[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-2.5 pb-4" aria-label="Super Admin">
      {NAV.map((group) => {
        const items = group.items.filter((i) => permissions.includes(i.permission));
        if (!items.length) return null;
        return (
          <div key={group.section}>
            <div className="mx-2.5 mb-1.5 mt-3 text-[9.5px] font-extrabold uppercase tracking-[.6px]" style={{ color: "#5E7488" }}>
              {group.section}
            </div>
            {items.map((item) => {
              const active = item.href === "/super-admin" ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className="flex items-center gap-2.5 rounded-[9px] px-2.5 py-[8px] text-[13px] font-medium transition-colors hover:bg-[var(--app-sidebar-hover)]"
                  style={{
                    color: active ? "var(--app-sidebar-fg-active)" : "var(--app-sidebar-fg)",
                    background: active ? "var(--app-sidebar-hover)" : undefined,
                    fontWeight: active ? 700 : 500,
                  }}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-[18px] pb-3 pt-5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/noxtill-n.png" alt="" className="h-[26px] w-auto shrink-0" />
      <div className="leading-tight">
        <div className="text-[17px] font-extrabold tracking-[-0.4px] text-white">Noxtill</div>
        <div className="text-[10px] font-bold uppercase tracking-[.8px]" style={{ color: "var(--app-primary)" }}>
          Super Admin
        </div>
      </div>
    </div>
  );
}

/** Wraps every /super-admin page except the login screen: requires an admin session. */
export function SuperAdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { accessToken, admin, hasHydrated, clear } = useSuperAdminAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isLogin = pathname === "/super-admin/login";

  useEffect(() => {
    if (!isLogin && hasHydrated && !accessToken) router.replace("/super-admin/login");
  }, [isLogin, hasHydrated, accessToken, router]);

  if (isLogin) return <>{children}</>;
  if (!hasHydrated || !accessToken || !admin) {
    return (
      <div className="flex h-dvh items-center justify-center text-[13px]" style={{ color: "var(--app-text-faintest)" }}>
        Checking admin session…
      </div>
    );
  }

  async function signOut() {
    try {
      await saApi.logout();
    } catch {
      /* session may already be gone */
    }
    clear();
    router.replace("/super-admin/login");
  }

  const sidebar = (
    <>
      <Brand />
      <NavList permissions={admin.permissions} onNavigate={() => setMobileOpen(false)} />
      <div className="mx-3 mb-3.5 rounded-xl p-3" style={{ background: "var(--app-sidebar-card-bg)", border: "1px solid var(--app-sidebar-border)" }}>
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-white">
          <ShieldCheck className="h-3.5 w-3.5" style={{ color: "var(--app-primary)" }} aria-hidden /> Privileged session
        </div>
        <div className="mt-1 text-[10.5px] leading-relaxed" style={{ color: "var(--app-sidebar-fg)" }}>
          Every change is recorded in the audit log with your name and reason.
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-[var(--app-bg)]">
      <aside className="hidden h-dvh w-[220px] shrink-0 flex-col md:flex" style={{ background: "var(--app-sidebar-bg)" }}>
        {sidebar}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 start-0 flex w-[80vw] max-w-[280px] flex-col" style={{ background: "var(--app-sidebar-bg)" }}>
            <button aria-label="Close menu" className="absolute end-3 top-4 rounded-full p-2 text-white hover:bg-white/10" onClick={() => setMobileOpen(false)}>
              <X className="h-4 w-4" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[60px] shrink-0 items-center justify-between gap-3 border-b px-4 md:px-6" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
          <div className="flex items-center gap-2">
            <button className="rounded-lg p-2 md:hidden" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
              <Menu className="h-5 w-5" />
            </button>
            <BarChart3 className="hidden h-4 w-4 md:block" style={{ color: "var(--app-text-faintest)" }} aria-hidden />
            <span className="text-[13px] font-semibold" style={{ color: "var(--app-text-faint)" }}>
              Platform control center · all times UTC
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-end leading-tight sm:block">
              <div className="text-[13px] font-bold" style={{ color: "var(--app-text)" }}>
                {admin.name}
              </div>
              <div className="text-[11px]" style={{ color: "var(--app-text-faintest)" }}>
                {admin.roleName} · {admin.email}
              </div>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-bold"
              style={{ borderColor: "var(--app-border-strong)", color: "var(--app-text-muted)" }}
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden /> Sign out
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-4 py-5 md:px-7 md:py-6">{children}</main>
      </div>
    </div>
  );
}

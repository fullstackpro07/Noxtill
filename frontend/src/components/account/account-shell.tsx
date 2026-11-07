"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ApiError } from "@/lib/api-client";
import { useSession } from "@/lib/session";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { fetchUsageOverview } from "@/lib/usage-api";
import { U } from "@/components/usage/usage-ui";

export type AccountTab = "profile" | "team" | "plan" | "payment" | "invoices" | "notifications";

export const ACCOUNT_TABS: { k: AccountTab; label: string; icon: string; billing?: boolean }[] = [
  { k: "profile", label: "Business profile", icon: "M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16M9 21v-4h6v4M8.5 7h2M13.5 7h2M8.5 11h2M13.5 11h2" },
  { k: "team", label: "Team & roles", icon: "M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0M22 21v-2a4 4 0 0 0-3-3.87M16 3.3a4 4 0 0 1 0 7.4" },
  { k: "plan", label: "My plan & usage", icon: "M12 2 3 7l9 5 9-5ZM3 12l9 5 9-5M3 17l9 5 9-5", billing: true },
  { k: "payment", label: "Payment methods", icon: "M2 6h20v12H2zM2 10h20M6 15h4", billing: true },
  { k: "invoices", label: "Billing history", icon: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8ZM14 3v5h5M9 13h6M9 17h4", billing: true },
  { k: "notifications", label: "Notifications", icon: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" },
];

const SUB: Record<AccountTab, string> = {
  profile: "Your business details, used across receipts, invoices and listings.",
  team: "Who can access this workspace and what they can do.",
  plan: "Your Noxtill subscription, what it includes and what you have used.",
  payment: "Cards that pay for your Noxtill subscription.",
  invoices: "Invoices for your Noxtill subscription.",
  notifications: "Choose what Noxtill tells you about, and where.",
};

function TabIcon({ d }: { d: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/**
 * Whether the signed-in member may see billing. The server decides (billing.manage capability);
 * this asks it once instead of guessing from the role.
 */
export function useBillingAccess(): { allowed: boolean; loading: boolean } {
  const q = useQuery({
    queryKey: ["usage", "overview"],
    queryFn: fetchUsageOverview,
    retry: (n, e) => !(e instanceof ApiError && e.status === 403) && n < 2,
    staleTime: 30_000,
  });
  const forbidden = q.error instanceof ApiError && q.error.status === 403;
  return { allowed: !forbidden, loading: q.isLoading };
}

export function AccountShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const session = useSession();
  const tab = (pathname.match(/^\/settings\/account\/([^/?#]+)/)?.[1] ?? "plan") as AccountTab;
  const billing = useBillingAccess();
  const roleLabel = session.user.role.charAt(0).toUpperCase() + session.user.role.slice(1);

  useModuleHeader({
    title: "Settings",
    subtitle: SUB[tab] ?? SUB.plan,
  });

  const tabs = ACCOUNT_TABS.filter((t) => !t.billing || billing.allowed);

  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0, background: "#F4F6F8", minHeight: "100%" }}>
      <div role="tablist" aria-label="Settings sections" style={{ background: "#fff", borderBottom: `1px solid ${U.border}`, padding: "0 22px", display: "flex", gap: 2, overflowX: "auto", position: "sticky", top: 0, zIndex: 25 }}>
        {tabs.map((t) => {
          const on = t.k === tab;
          return (
            <Link
              key={t.k}
              href={`/settings/account/${t.k}`}
              role="tab"
              aria-selected={on}
              style={{ position: "relative", display: "flex", alignItems: "center", gap: 7, padding: "13px 12px 14px", fontSize: 13, fontWeight: on ? 700 : 600, color: on ? "var(--app-primary-hover)" : U.text3, whiteSpace: "nowrap", minHeight: 46, textDecoration: "none" }}
            >
              <TabIcon d={t.icon} />
              {t.label}
              <span style={{ position: "absolute", left: 8, right: 8, bottom: 0, height: 2.5, borderRadius: 3, background: on ? U.green : "transparent" }} />
            </Link>
          );
        })}
        {billing.allowed ? (
          <Link href="/settings/usage/overview" style={{ display: "flex", alignItems: "center", gap: 7, padding: "13px 12px 14px", fontSize: 13, fontWeight: 600, color: U.text3, whiteSpace: "nowrap", minHeight: 46, textDecoration: "none" }}>
            <TabIcon d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
            Usage &amp; Limits
          </Link>
        ) : null}
        <span style={{ marginLeft: "auto", alignSelf: "center", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: U.text3, border: `1px solid ${U.border}`, borderRadius: 20, padding: "6px 12px", whiteSpace: "nowrap" }}>Signed in as {roleLabel}</span>
          <Link href="/settings" style={{ fontSize: 11.5, fontWeight: 700, color: U.text3, border: `1px solid ${U.border}`, borderRadius: 20, padding: "6px 12px", whiteSpace: "nowrap", textDecoration: "none" }}>
            All settings
          </Link>
        </span>
      </div>
      <main style={{ flex: 1, padding: "18px 22px 30px", display: "flex", flexDirection: "column", gap: 16, minWidth: 0, maxWidth: 1180, width: "100%" }}>{children}</main>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useDashboardStore } from "@/store/dashboard-store";
import { useActionsOpenCount } from "@/hooks/use-actions-open-count";

const TABS = [
  { key: "overview", label: "Overview", href: "/dashboard" },
  { key: "health-score", label: "Business Health Score", href: "/dashboard/health-score" },
  { key: "today", label: "Today's Business", href: "/dashboard/today" },
  { key: "activity", label: "Live Activity", href: "/dashboard/activity" },
  { key: "insights", label: "AI Insights", href: "/dashboard/insights" },
  { key: "actions", label: "Action Center", href: "/dashboard/actions" },
  { key: "nightly-close", label: "Nightly Close", href: "/dashboard/nightly-close" },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/dashboard" ? pathname === "/dashboard" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Tab strip for the Dashboard module's 8 screens (v2 design) — 7 are real routes, "Customize
 * Dashboard" is a button that toggles the existing in-page customize mode rather than a route,
 * since that's how the working drag-to-reorder/save-layout flow already operates. */
export function DashboardTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const isCustomizing = useDashboardStore((s) => s.isCustomizing);
  const enterCustomize = useDashboardStore((s) => s.enterCustomize);
  const openActions = useActionsOpenCount();

  function handleCustomize() {
    enterCustomize();
    if (pathname !== "/dashboard") router.push("/dashboard");
  }

  return (
    <div
      className="flex gap-0.5 overflow-x-auto px-[24px]"
      style={{ background: "var(--app-surface)", borderBottom: "1px solid var(--app-border)" }}
    >
      {TABS.map((tab) => {
        const active = !isCustomizing && isActive(pathname, tab.href);
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className="relative flex-none whitespace-nowrap px-3 pt-3 pb-[13px] text-[13px] font-semibold transition-colors"
            style={{ color: active ? "var(--app-primary)" : "var(--app-text-muted)" }}
          >
            {tab.label}
            {tab.key === "actions" && openActions > 0 && (
              <span
                className="ms-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                style={{ background: "#FEE4E2", color: "#B42318" }}
              >
                {openActions}
              </span>
            )}
            {active && <span className="absolute inset-x-2 bottom-0 h-[2.5px] rounded-t-[3px]" style={{ background: "var(--app-primary)" }} />}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={handleCustomize}
        className="relative flex-none whitespace-nowrap px-3 pt-3 pb-[13px] text-[13px] font-semibold transition-colors"
        style={{ color: isCustomizing ? "var(--app-primary)" : "var(--app-text-muted)" }}
      >
        Customize Dashboard
        {isCustomizing && <span className="absolute inset-x-2 bottom-0 h-[2.5px] rounded-t-[3px]" style={{ background: "var(--app-primary)" }} />}
      </button>
    </div>
  );
}

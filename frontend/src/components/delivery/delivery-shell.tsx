"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { DeliveryPathIcon } from "./delivery-icon";
import { useDeliveryStore } from "./delivery-store";
import { fetchDispatchQueue } from "@/lib/delivery-overview-api";
import { fetchExceptions } from "@/lib/delivery-insights-api";
import { DeliveryOverlays } from "./delivery-overlays";
import { BranchSwitcher } from "@/components/layout/branch-switcher";
import { useAuthStore } from "@/store/auth-store";

interface TabDef {
  key: string;
  label: string;
  href: string;
  d: string;
}

const TABS: TabDef[] = [
  { key: "overview", label: "Overview", href: "/deliveries", d: "M3 3v16a2 2 0 0 0 2 2h16M7 14l3.5-4 3 2.5L20 7" },
  { key: "dispatch", label: "Live Dispatch", href: "/deliveries/dispatch", d: "m22 2-7 20-4-9-9-4Z" },
  { key: "deliveries", label: "Deliveries", href: "/deliveries/all", d: "M16 16h2a2 2 0 0 0 2-2v-3l-3-4h-3M2 6h11v10H9M9 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0M16 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0" },
  { key: "tracking", label: "Tracking", href: "/deliveries/tracking", d: "M20 10.5c0 6-8 11.5-8 11.5s-8-5.5-8-11.5a8 8 0 0 1 16 0ZM12 13.2a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2" },
  { key: "riders", label: "Riders", href: "/deliveries/riders", d: "M18.5 19a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M5.5 19a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M5.5 16.5h5l3-8h3M14 4h3l1 4M9 8.5h4" },
  { key: "rider360", label: "Rider 360", href: "/deliveries/rider", d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" },
  { key: "routes", label: "Routes", href: "/deliveries/routes", d: "M4 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4M20 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4M18 7H9a4 4 0 0 0 0 8h6a4 4 0 0 1 0 8H6" },
  { key: "exceptions", label: "Exceptions", href: "/deliveries/exceptions", d: "M12 9v5M12 17.5h.01M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" },
  { key: "pod", label: "Proof of Delivery", href: "/deliveries/pod", d: "M20 11c0 5-3.5 7.7-7.6 9.1a1.2 1.2 0 0 1-.8 0C7.5 18.7 4 16 4 11V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1ZM9.5 12l2 2 3.5-4" },
  { key: "zones", label: "Zones", href: "/deliveries/zones", d: "M9 20 3 17V4l6 3m0 13 6-3m-6 3V7m6 10 6 3V7l-6-3m0 13V4m0 0L9 7" },
  { key: "analytics", label: "Analytics", href: "/deliveries/analytics", d: "M3 3v16a2 2 0 0 0 2 2h16M7 16v-4M12 16V8M17 16v-6" },
  { key: "automations", label: "Automations", href: "/deliveries/automations", d: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M14 4v4M8 10v4M16 16v4" },
  { key: "settings", label: "Settings", href: "/deliveries/settings", d: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.7 8a1.7 1.7 0 0 0-.4-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V8a1.7 1.7 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" },
];

function activeTab(pathname: string): TabDef {
  if (pathname === "/deliveries") return TABS[0];
  const sorted = [...TABS.slice(1)].sort((a, b) => b.href.length - a.href.length);
  return sorted.find((t) => pathname.startsWith(t.href)) ?? TABS[0];
}

const SUBTITLES: Record<string, string> = {
  dispatch: "Assign riders and watch the road in one place",
  deliveries: "Every delivery, newest first",
  tracking: "What each customer currently sees",
  riders: "Your delivery roster, today",
  rider360: "One rider's real performance record",
  routes: "Suggested stop order per rider",
  exceptions: "Anything that did not go to plan",
  pod: "Every delivered order, and whether proof was captured",
  zones: "Fee, coverage and whether each zone pays for itself",
  analytics: "Real timing and on-time figures, honestly scoped",
  automations: "What would run, and what always waits for you",
  settings: "How dispatch behaves for this business",
};

export function DeliveryShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const tab = activeTab(pathname);
  const openModal = useDeliveryStore((s) => s.openModal);
  const flash = useDeliveryStore((s) => s.flash);

  const branches = useAuthStore((st) => st.business?.branches ?? []);
  const { data: queue, dataUpdatedAt } = useQuery({ queryKey: ["delivery-queue"], queryFn: fetchDispatchQueue, refetchInterval: 30000 });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  const ageSec = dataUpdatedAt ? Math.max(0, Math.round((now - dataUpdatedAt) / 1000)) : null;
  const fresh = ageSec === null ? "loading" : ageSec < 60 ? `updated ${ageSec} sec ago` : `updated ${Math.round(ageSec / 60)} min ago`;
  const { data: exceptions } = useQuery({ queryKey: ["delivery-exceptions"], queryFn: fetchExceptions, refetchInterval: 60000 });
  const openExceptions = exceptions?.kpis.find((k) => k.l === "Open")?.v;

  const actionsNode = useMemo(
    () => (
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <BranchSwitcher branches={branches} />
      <button
        onClick={() => openModal({ type: "fresh" })}
        title="Where this data comes from"
        style={{ display: "flex", alignItems: "center", gap: "7px", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "20px", padding: "8px 12px", fontSize: "11.5px", fontWeight: 700, color: "#0E8442", cursor: "pointer", minHeight: "38px", whiteSpace: "nowrap" }}
      >
        <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#12A150" }} />
        Live · {fresh}
      </button>
      <button
        onClick={() => {
          if (tab.key === "dispatch") {
            if (queue && queue.length > 0) openModal({ type: "assign", deliveryId: queue[0].i });
            else flash("Nothing is waiting for a rider right now.");
          } else if (tab.key === "riders") {
            openModal({ type: "add-rider" });
          } else {
            openModal({ type: "create-delivery" });
          }
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "7px",
          background: "#12A150",
          border: 0,
          borderRadius: "10px",
          padding: "9px 15px",
          fontSize: "12.5px",
          fontWeight: 800,
          color: "#fff",
          cursor: "pointer",
          minHeight: "38px",
          whiteSpace: "nowrap",
        }}
      >
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        {tab.key === "dispatch" ? "Assign rider" : tab.key === "riders" ? "Add rider" : "Create delivery"}
      </button>
      </div>
    ),
    [tab.key, queue, openModal, flash, branches, fresh],
  );

  useModuleHeader({
    title: tab.key === "overview" ? "Delivery & Riders" : tab.label,
    subtitle: SUBTITLES[tab.key] ?? "Part of Delivery & Riders",
    actions: actionsNode,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%", background: "#F4F6F8" }}>
      <div
        className="nx-scroll"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 25,
          background: "#fff",
          borderBottom: "1px solid #E6EAF0",
          padding: "0 22px",
          display: "flex",
          gap: "2px",
          overflowX: "auto",
        }}
      >
        {TABS.map((t) => {
          const on = t.key === tab.key;
          const badge = t.key === "dispatch" ? (queue ? String(queue.length) : "") : t.key === "exceptions" ? (openExceptions ?? "") : "";
          return (
            <Link
              key={t.key}
              href={t.href}
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: "7px",
                padding: "13px 12px 14px",
                fontSize: "12.5px",
                fontWeight: on ? 700 : 500,
                color: on ? "#0E8442" : "#475467",
                whiteSpace: "nowrap",
                minHeight: "46px",
                textDecoration: "none",
              }}
            >
              <DeliveryPathIcon d={t.d} size={15} />
              {t.label}
              {badge && badge !== "0" && (
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 800,
                    color: t.key === "dispatch" ? "#B42318" : "#B54708",
                    background: t.key === "dispatch" ? "#FEF3F2" : "#FEF6E7",
                    borderRadius: "20px",
                    padding: "1px 7px",
                  }}
                >
                  {badge}
                </span>
              )}
              <span style={{ position: "absolute", left: "8px", right: "8px", bottom: 0, height: "2.5px", borderRadius: "3px", background: on ? "#12A150" : "transparent" }} />
            </Link>
          );
        })}
      </div>

      <main style={{ flex: 1, padding: "16px 22px 26px", display: "flex", flexDirection: "column", gap: "15px", minWidth: 0 }}>{children}</main>

      <DeliveryOverlays />
    </div>
  );
}

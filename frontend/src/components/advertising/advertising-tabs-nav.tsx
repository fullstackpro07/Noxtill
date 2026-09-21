"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAdvertising } from "./advertising-context";

export const AD_TAB_DEFS: [string, string, string, string][] = [
  ["overview", "Overview", "M3 3v16a2 2 0 0 0 2 2h16M7 14l3.5-4 3 2.5L20 7", "/advertising"],
  ["campaigns", "Campaigns", "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4", "/advertising/campaigns"],
  ["builder", "Campaign Builder", "M12 5v14M5 12h14", "/advertising/builder"],
  ["audiences", "Ad Sets & Audiences", "M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0M22 21v-2a4 4 0 0 0-3-3.87", "/advertising/audiences"],
  ["creatives", "Ads & Creatives", "M3 4h18v13H3ZM3 21h18M8.8 9.5a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2M21 13l-4.5-4.5L5 17", "/advertising/creatives"],
  ["calendar", "Calendar & Schedule", "M19 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2ZM16 2v4M8 2v4M3 10h18", "/advertising/calendar"],
  ["leads", "Paid Leads", "M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0M19 8v6M16 11h6", "/advertising/leads"],
  ["experiments", "Experiments", "M9 2h6M10 2v6.5L4.6 18a2 2 0 0 0 1.7 3h11.4a2 2 0 0 0 1.7-3L14 8.5V2M7 15h10", "/advertising/experiments"],
  ["analytics", "Analytics & Attribution", "M3 3v16a2 2 0 0 0 2 2h16M7 16v-4M12 16V8M17 16v-6", "/advertising/analytics"],
  ["competitors", "Competitor Ads", "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12M12 2v3M12 19v3M2 12h3M19 12h3", "/advertising/competitors"],
  ["rules", "Optimisation & Rules", "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4", "/advertising/rules"],
  ["settings", "Advertising Settings", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.7 8a1.7 1.7 0 0 0-.4-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V8a1.7 1.7 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z", "/advertising/settings"],
];

export function AdvertisingTabsNav() {
  const pathname = usePathname();
  const { leads } = useAdvertising();

  const newLeadsCount = leads.filter(
    (l) => l.formData?.status === "New" || (l as any).st === "New"
  ).length;

  return (
    <div
      style={{
        background: "#fff",
        borderBottom: "1px solid #E6EAF0",
        padding: "0 22px",
        display: "flex",
        gap: 2,
        overflowX: "auto",
        position: "sticky",
        top: 0,
        zIndex: 25,
      }}
    >
      {AD_TAB_DEFS.map(([k, label, iconPath, route]) => {
        const isActive =
          route === "/advertising"
            ? pathname === "/advertising"
            : pathname.startsWith(route);

        let badge = "";
        if (k === "leads" && newLeadsCount > 0) badge = String(newLeadsCount);

        return (
          <Link
            key={k}
            href={route}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "13px 12px 14px",
              fontSize: 12.5,
              fontWeight: isActive ? 700 : 500,
              color: isActive ? "#0E8442" : "#475467",
              whiteSpace: "nowrap",
              minHeight: 46,
              textDecoration: "none",
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={iconPath} />
            </svg>
            {label}
            {badge && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: "#3538CD",
                  background: "#EEF4FF",
                  borderRadius: 20,
                  padding: "1px 7px",
                }}
              >
                {badge}
              </span>
            )}
            <span
              style={{
                position: "absolute",
                left: 8,
                right: 8,
                bottom: 0,
                height: 2.5,
                borderRadius: 3,
                background: isActive ? "#12A150" : "transparent",
              }}
            />
          </Link>
        );
      })}
    </div>
  );
}

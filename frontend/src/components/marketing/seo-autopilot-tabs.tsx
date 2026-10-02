"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** SEO Autopilot screens that exist today, in the spec's navigation order. */
export const SEO_TABS: { href: string; label: string }[] = [
  { href: "/marketing/seo-autopilot", label: "Overview & audit" },
  { href: "/marketing/seo-autopilot/keywords", label: "Keywords" },
  { href: "/marketing/seo-autopilot/on-page", label: "On-Page" },
  { href: "/marketing/seo-autopilot/technical", label: "Technical" },
  { href: "/marketing/seo-autopilot/content", label: "Content" },
  { href: "/marketing/seo-autopilot/local", label: "Local SEO" },
  { href: "/marketing/seo-autopilot/off-page", label: "Off-Page SEO" },
  { href: "/marketing/seo-autopilot/guest-posting", label: "Guest Posting" },
  { href: "/marketing/seo-autopilot/link-building", label: "Link Building" },
  { href: "/marketing/seo-autopilot/rank-tracking", label: "Rank tracking" },
  { href: "/marketing/seo-autopilot/content-calendar", label: "Content calendar" },
  { href: "/marketing/seo-autopilot/agent-workspace", label: "Agent workspace" },
  { href: "/marketing/seo-autopilot/reports", label: "Reports" },
  { href: "/marketing/seo-autopilot/competitor-seo", label: "Competitor SEO" },
];

export function SeoAutopilotTabs() {
  const pathname = usePathname();
  const active = [...SEO_TABS]
    .sort((a, b) => b.href.length - a.href.length)
    .find(
      (tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`),
    );
  return (
    <nav
      aria-label="SEO Autopilot"
      className="flex gap-1 overflow-x-auto border-b px-5 md:px-7"
      style={{ borderColor: "var(--app-border)" }}
    >
      {SEO_TABS.map((tab) => {
        const current = tab.href === active?.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={current ? "page" : undefined}
            className="whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-semibold"
            style={{
              borderColor: current ? "var(--app-primary)" : "transparent",
              color: current ? "var(--app-text)" : "var(--app-text-faint)",
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

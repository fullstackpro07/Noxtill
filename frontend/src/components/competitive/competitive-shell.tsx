"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { rangeSince, relTime } from "@/lib/competitive-insights";
import { useCompetitiveData } from "./competitive-data";
import { useCompetitiveUi } from "./competitive-store";
import { CompetitiveDrawers } from "./competitive-drawers";
import { CompetitiveModals } from "./competitive-modals";

interface Tab {
  key: string;
  label: string;
  href: string;
  /** SVG path data copied from the design. */
  path: string;
  title: string;
  subtitle: string;
}

const TABS: Tab[] = [
  {
    key: "overview",
    label: "Overview",
    href: "/competitive",
    path: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12M12 2v3M12 19v3M2 12h3M19 12h3",
    title: "Competitive Insights",
    subtitle: "",
  },
  {
    key: "competitors",
    label: "Competitors",
    href: "/competitive/competitors",
    path: "M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01",
    title: "Competitors",
    subtitle: "Who you are watching, and how closely",
  },
  {
    key: "profile",
    label: "Competitor Profile",
    href: "/competitive/profile",
    path: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
    title: "Competitor Profile",
    subtitle: "Everything publicly visible about one competitor",
  },
  {
    key: "compare",
    label: "Product & Service Comparison",
    href: "/competitive/compare",
    path: "M16 3h5v5M21 3l-7 7M8 21H3v-5M3 21l7-7",
    title: "Product & Service Comparison",
    subtitle: "Your products and services against theirs",
  },
  {
    key: "pricing",
    label: "Pricing & Offers",
    href: "/competitive/pricing",
    path: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM14 9.5A2.6 2.6 0 0 0 11.5 8c-1.6 0-2.6.9-2.6 2s1 1.9 2.6 2.2c1.6.3 2.6.9 2.6 2s-1 2-2.6 2A2.7 2.7 0 0 1 9 14.6M12 6.5v11",
    title: "Pricing & Offers",
    subtitle: "Observed prices and public offers",
  },
  {
    key: "social",
    label: "Social & Content",
    href: "/competitive/social",
    path: "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6M8.6 13.5l6.8 4M15.4 6.5l-6.8 4",
    title: "Social & Content",
    subtitle: "Public Instagram posting — yours and theirs",
  },
  {
    key: "ads",
    label: "Advertising",
    href: "/competitive/ads",
    path: "M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1M17.5 8.5a5 5 0 0 1 0 7M20.5 5.5a9 9 0 0 1 0 13",
    title: "Advertising Intelligence",
    subtitle: "Ads visible in the public Meta Ad Library",
  },
  {
    key: "reputation",
    label: "Reputation",
    href: "/competitive/reputation",
    path: "m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.4l6-.8Z",
    title: "Reputation",
    subtitle: "Public ratings and what reviewers mention",
  },
  {
    key: "trends",
    label: "Trends & Opportunities",
    href: "/competitive/trends",
    path: "m22 7-8.5 8.5-5-5L2 17M16 7h6v6",
    title: "Trends & Opportunities",
    subtitle: "Patterns across the market, and what to do",
  },
  {
    key: "settings",
    label: "Settings",
    href: "/competitive/settings",
    path: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.7 8a1.7 1.7 0 0 0-.4-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V8a1.7 1.7 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z",
    title: "Competitive Settings",
    subtitle: "What is watched, how often, and who hears about it",
  },
];

function activeTab(pathname: string): Tab {
  if (pathname === "/competitive") return TABS[0];
  return TABS.slice(1).find((t) => pathname.startsWith(t.href)) ?? TABS[0];
}

export function CompetitiveShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const tab = activeTab(pathname);
  const { competitors, events, lastChecked, now, input } = useCompetitiveData();
  const range = useCompetitiveUi((s) => s.range);
  const openModal = useCompetitiveUi((s) => s.openModal);

  const changesInRange = useMemo(() => {
    const since = rangeSince(range, input.now);
    return events.filter((e) => e.at >= since).length;
  }, [events, range, input.now]);

  const subtitle =
    tab.key === "overview"
      ? `${competitors.length} competitor${competitors.length === 1 ? "" : "s"} watched · public sources only`
      : tab.subtitle;
  const checked = lastChecked ? `Checked ${relTime(lastChecked, now)}` : "Not checked yet";
  const dot = lastChecked ? "#12A150" : "#98A2B3";

  const actions = useMemo(
    () => (
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => openModal({ type: "fresh" })}
          className="hidden min-h-[44px] cursor-pointer items-center gap-[7px] rounded-[20px] border border-[#E6EAF0] bg-white px-[13px] py-[9px] text-[11.5px] font-bold text-[#475467] transition-colors hover:border-[#12A150] hover:text-[#0E8442] md:flex"
        >
          <span className="h-[7px] w-[7px] rounded-full" style={{ background: dot }} />
          {checked}
        </button>
        <button
          type="button"
          onClick={() => openModal({ type: "add" })}
          className="flex min-h-[44px] cursor-pointer items-center gap-[7px] rounded-[10px] border-0 bg-[#12A150] px-4 py-2.5 text-[12.5px] font-extrabold text-white transition-colors hover:bg-[#0E8442]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add competitor
        </button>
      </div>
    ),
    [checked, dot, openModal],
  );

  useModuleHeader({ title: tab.title, subtitle, actions });

  return (
    <div className="flex min-h-full flex-col bg-[#F4F6F8]">
      <div className="sticky top-0 z-[25] flex gap-0.5 overflow-x-auto border-b border-[#E6EAF0] bg-white px-[22px]">
        {TABS.map((t) => {
          const active = t.key === tab.key;
          return (
            <Link
              key={t.key}
              href={t.href}
              className={`relative flex min-h-[46px] flex-none items-center gap-[7px] whitespace-nowrap px-3 pb-3.5 pt-[13px] text-[12.5px] transition-colors hover:text-[#0E8442] ${
                active ? "font-bold text-[#0E8442]" : "font-medium text-[#475467]"
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={t.path} />
              </svg>
              {t.label}
              {t.key === "overview" && changesInRange > 0 ? (
                <span className="rounded-[20px] bg-[#FEF6E7] px-[7px] py-px text-[10px] font-extrabold text-[#B54708]">{changesInRange}</span>
              ) : null}
              <span className="absolute inset-x-2 bottom-0 h-[2.5px] rounded-[3px]" style={{ background: active ? "#12A150" : "transparent" }} />
            </Link>
          );
        })}
      </div>

      <main className="flex min-w-0 flex-1 flex-col gap-[15px] px-[22px] pb-[26px] pt-4">{children}</main>

      <CompetitiveDrawers />
      <CompetitiveModals />
    </div>
  );
}

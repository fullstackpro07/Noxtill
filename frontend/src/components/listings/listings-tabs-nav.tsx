"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MapPin,
  FileCheck2,
  Contact,
  RefreshCw,
  FileText,
  Images,
  SearchCheck,
  Star,
  Radar,
  Settings2,
} from "lucide-react";
import { useListings } from "./listings-context";

interface TabItem {
  key: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  count?: string | number;
}

export function ListingsTabsNav() {
  const pathname = usePathname();
  const { listings, branches, rollupSummary, competitors } = useListings();

  const seoIssueCount = listings.filter(
    (l) => l.mismatchedFields.length > 0 || l.status === "Disconnected"
  ).length;

  const tabs: TabItem[] = [
    {
      key: "overview",
      label: "Overview",
      href: "/listings",
      icon: MapPin,
    },
    {
      key: "all",
      label: "All Listings",
      href: "/listings/all",
      icon: FileCheck2,
      count: listings.length,
    },
    {
      key: "profile",
      label: "Business Profile",
      href: "/listings/profile",
      icon: Contact,
    },
    {
      key: "locations",
      label: "Locations",
      href: "/listings/locations",
      icon: MapPin,
      count: branches.length,
    },
    {
      key: "sync",
      label: "Sync & Health",
      href: "/listings/sync",
      icon: RefreshCw,
      count: rollupSummary?.mismatchCount ?? 0,
    },
    {
      key: "posts",
      label: "Posts & Updates",
      href: "/listings/posts",
      icon: FileText,
    },
    {
      key: "photos",
      label: "Photos & Media",
      href: "/listings/photos",
      icon: Images,
    },
    {
      key: "seo",
      label: "Local SEO",
      href: "/listings/local-seo",
      icon: SearchCheck,
      count: seoIssueCount,
    },
    {
      key: "reviews",
      label: "Reviews",
      href: "/listings/reviews",
      icon: Star,
    },
    {
      key: "competitors",
      label: "Competitors",
      href: "/listings/competitors",
      icon: Radar,
      count: competitors.length,
    },
    {
      key: "settings",
      label: "Settings",
      href: "/listings/settings",
      icon: Settings2,
    },
  ];

  return (
    <div className="sticky top-0 z-30 flex w-full items-center gap-1 overflow-x-auto border-b border-[#EEF0F3] bg-white/95 px-6 backdrop-blur-md transition-all">
      {tabs.map((tab) => {
        const isActive =
          tab.href === "/listings"
            ? pathname === "/listings"
            : pathname.startsWith(tab.href);

        const Icon = tab.icon;

        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={`flex flex-shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-[13px] font-semibold transition-colors ${
              isActive
                ? "border-[#16A34A] text-[#0F172A] font-bold"
                : "border-transparent text-[#5B6675] hover:text-[#0F172A]"
            }`}
          >
            <Icon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-bold ${
                  isActive
                    ? "bg-[#DCFCE7] text-[#15803D]"
                    : "bg-[#F1F3F6] text-[#5B6675]"
                }`}
              >
                {tab.count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

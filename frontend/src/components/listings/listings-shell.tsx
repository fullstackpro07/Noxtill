"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  MapPin,
  ChevronDown,
  Globe,
  HeartPulse,
  Plus,
  Sparkles,
} from "lucide-react";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { useListings } from "./listings-context";
import { ListingsTabsNav } from "./listings-tabs-nav";
import { ListingsModals } from "./listings-modals";

const screenTitles: Record<string, string> = {
  "/listings": "Listings Overview",
  "/listings/all": "All Listings",
  "/listings/profile": "Business Profile",
  "/listings/locations": "Locations",
  "/listings/sync": "Listing Sync & Health",
  "/listings/posts": "Posts & Updates",
  "/listings/photos": "Photos & Media",
  "/listings/local-seo": "Local SEO",
  "/listings/reviews": "Reviews Connection",
  "/listings/competitors": "Competitors",
  "/listings/settings": "Business Listings Settings",
};

export function ListingsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    location,
    platform,
    cycleLocation,
    cyclePlatform,
    openPanel,
    askAI,
    rollupSummary,
    liveStatuses,
  } = useListings();

  const needsAttentionCount = (rollupSummary?.needsAttention ?? 0) + (rollupSummary?.disconnected ?? 0);
  const healthLabel = rollupSummary == null ? "Loading…" : needsAttentionCount === 0 ? "Healthy" : "Needs attention";

  const currentTitle = screenTitles[pathname] || "Business Listings";

  useModuleHeader({
    title: currentTitle,
    subtitle: "Business Listings · local presence",
    search: (
      <div className="relative flex items-center">
        <input
          type="text"
          placeholder="Ask — “which listings need attention?”"
          onClick={() => askAI("attention")}
          readOnly
          className="h-[34px] w-[260px] rounded-full border border-[#E1E5EB] bg-[#F8FAFC] pl-8 pr-3 text-[12px] text-[#0F172A] placeholder:text-[#94A3B8] cursor-pointer hover:border-[#CBD5E1] transition-colors"
        />
        <Sparkles className="absolute left-2.5 h-3.5 w-3.5 text-[#0066FF]" />
      </div>
    ),
    actions: (
      <div className="flex flex-wrap items-center gap-2">
        {/* Location Picker Pill */}
        <button
          onClick={cycleLocation}
          className="inline-flex h-[34px] items-center gap-1.5 rounded-full border border-[#E1E5EB] bg-[#F1F3F6] px-3 text-[12.5px] font-bold text-[#45505F] transition-colors hover:bg-[#E6E8EC]"
        >
          <MapPin className="h-3.5 w-3.5" />
          <span className="whitespace-nowrap">{location}</span>
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>

        {/* Platform Picker Pill */}
        <button
          onClick={cyclePlatform}
          className="inline-flex h-[34px] items-center gap-1.5 rounded-full border border-[#C7DBFE] bg-[#EFF6FF] px-3 text-[12.5px] font-bold text-[#1D4ED8] transition-colors hover:bg-[#DBEAFE]"
        >
          <Globe className="h-3.5 w-3.5" />
          <span className="whitespace-nowrap">{platform}</span>
        </button>

        {/* Health Score Pill — real counts from the rollup summary */}
        <button
          onClick={() =>
            openPanel({
              kicker: "Listing health",
              title: needsAttentionCount === 0 ? "All listings healthy" : `Needs attention · ${needsAttentionCount} issue${needsAttentionCount === 1 ? "" : "s"}`,
              badge: `Across ${rollupSummary?.totalListings ?? 0} listings`,
              badgeTone: needsAttentionCount === 0 ? "green" : "amber",
              rows: [
                ["Connected", `${rollupSummary?.connected ?? 0} listings`],
                ["Needs attention", `${rollupSummary?.needsAttention ?? 0} listings`, (rollupSummary?.needsAttention ?? 0) > 0 ? "neg" : "pos"],
                ["Disconnected", `${rollupSummary?.disconnected ?? 0} listings`, (rollupSummary?.disconnected ?? 0) > 0 ? "neg" : "pos"],
                ["Not connected", `${rollupSummary?.notConnected ?? 0} locations`],
                ["Field mismatches", `${rollupSummary?.mismatchCount ?? 0}`, (rollupSummary?.mismatchCount ?? 0) > 0 ? "neg" : "pos"],
                ["Locations without a Master Record", `${rollupSummary?.branchesWithoutMasterListing ?? 0}`, (rollupSummary?.branchesWithoutMasterListing ?? 0) > 0 ? "neg" : "pos"],
                ["Average completeness", rollupSummary?.averageCompleteness != null ? `${rollupSummary.averageCompleteness}%` : "—"],
              ],
              bulletsTitle: "How health is measured",
              bullets: [
                "Connection status, field mismatches against the last sync, and profile completeness — each a real check, not a weighted guess",
                "There is no duplicate-listing detection in Noxtill today, so that is never counted here",
                "A disconnected listing shows as unavailable rather than carrying its last known score forward",
                "Every issue links to the exact field on the exact platform",
              ],
              note: "Health is explainable by design — there is no black-box score anywhere in this module.",
              primary: "Open all listings",
              secondary: "Close",
              onPrimary: () => router.push("/listings/all"),
            })
          }
          className={`inline-flex h-[34px] items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-bold transition-colors ${
            needsAttentionCount === 0
              ? "border-[#BBF0CB] bg-[#ECFDF3] text-[#15803D] hover:bg-[#D8F5E3]"
              : "border-[#FDE49B] bg-[#FFFBEB] text-[#B45309] hover:bg-[#FEF3C7]"
          }`}
        >
          <HeartPulse className="h-3.5 w-3.5" />
          <span className="whitespace-nowrap">Listing health: {healthLabel}</span>
        </button>

        {/* Add listing action button — real connection status per directory */}
        <button
          onClick={() =>
            openPanel({
              kicker: "Add listing",
              title: "Connect a business listing",
              badge: "Only real platforms",
              badgeTone: "neutral",
              rows: [
                ["Google Business Profile", liveStatuses?.gmb === "connected" ? "Connected" : "Not connected"],
                ["Bing Places", liveStatuses?.bing_places === "connected" ? "Connected" : "Not connected"],
                ["Apple Business Connect", liveStatuses?.apple_business_connect === "connected" ? "Connected" : "Not connected"],
                ["Yelp", liveStatuses?.yelp === "connected" ? "Connected" : "Not connected"],
                ["Other directories", "Not integrated"],
                ["Verification", "Handled by the platform, not Noxtill"],
              ],
              bulletsTitle: "What connecting does",
              bullets: [
                "Noxtill reads the listing and compares it against your Master Record",
                "It does not write anything until you approve a sync",
                "Verification is the platform's process — Noxtill cannot verify a listing on your behalf",
                "A platform that is not integrated is not offered, rather than shown as coming soon",
              ],
              note: "Connect a specific location's listing from that row in All Listings — this panel only shows what's available.",
              primary: "Open all listings",
              secondary: "Cancel",
              onPrimary: () => router.push("/listings/all"),
            })
          }
          className="inline-flex h-[34px] items-center gap-1.5 rounded-lg bg-[#16A34A] px-3 text-[12.5px] font-bold text-white transition-colors hover:bg-[#15803D]"
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="whitespace-nowrap">Add listing</span>
        </button>
      </div>
    ),
  });

  return (
    <div className="flex min-h-screen flex-col bg-[#F5F6F8]">
      {/* 11 Subheader Tabs Bar */}
      <ListingsTabsNav />

      {/* Screen Content Container */}
      <main className="w-full max-w-[1680px] p-6 lg:px-8 space-y-6">
        {children}
      </main>

      {/* Overlays: Workspace Drawer, Detail Panel, Modal, Toast */}
      <ListingsModals />
    </div>
  );
}

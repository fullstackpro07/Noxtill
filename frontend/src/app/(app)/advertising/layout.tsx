"use client";

import React, { type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useModuleHeader } from "@/components/layout/module-header-context";
import {
  AdvertisingProvider,
  useAdvertising,
} from "@/components/advertising/advertising-context";
import { AdvertisingTabsNav } from "@/components/advertising/advertising-tabs-nav";
import { AdvertisingDrawers } from "@/components/advertising/advertising-drawers";
import { AdvertisingModals } from "@/components/advertising/advertising-modals";
import { AdvertisingToast } from "@/components/advertising/advertising-toast";

function AdvertisingHeaderBinder() {
  const router = useRouter();
  const {
    accountFilter,
    setAccountFilter,
  } = useAdvertising();

  useModuleHeader({
    title: (
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.6px", color: "#0F172A" }}>
          Advertising
        </span>
      </div>
    ),
    subtitle: (
      <span style={{ fontSize: 12, color: "#667085" }}>
        Unified cross-platform advertising · spend billed by each platform to your account
      </span>
    ),
    actions: (
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <select
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
          aria-label="Ad account"
          style={{
            border: "1px solid #E6EAF0",
            borderRadius: 10,
            padding: "10px 12px",
            fontSize: 12.5,
            fontWeight: 600,
            color: "#344054",
            background: "#fff",
            minHeight: 44,
          }}
        >
          <option value="All ad accounts">All ad accounts</option>
          <option value="Meta Ads">Meta Ads</option>
          <option value="Google Ads">Google Ads</option>
          <option value="TikTok Ads">TikTok Ads</option>
          <option value="LinkedIn Ads">LinkedIn Ads</option>
        </select>
        <button
          type="button"
          onClick={() => router.push("/advertising/builder")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            background: "#12A150",
            border: 0,
            borderRadius: 10,
            padding: "10px 16px",
            fontSize: 12.5,
            fontWeight: 800,
            color: "#fff",
            cursor: "pointer",
            minHeight: 44,
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Create campaign
        </button>
      </div>
    ),
  });

  return null;
}

function AdvertisingLayoutInner({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%", background: "#F4F6F8" }}>
      <style>{`
        @keyframes nxin { from { opacity: 0; transform: translateY(-6px) scale(.985); } to { opacity: 1; transform: none; } }
        @keyframes nxslide { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }
        @keyframes nxpulse { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }
        @media(max-width: 1100px) { [data-r2] { grid-template-columns: minmax(0, 1fr) !important; } }
        @media(max-width: 900px) {
          [data-drawer] { width: 100% !important; border-radius: 18px 18px 0 0 !important; top: auto !important; height: 88% !important; }
        }
        @media(max-width: 620px) { [data-kpi] { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; } }
      `}</style>
      <AdvertisingHeaderBinder />
      <AdvertisingTabsNav />
      <main
        style={{
          flex: 1,
          padding: "16px 22px 26px",
          display: "flex",
          flexDirection: "column",
          gap: 15,
          minWidth: 0,
        }}
      >
        {children}
      </main>
      <AdvertisingDrawers />
      <AdvertisingModals />
      <AdvertisingToast />
    </div>
  );
}

export default function AdvertisingLayout({ children }: { children: ReactNode }) {
  return (
    <AdvertisingProvider>
      <AdvertisingLayoutInner>{children}</AdvertisingLayoutInner>
    </AdvertisingProvider>
  );
}

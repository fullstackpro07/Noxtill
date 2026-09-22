"use client";

import React, { type ReactNode } from "react";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { SocialProvider, useSocial } from "@/components/social/social-context";
import { SocialTabsNav } from "@/components/social/social-tabs-nav";
import { SocialDrawers } from "@/components/social/social-drawers";
import { SocialModals } from "@/components/social/social-modals";
import { SocialToast } from "@/components/social/social-toast";

function SocialHeaderBinder() {
  const { headerTitle, headerSub, account, setAccount, openDrawer } = useSocial();

  useModuleHeader({
    title: (
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.6px", color: "#0F172A" }}>{headerTitle}</span>
      </div>
    ),
    subtitle: <span style={{ fontSize: 12, color: "#667085" }}>{headerSub}</span>,
    actions: (
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <select
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          aria-label="Account"
          style={{ border: "1px solid #E6EAF0", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, fontWeight: 600, color: "#344054", background: "#fff", minHeight: 44 }}
        >
          <option value="All accounts">All channels</option>
          <option value="Instagram">Instagram</option>
          <option value="Facebook">Facebook</option>
          <option value="TikTok">TikTok</option>
          <option value="LinkedIn">LinkedIn</option>
          <option value="X (Twitter)">X (Twitter)</option>
          <option value="YouTube">YouTube</option>
        </select>
        <button
          onClick={() => openDrawer("composer")}
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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Create post
        </button>
      </div>
    ),
  });

  return null;
}

function SocialLayoutInner({ children }: { children: ReactNode }) {
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
      <SocialHeaderBinder />
      <SocialTabsNav />
      <main style={{ flex: 1, padding: "16px 22px 26px", display: "flex", flexDirection: "column", gap: 15, minWidth: 0 }}>
        {children}
      </main>
      <SocialDrawers />
      <SocialModals />
      <SocialToast />
    </div>
  );
}

export default function SocialLayout({ children }: { children: ReactNode }) {
  return (
    <SocialProvider>
      <SocialLayoutInner>{children}</SocialLayoutInner>
    </SocialProvider>
  );
}

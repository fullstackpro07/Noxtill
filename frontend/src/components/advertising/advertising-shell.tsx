"use client";

import React, { useState } from "react";
import { useAdvertising, type ScreenType } from "./advertising-context";
import { OverviewScreen } from "./screens/overview-screen";
import { CampaignsScreen } from "./screens/campaigns-screen";
import { BuilderScreen } from "./screens/builder-screen";
import { AudiencesScreen } from "./screens/audiences-screen";
import { CreativesScreen } from "./screens/creatives-screen";
import { CalendarScreen } from "./screens/calendar-screen";
import { LeadsScreen } from "./screens/leads-screen";
import { ExperimentsScreen } from "./screens/experiments-screen";
import { AnalyticsScreen } from "./screens/analytics-screen";
import { CompetitorsScreen } from "./screens/competitors-screen";
import { RulesScreen } from "./screens/rules-screen";
import { SettingsScreen } from "./screens/settings-screen";
import { AdvertisingDrawers } from "./advertising-drawers";
import { AdvertisingModals } from "./advertising-modals";

interface TabItem {
  k: ScreenType;
  label: string;
  icon: string;
}

const TABS: TabItem[] = [
  { k: "overview", label: "Overview", icon: "M3 3v16a2 2 0 0 0 2 2h16M7 14l3.5-4 3 2.5L20 7" },
  { k: "campaigns", label: "Campaigns", icon: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4" },
  { k: "builder", label: "Campaign Builder", icon: "M12 5v14M5 12h14" },
  { k: "audiences", label: "Ad Sets & Audiences", icon: "M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0M22 21v-2a4 4 0 0 0-3-3.87" },
  { k: "creatives", label: "Ads & Creatives", icon: "M3 4h18v13H3ZM3 21h18M8.8 9.5a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2M21 13l-4.5-4.5L5 17" },
  { k: "calendar", label: "Calendar & Schedule", icon: "M19 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2ZM16 2v4M8 2v4M3 10h18" },
  { k: "leads", label: "Leads", icon: "M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0M19 8v6M16 11h6" },
  { k: "experiments", label: "Experiments", icon: "M9 2h6M10 2v6.5L4.6 18a2 2 0 0 0 1.7 3h11.4a2 2 0 0 0 1.7-3L14 8.5V2M7 15h10" },
  { k: "analytics", label: "Analytics & Attribution", icon: "M3 3v16a2 2 0 0 0 2 2h16M7 16v-4M12 16V8M17 16v-6" },
  { k: "competitors", label: "Competitor Ads", icon: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12M12 2v3M12 19v3M2 12h3M19 12h3" },
  { k: "rules", label: "Optimisation & Rules", icon: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4" },
  { k: "settings", label: "Advertising Settings", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.7 8a1.7 1.7 0 0 0-.4-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V8a1.7 1.7 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" },
];

const HEADER_INFO: Record<ScreenType, { title: string; sub: string }> = {
  overview: {
    title: "Advertising",
    sub: "Unified cross-platform advertising · spend billed by each platform to your account",
  },
  campaigns: {
    title: "Campaigns",
    sub: "Every paid campaign across connected platforms",
  },
  builder: {
    title: "Campaign Builder",
    sub: "Build from your own product, stock and review data",
  },
  audiences: {
    title: "Ad Sets & Audiences",
    sub: "Who you are reaching, and how well it is holding up",
  },
  creatives: {
    title: "Ads & Creatives",
    sub: "Every ad creative, with fatigue and performance",
  },
  calendar: {
    title: "Calendar & Schedule",
    sub: "When campaigns run and how budget is pacing",
  },
  leads: {
    title: "Paid Leads",
    sub: "People who submitted an ad lead form — verified customer inputs",
  },
  experiments: {
    title: "Experiments",
    sub: "A/B tests with honest data-sufficiency labels",
  },
  analytics: {
    title: "Analytics & Attribution",
    sub: "Spend through to attributed revenue and orders",
  },
  competitors: {
    title: "Competitor Ads",
    sub: "Publicly visible ads and creative themes — nothing private",
  },
  rules: {
    title: "Optimisation & Rules",
    sub: "Automatic actions, with guardrails you set",
  },
  settings: {
    title: "Advertising Settings",
    sub: "Defaults, providers, tracking and approval policy",
  },
};

export function AdvertisingShell() {
  const {
    screen,
    goToScreen,
    isOwner,
    userRoleName,
    userName,
    userInitials,
    toast,
    accountFilter,
    setAccountFilter,
    settings,
    leads,
  } = useAdvertising();

  const autoPauseOn = settings?.autoPauseCostPerResult != null;
  const apColors = autoPauseOn ? { bg: "#F7FCF9", bd: "#D5EFE0", fg: "#0E8442" } : { bg: "#F2F4F7", bd: "#E6EAF0", fg: "#475467" };

  const newLeadsCount = leads.filter((l) => l.formData?.status === "New" || (l as any).st === "New").length;
  const isRestricted = !isOwner && (screen === "rules" || screen === "settings");
  const info = HEADER_INFO[screen] || HEADER_INFO.overview;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F4F6F8", color: "#111827" }}>
      {/* Sticky Header */}
      <header
        style={{
          background: "#fff",
          borderBottom: "1px solid #E6EAF0",
          padding: "13px 22px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          position: "sticky",
          top: 0,
          zIndex: 30,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-.6px", color: "#0F172A" }}>
              {info.title}
            </h1>
          </div>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: "#667085" }}>{info.sub}</p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto", flexWrap: "wrap" }}>
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
            <option>All ad accounts</option>
            <option>Meta Ads</option>
            <option>Google Ads</option>
            <option>TikTok Ads</option>
            <option>LinkedIn Ads</option>
          </select>

          <button
            onClick={() => goToScreen("rules")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              border: `1px solid ${apColors.bd}`,
              background: apColors.bg,
              borderRadius: 20,
              padding: "9px 14px",
              fontSize: 11.5,
              fontWeight: 800,
              color: apColors.fg,
              cursor: "pointer",
              minHeight: 44,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M4 12h2M18 12h2M12 4v2M12 18v2" />
            </svg>
            Auto-pause: {autoPauseOn ? "On" : "Off"}
          </button>

          <button
            onClick={() => goToScreen("builder")}
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
            Create campaign
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 9, paddingLeft: 11, borderLeft: "1px solid #E6EAF0" }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "#0A1B2A",
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {userInitials}
            </div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#101828", lineHeight: 1.2 }}>{userName}</div>
              <div style={{ fontSize: 11, color: "#667085" }}>{userRoleName}</div>
            </div>
          </div>
        </div>
      </header>

      {/* Sticky Tab Navigation */}
      <nav
        aria-label="Advertising navigation"
        style={{
          background: "#fff",
          borderBottom: "1px solid #E6EAF0",
          padding: "0 22px",
          display: "flex",
          gap: 2,
          overflowX: "auto",
          position: "sticky",
          top: 64,
          zIndex: 25,
        }}
      >
        {TABS.map((t) => {
          const isSel = screen === t.k;
          return (
            <button
              key={t.k}
              onClick={() => goToScreen(t.k)}
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "13px 12px 14px",
                fontSize: 12.5,
                fontWeight: isSel ? 700 : 500,
                color: isSel ? "#0E8442" : "#475467",
                background: "transparent",
                border: 0,
                cursor: "pointer",
                whiteSpace: "nowrap",
                minHeight: 46,
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={t.icon} />
              </svg>
              {t.label}
              {t.k === "leads" && newLeadsCount > 0 && (
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
                  {newLeadsCount}
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
                  background: isSel ? "#12A150" : "transparent",
                }}
              />
            </button>
          );
        })}
      </nav>

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: "16px 22px 26px", display: "flex", flexDirection: "column", gap: 15, minWidth: 0 }}>
        {isRestricted ? (
          <div style={{ background: "#fff", border: "1px solid #FDE3B3", borderRadius: 16, padding: "48px 20px", textAlign: "center" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: "#FEF6E7",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 12,
              }}
            >
              <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#B54708" strokeWidth="2" strokeLinecap="round">
                <rect x="4" y="10" width="16" height="11" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
            </div>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: "#93370D" }}>
              {screen === "rules" ? "Optimisation rules are owner-only" : "Advertising settings are owner-only"}
            </div>
            <div style={{ fontSize: 12.5, color: "#B54708", marginTop: 5, maxWidth: "54ch", marginLeft: "auto", marginRight: "auto" }}>
              Budget changes, account connections, and automation rules move real money, so they are limited to the business owner.
            </div>
          </div>
        ) : (
          <>
            {screen === "overview" && <OverviewScreen />}
            {screen === "campaigns" && <CampaignsScreen />}
            {screen === "builder" && <BuilderScreen />}
            {screen === "audiences" && <AudiencesScreen />}
            {screen === "creatives" && <CreativesScreen />}
            {screen === "calendar" && <CalendarScreen />}
            {screen === "leads" && <LeadsScreen />}
            {screen === "experiments" && <ExperimentsScreen />}
            {screen === "analytics" && <AnalyticsScreen />}
            {screen === "competitors" && <CompetitorsScreen />}
            {screen === "rules" && <RulesScreen />}
            {screen === "settings" && <SettingsScreen />}
          </>
        )}
      </main>

      {/* Slide-over Drawers */}
      <AdvertisingDrawers />

      {/* Modals */}
      <AdvertisingModals />

      {/* Floating Toast Flash */}
      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: "#0A1B2A",
            color: "#fff",
            borderRadius: 12,
            padding: "12px 18px",
            fontSize: 13,
            fontWeight: 700,
            zIndex: 99,
            boxShadow: "0 10px 30px rgba(0,0,0,.25)",
            animation: "nxin .18s ease",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

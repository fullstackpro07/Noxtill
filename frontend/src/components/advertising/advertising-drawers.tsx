"use client";

import React, { useEffect } from "react";
import {
  useAdvertising,
  formatMoney,
  getChip,
  type ScreenType,
} from "./advertising-context";

export function AdvertisingDrawers() {
  const {
    drawer,
    drawerItem,
    closeDrawer,
    goToScreen,
    campaigns,
    accounts,
  } = useAdvertising();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && drawer) {
        closeDrawer();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drawer, closeDrawer]);

  if (!drawer) return null;

  const getTitle = () => {
    switch (drawer) {
      case "brief":
        return "Today's ad brief";
      case "kpi":
        return "Where this comes from";
      case "nba":
        return "Recommendation";
      case "campaign":
        return "Campaign";
      case "review":
        return "Campaign review";
      case "audience":
        return "Audience";
      case "ad":
        return "Ad creative";
      case "lead":
        return "Lead";
      case "exp":
        return "Experiment";
      case "comp":
        return "Competitor";
      default:
        return "";
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={closeDrawer}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(10,27,42,.36)",
          zIndex: 80,
        }}
      />

      {/* Drawer */}
      <aside
        data-drawer="1"
        role="dialog"
        aria-modal="true"
        aria-label={getTitle()}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "520px",
          maxWidth: "100%",
          background: "#fff",
          zIndex: 85,
          boxShadow: "-18px 0 46px rgba(10,27,42,.18)",
          display: "flex",
          flexDirection: "column",
          animation: "nxslide .22s ease",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "17px",
            borderBottom: "1px solid #F0F2F5",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "#0F172A", flex: 1 }}>
            {getTitle()}
          </h3>
          <button
            onClick={closeDrawer}
            aria-label="Close"
            style={{
              width: "34px",
              height: "34px",
              border: "1px solid #E6EAF0",
              background: "#fff",
              borderRadius: "9px",
              color: "#475467",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "17px" }}>
          {/* 1. BRIEF */}
          {drawer === "brief" && (() => {
            const b = drawerItem || {};
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                  <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "12px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#667085" }}>Spend</div>
                    <div style={{ fontSize: "17px", fontWeight: 800, color: "#0F172A", marginTop: "4px" }}>
                      {formatMoney(b.spend || 0)}
                    </div>
                  </div>
                  <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "12px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#667085" }}>Revenue</div>
                    <div style={{ fontSize: "17px", fontWeight: 800, color: "#0F172A", marginTop: "4px" }}>
                      {b.revenue == null ? "Not tracked" : formatMoney(b.revenue)}
                    </div>
                  </div>
                  <div style={{ border: "1.5px solid #BFE7CF", borderRadius: "12px", padding: "12px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#0E8442" }}>Return</div>
                    <div style={{ fontSize: "17px", fontWeight: 800, color: "#0F172A", marginTop: "4px" }}>
                      {b.roas || "Not tracked"}
                    </div>
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F2F4F7" }}>
                    <span style={{ fontSize: "12.5px", color: "#667085" }}>Active campaigns</span>
                    <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#344054" }}>{b.activeCount ?? 0}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F2F4F7" }}>
                    <span style={{ fontSize: "12.5px", color: "#667085" }}>Conversions tracked</span>
                    <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#344054" }}>{b.totalConversions ?? 0}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F2F4F7" }}>
                    <span style={{ fontSize: "12.5px", color: "#667085" }}>Best campaign</span>
                    <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#344054" }}>{b.bestCampaign || "None yet"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
                    <span style={{ fontSize: "12.5px", color: "#667085" }}>Best creative</span>
                    <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#344054" }}>{b.bestCreative || "None yet"}</span>
                  </div>
                </div>

                <div style={{ background: "#FAFBFC", border: "1px solid #F0F2F5", borderRadius: "12px", padding: "13px", fontSize: "11.5px", color: "#667085", lineHeight: 1.6 }}>
                  This is everything Noxtill actually has for today: real spend and conversions from your connected accounts. Per-campaign risk/opportunity scoring and revenue attribution aren&apos;t built yet, so nothing is guessed here.
                </div>

                <button
                  onClick={closeDrawer}
                  style={{
                    border: "1px solid #E6EAF0",
                    background: "#fff",
                    borderRadius: "11px",
                    padding: "12px",
                    fontSize: "12.5px",
                    fontWeight: 700,
                    color: "#344054",
                    cursor: "pointer",
                    minHeight: "46px",
                  }}
                >
                  Close
                </button>
              </div>
            );
          })()}

          {/* 2. KPI SOURCE */}
          {drawer === "kpi" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ fontSize: "16px", fontWeight: 800, color: "#0F172A" }}>
                {drawerItem?.k || "Overview Metric"}
              </div>
              <div>
                {[
                  { l: "Where it comes from", v: "Each connected ad platform\u2019s own reporting API" },
                  { l: "Campaigns included", v: String(campaigns.length) },
                  { l: "Connected accounts", v: String(accounts.filter((a) => a.connected).length) + " of " + String(accounts.length) },
                  { l: "Revenue attribution", v: "Not built yet — figures below are spend and results only" },
                ].map((r, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "14px",
                      padding: "9px 0",
                      borderBottom: "1px solid #F2F4F7",
                    }}
                  >
                    <span style={{ fontSize: "12.5px", color: "#667085", flex: "0 0 42%" }}>
                      {r.l}
                    </span>
                    <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#344054", textAlign: "right" }}>
                      {r.v}
                    </span>
                  </div>
                ))}
              </div>

              <div
                style={{
                  background: "#FAFBFC",
                  border: "1px solid #F0F2F5",
                  borderRadius: "11px",
                  padding: "12px",
                  fontSize: "11.5px",
                  color: "#667085",
                  lineHeight: 1.6,
                }}
              >
                Every number on the overview is read from your connected accounts\u2019 own real data. A disconnected platform shows as not connected rather than being estimated.
              </div>

              <button
                onClick={closeDrawer}
                style={{
                  border: "1px solid #E6EAF0",
                  background: "#fff",
                  borderRadius: "11px",
                  padding: "12px",
                  fontSize: "12.5px",
                  fontWeight: 700,
                  color: "#344054",
                  cursor: "pointer",
                  minHeight: "46px",
                }}
              >
                Close
              </button>
            </div>
          )}

          {/* 3. NBA RECOMMENDATION — the real item clicked on Overview, not a separate fabricated list */}
          {drawer === "nba" && (() => {
            const item = drawerItem?.item;
            if (!item) return null;

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ fontSize: "15.5px", fontWeight: 800, color: "#0F172A", lineHeight: 1.45 }}>
                  {item.t}
                </div>
                <div>
                  <div style={{ fontSize: "10.5px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3" }}>
                    Why
                  </div>
                  <div style={{ fontSize: "12.5px", color: "#344054", marginTop: "6px", lineHeight: 1.65 }}>
                    {item.why}
                  </div>
                </div>

                <div style={{ background: "#FAFBFC", border: "1px solid #F0F2F5", borderRadius: "12px", padding: "13px" }}>
                  <div style={{ fontSize: "10.5px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3" }}>
                    Data behind it
                  </div>
                  <div style={{ fontSize: "12px", color: "#475467", marginTop: "6px", lineHeight: 1.6 }}>
                    {item.ev}
                  </div>
                </div>

                <div style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: "11px", padding: "11px 13px", fontSize: "11.5px", color: "#93370D" }}>
                  This is a suggestion based on your own numbers. Nothing changes until you decide it should.
                </div>

                <div style={{ display: "flex", gap: "9px" }}>
                  <button
                    onClick={closeDrawer}
                    style={{
                      border: "1px solid #E6EAF0",
                      background: "#fff",
                      borderRadius: "11px",
                      padding: "12px 16px",
                      fontSize: "12.5px",
                      fontWeight: 700,
                      color: "#344054",
                      cursor: "pointer",
                      minHeight: "46px",
                    }}
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      closeDrawer();
                      goToScreen(item.scr);
                    }}
                    style={{
                      flex: 1,
                      border: 0,
                      background: "#12A150",
                      borderRadius: "11px",
                      padding: "12px",
                      fontSize: "13px",
                      fontWeight: 800,
                      color: "#fff",
                      cursor: "pointer",
                      minHeight: "46px",
                    }}
                  >
                    {item.act}
                  </button>
                </div>
              </div>
            );
          })()}

          {/* 4. CAMPAIGN DETAILS */}
          {drawer === "campaign" && (() => {
            const c = drawerItem?.c || {};
            const chip = getChip(c.status || c.st || "Active");
            const spend = Number(c.spend || c.spent || 0);
            const rev = Number(c.rev || c.attributedRevenue || 0);
            const conv = Number(c.conv || c.conversions || 0);
            const roas = spend > 0 ? rev / spend : 0;
            const cpa = conv > 0 ? spend / conv : 0;

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "16px", fontWeight: 800, color: "#0F172A" }}>
                      {c.name || c.n || "Campaign"}
                    </span>
                    <span
                      style={{
                        fontSize: "10.5px",
                        fontWeight: 800,
                        padding: "3px 9px",
                        borderRadius: "20px",
                        background: chip.bg,
                        color: chip.fg,
                      }}
                    >
                      {c.status || c.st || "Active"}
                    </span>
                  </div>
                  <div style={{ fontSize: "11.5px", color: "#98A2B3", marginTop: "4px" }}>
                    {c.provider || c.pf || "Meta"} · {c.goal || c.obj || "Sales"} · {c.aud || "Target Audience"}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "12px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#667085" }}>Spend</div>
                    <div style={{ fontSize: "17px", fontWeight: 800, color: "#0F172A", marginTop: "4px" }}>
                      {formatMoney(spend)}
                    </div>
                  </div>
                  <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "12px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#667085" }}>Attributed revenue</div>
                    <div style={{ fontSize: "17px", fontWeight: 800, color: "#0F172A", marginTop: "4px" }}>
                      {formatMoney(rev)}
                    </div>
                  </div>
                  <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "12px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#667085" }}>Conversions</div>
                    <div style={{ fontSize: "17px", fontWeight: 800, color: "#0F172A", marginTop: "4px" }}>
                      {conv}
                    </div>
                  </div>
                  <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "12px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#667085" }}>Return</div>
                    <div
                      style={{
                        fontSize: "17px",
                        fontWeight: 800,
                        color: roas >= 2 ? "#0E8442" : roas >= 1 ? "#B54708" : "#B42318",
                        marginTop: "4px",
                      }}
                    >
                      {spend > 0 ? `${roas.toFixed(1)}×` : "—"}
                    </div>
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F2F4F7" }}>
                    <span style={{ fontSize: "12.5px", color: "#667085" }}>Daily budget</span>
                    <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#344054" }}>
                      {formatMoney(c.dailyBudget || c.budget || 1200)} / day
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F2F4F7" }}>
                    <span style={{ fontSize: "12.5px", color: "#667085" }}>Cost per result</span>
                    <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#344054" }}>
                      {conv > 0 ? formatMoney(cpa) : "—"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
                    <span style={{ fontSize: "12.5px", color: "#667085" }}>Advertising</span>
                    <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#344054" }}>
                      {c.product || c.prod || "Linked Product"}
                    </span>
                  </div>
                </div>

                {spend > 0 && roas < 1 && (
                  <div style={{ background: "#FEF3F2", border: "1px solid #FDD9D6", borderRadius: "12px", padding: "13px" }}>
                    <div style={{ fontSize: "12.5px", fontWeight: 800, color: "#912018" }}>
                      This campaign is losing money
                    </div>
                    <div style={{ fontSize: "12px", color: "#B42318", marginTop: "5px", lineHeight: 1.6 }}>
                      It is returning less than it costs. Worth pausing or rebuilding rather than leaving it running.
                    </div>
                  </div>
                )}

                <button
                  onClick={closeDrawer}
                  style={{
                    border: "1px solid #E6EAF0",
                    background: "#fff",
                    borderRadius: "11px",
                    padding: "12px",
                    fontSize: "12.5px",
                    fontWeight: 700,
                    color: "#344054",
                    cursor: "pointer",
                    minHeight: "46px",
                  }}
                >
                  Close
                </button>
              </div>
            );
          })()}

          {/* 5. REVIEW DRAWER — a root-cause "what's holding it back / worth trying" analysis needs
              per-audience frequency and per-creative performance tracking, neither of which exist
              in this schema yet (see the Audience and Ad Creative drawers). Rather than invent
              that analysis, this says so and points at what's actually real for this campaign. */}
          {drawer === "review" && (() => {
            const c = drawerItem?.c || {};
            const spend = Number(c.spend || c.spent || 0);
            const conv = Number(c.conv || c.conversions || 0);

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ fontSize: "15.5px", fontWeight: 800, color: "#0F172A" }}>
                  {c.name || c.n || "Campaign"}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "12px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#667085" }}>Spend</div>
                    <div style={{ fontSize: "17px", fontWeight: 800, color: "#0F172A", marginTop: "4px" }}>{formatMoney(spend)}</div>
                  </div>
                  <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "12px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#667085" }}>Conversions</div>
                    <div style={{ fontSize: "17px", fontWeight: 800, color: "#0F172A", marginTop: "4px" }}>{conv}</div>
                  </div>
                </div>

                <div style={{ background: "#FAFBFC", border: "1px solid #F0F2F5", borderRadius: "12px", padding: "13px", fontSize: "12px", color: "#475467", lineHeight: 1.65 }}>
                  A deeper &quot;what&apos;s holding this back&quot; analysis would need audience frequency and
                  per-creative performance, and neither is tracked yet — only the campaign totals above
                  are real. Nothing is guessed here to fill the gap.
                </div>

                <button
                  onClick={closeDrawer}
                  style={{
                    border: "1px solid #E6EAF0",
                    background: "#fff",
                    borderRadius: "11px",
                    padding: "12px",
                    fontSize: "12.5px",
                    fontWeight: 700,
                    color: "#344054",
                    cursor: "pointer",
                    minHeight: "46px",
                  }}
                >
                  Close
                </button>
              </div>
            );
          })()}

          {/* 6. AUDIENCE DRAWER — real fields only; per-audience performance isn't tracked separately from its campaign */}
          {drawer === "audience" && (() => {
            const a = drawerItem?.a || {};
            const chip = getChip(a.status === "synced" ? "Connected" : a.status === "syncing" ? "Not connected" : a.status === "failed" ? "Needs reconnect" : "Healthy");
            const statusLabel = a.status === "synced" ? "Synced to platform" : a.status === "syncing" ? "Syncing" : a.status === "failed" ? "Sync failed" : "Local only";

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "16px", fontWeight: 800, color: "#0F172A" }}>
                      {a.name || "Audience"}
                    </span>
                    <span
                      style={{
                        fontSize: "10.5px",
                        fontWeight: 800,
                        padding: "3px 9px",
                        borderRadius: "20px",
                        background: chip.bg,
                        color: chip.fg,
                      }}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  <div style={{ fontSize: "11.5px", color: "#98A2B3", marginTop: "4px" }}>
                    {a.provider || "—"} · {a.segmentKey ? `from segment "${a.segmentKey}"` : "custom"}
                  </div>
                </div>

                <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "12px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#667085" }}>Size (consented contacts)</div>
                  <div style={{ fontSize: "17px", fontWeight: 800, color: "#0F172A", marginTop: "4px" }}>
                    {typeof a.size === "number" ? a.size.toLocaleString("en-US") : "0"}
                  </div>
                </div>

                <div style={{ background: "#FAFBFC", border: "1px solid #F0F2F5", borderRadius: "12px", padding: "13px", fontSize: "11.5px", color: "#667085", lineHeight: 1.6 }}>
                  Per-audience conversions, cost and return aren&apos;t tracked separately from the campaign — see the campaign this audience is used in for real performance.
                </div>

                <button
                  onClick={closeDrawer}
                  style={{
                    border: "1px solid #E6EAF0",
                    background: "#fff",
                    borderRadius: "11px",
                    padding: "12px",
                    fontSize: "12.5px",
                    fontWeight: 700,
                    color: "#344054",
                    cursor: "pointer",
                    minHeight: "46px",
                  }}
                >
                  Close
                </button>
              </div>
            );
          })()}

          {/* 7. AD CREATIVE DRAWER — real fields only; per-creative performance isn't tracked (only campaign-level stats exist) */}
          {drawer === "ad" && (() => {
            const ad = drawerItem?.a || {};
            const campaign = campaigns.find((c) => c.id === ad.campaignId);

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div
                  style={{
                    borderRadius: "14px",
                    background: "linear-gradient(150deg,#0A1B2A,#132C3E)",
                    padding: "20px",
                    color: "#fff",
                  }}
                >
                  <div style={{ fontSize: "15px", fontWeight: 800 }}>{ad.headline || "Untitled"}</div>
                  <div style={{ fontSize: "12.5px", marginTop: "8px", opacity: 0.85, lineHeight: 1.55 }}>{ad.body || ""}</div>
                </div>

                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "15.5px", fontWeight: 800, color: "#0F172A" }}>
                      {ad.headline || "Ad Creative"}
                    </span>
                    <span
                      style={{
                        fontSize: "10.5px",
                        fontWeight: 800,
                        color: ad.status === "active" ? "#0E8442" : "#475467",
                        background: ad.status === "active" ? "#E8F7EE" : "#F2F4F7",
                        borderRadius: "5px",
                        padding: "2px 7px",
                      }}
                    >
                      {ad.status || "draft"}
                    </span>
                  </div>
                  <div style={{ fontSize: "11.5px", color: "#98A2B3", marginTop: "4px" }}>
                    {campaign ? (campaign.providerMeta as Record<string, unknown> | undefined)?.name as string || campaign.goal : "Not linked to a campaign"} · {ad.provider || "—"}
                    {ad.sourceReviewId ? " · Built from a customer review" : ""}
                  </div>
                </div>

                <div style={{ background: "#FAFBFC", border: "1px solid #F0F2F5", borderRadius: "12px", padding: "13px", fontSize: "11.5px", color: "#667085", lineHeight: 1.6 }}>
                  Spend, click rate and conversions are only measured at the campaign level, not per creative — see the campaign for real performance.
                </div>

                <button
                  onClick={closeDrawer}
                  style={{
                    border: "1px solid #E6EAF0",
                    background: "#fff",
                    borderRadius: "11px",
                    padding: "12px",
                    fontSize: "12.5px",
                    fontWeight: 700,
                    color: "#344054",
                    cursor: "pointer",
                    minHeight: "46px",
                  }}
                >
                  Close
                </button>
              </div>
            );
          })()}

          {/* 8. LEAD DRAWER */}
          {drawer === "lead" && (() => {
            const l = drawerItem?.l || {};
            const hasName = !!l.name;
            const hasEmail = !!l.email;
            const hasPhone = !!l.phone;
            const campaign = campaigns.find((c) => c.id === l.campaignId);
            const formEntries = Object.entries((l.formData || {}) as Record<string, unknown>).filter(([, v]) => v != null && v !== "");

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
                  {hasName ? (
                    <span style={{ fontSize: "16px", fontWeight: 800, color: "#0F172A" }}>
                      {l.name}
                    </span>
                  ) : (
                    <span style={{ fontSize: "15px", fontWeight: 700, color: "#98A2B3", fontStyle: "italic" }}>
                      Name not provided
                    </span>
                  )}
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "14px", padding: "9px 0", borderBottom: "1px solid #F2F4F7" }}>
                    <span style={{ fontSize: "12.5px", color: "#667085" }}>Email</span>
                    {hasEmail ? (
                      <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#344054" }}>
                        {l.email}
                      </span>
                    ) : (
                      <span style={{ fontSize: "12px", color: "#98A2B3", fontStyle: "italic" }}>
                        Not provided
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "14px", padding: "9px 0", borderBottom: "1px solid #F2F4F7" }}>
                    <span style={{ fontSize: "12.5px", color: "#667085" }}>Phone</span>
                    {hasPhone ? (
                      <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#344054" }}>
                        {l.phone}
                      </span>
                    ) : (
                      <span style={{ fontSize: "12px", color: "#98A2B3", fontStyle: "italic" }}>
                        Not provided
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "14px", padding: "9px 0", borderBottom: "1px solid #F2F4F7" }}>
                    <span style={{ fontSize: "12.5px", color: "#667085" }}>Platform</span>
                    <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#344054" }}>{l.provider || "—"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "14px", padding: "9px 0" }}>
                    <span style={{ fontSize: "12.5px", color: "#667085" }}>Campaign</span>
                    <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#344054", textAlign: "right" }}>
                      {campaign ? (campaign.providerMeta as Record<string, unknown> | undefined)?.name as string || campaign.goal : "Not linked to a campaign"}
                    </span>
                  </div>
                </div>

                {formEntries.length > 0 && (
                  <div>
                    <div style={{ fontSize: "10.5px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: "9px" }}>
                      What they submitted on the form
                    </div>
                    {formEntries.map(([key, value]) => (
                      <div key={key} style={{ display: "flex", justifyContent: "space-between", gap: "14px", padding: "9px 0", borderBottom: "1px solid #F2F4F7" }}>
                        <span style={{ fontSize: "12.5px", color: "#667085" }}>{key}</span>
                        <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#344054", textAlign: "right" }}>{String(value)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div
                  style={{
                    background: "#EEF4FF",
                    border: "1px solid #C7D7FE",
                    borderRadius: "11px",
                    padding: "11px 13px",
                    fontSize: "11.5px",
                    color: "#3538CD",
                    lineHeight: 1.55,
                  }}
                >
                  Blank fields mean the person did not fill them in. Noxtill does not look up or infer contact details.
                </div>

                <button
                  onClick={closeDrawer}
                  style={{
                    border: "1px solid #E6EAF0",
                    background: "#fff",
                    borderRadius: "11px",
                    padding: "12px",
                    fontSize: "12.5px",
                    fontWeight: 700,
                    color: "#344054",
                    cursor: "pointer",
                    minHeight: "46px",
                  }}
                >
                  Close
                </button>
              </div>
            );
          })()}

          {/* 9. EXPERIMENT DRAWER — real creative copy only; no per-creative performance exists to declare a winner from */}
          {drawer === "exp" && (() => {
            const x = drawerItem?.x || {};
            const cs: Array<{ id: string; headline: string; body: string; provider: string; status: string }> = x.creatives || [];

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ fontSize: "15.5px", fontWeight: 800, color: "#0F172A" }}>
                  {x.name || "Experiment"}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  {cs.slice(0, 2).map((c) => (
                    <div key={c.id} style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "13px" }}>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "#0F172A" }}>{c.headline}</div>
                      <div style={{ fontSize: "11.5px", color: "#667085", marginTop: "6px", lineHeight: 1.5 }}>{c.body}</div>
                      <div style={{ fontSize: "10.5px", color: "#98A2B3", marginTop: "8px" }}>{c.provider} · {c.status}</div>
                    </div>
                  ))}
                </div>

                <div style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: "12px", padding: "13px" }}>
                  <div style={{ fontSize: "12.5px", fontWeight: 800, color: "#93370D" }}>
                    No winner to declare
                  </div>
                  <div style={{ fontSize: "12px", color: "#B54708", marginTop: "5px", lineHeight: 1.6 }}>
                    Performance isn&apos;t tracked per creative, only per campaign — so there&apos;s no real signal here to pick a winner from.
                  </div>
                </div>

                <button
                  onClick={closeDrawer}
                  style={{
                    border: "1px solid #E6EAF0",
                    background: "#fff",
                    borderRadius: "11px",
                    padding: "12px",
                    fontSize: "12.5px",
                    fontWeight: 700,
                    color: "#344054",
                    cursor: "pointer",
                    minHeight: "46px",
                  }}
                >
                  Close
                </button>
              </div>
            );
          })()}

          {/* 10. COMPETITOR DRAWER — real tracked fields only (rating/reviews from Google Places) */}
          {drawer === "comp" && (() => {
            const c = drawerItem?.c || {};
            const trend: number[] = c.weeklyRatings || [];
            const trendChange = trend.length >= 2 ? +(trend[trend.length - 1] - trend[0]).toFixed(1) : null;

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ fontSize: "16px", fontWeight: 800, color: "#0F172A" }}>
                  {c.name || "Competitor"}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "12px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#667085" }}>Rating</div>
                    <div style={{ fontSize: "17px", fontWeight: 800, color: "#0F172A", marginTop: "4px" }}>
                      {typeof c.rating === "number" ? c.rating.toFixed(1) : "—"}
                    </div>
                  </div>
                  <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "12px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#667085" }}>Reviews</div>
                    <div style={{ fontSize: "17px", fontWeight: 800, color: "#0F172A", marginTop: "4px" }}>
                      {typeof c.reviewCount === "number" ? c.reviewCount.toLocaleString("en-US") : "—"}
                    </div>
                  </div>
                </div>
                {trendChange != null && (
                  <div style={{ fontSize: "12px", color: trendChange >= 0 ? "#0E8442" : "#B42318" }}>
                    Rating {trendChange >= 0 ? "up" : "down"} {Math.abs(trendChange)} over the last {trend.length} weeks tracked.
                  </div>
                )}

                <div style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: "12px", padding: "13px" }}>
                  <div style={{ fontSize: "10.5px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#93370D" }}>
                    What Noxtill cannot see
                  </div>
                  <div style={{ fontSize: "12px", color: "#B54708", marginTop: "6px", lineHeight: 1.6 }}>
                    Their budget, spend, results, revenue and audiences are all private. Anyone claiming to show you those numbers is estimating.
                  </div>
                </div>

                <button
                  onClick={closeDrawer}
                  style={{
                    border: "1px solid #E6EAF0",
                    background: "#fff",
                    borderRadius: "11px",
                    padding: "12px",
                    fontSize: "12.5px",
                    fontWeight: 700,
                    color: "#344054",
                    cursor: "pointer",
                    minHeight: "46px",
                  }}
                >
                  Close
                </button>
              </div>
            );
          })()}
        </div>
      </aside>
    </>
  );
}

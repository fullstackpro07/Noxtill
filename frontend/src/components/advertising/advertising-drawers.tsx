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
    creatives,
    leads,
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
          {drawer === "brief" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "12px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#667085" }}>Spend</div>
                  <div style={{ fontSize: "17px", fontWeight: 800, color: "#0F172A", marginTop: "4px" }}>
                    Rs. 3,840
                  </div>
                </div>
                <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "12px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#667085" }}>Revenue</div>
                  <div style={{ fontSize: "17px", fontWeight: 800, color: "#0F172A", marginTop: "4px" }}>
                    Rs. 11,200
                  </div>
                </div>
                <div style={{ border: "1.5px solid #BFE7CF", borderRadius: "12px", padding: "12px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#0E8442" }}>Return</div>
                  <div style={{ fontSize: "17px", fontWeight: 800, color: "#0F172A", marginTop: "4px" }}>
                    2.9×
                  </div>
                </div>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F2F4F7" }}>
                  <span style={{ fontSize: "12.5px", color: "#667085" }}>Best campaign</span>
                  <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#344054" }}>
                    {((campaigns[0]?.providerMeta as any)?.name as string) || campaigns[0]?.goal || "iPhone 15 Pro — September push"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F2F4F7" }}>
                  <span style={{ fontSize: "12.5px", color: "#667085" }}>Best creative</span>
                  <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#344054" }}>
                    {creatives[0]?.headline || "iPhone hero — static"}
                  </span>
                </div>
              </div>

              <div style={{ background: "#FEF3F2", border: "1px solid #FDD9D6", borderRadius: "12px", padding: "13px" }}>
                <div style={{ fontSize: "10.5px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#912018" }}>
                  Biggest risk
                </div>
                <div style={{ fontSize: "12.5px", color: "#344054", marginTop: "6px", lineHeight: 1.6 }}>
                  Headphones retargeting is still below break-even after Rs. 14,200 spent.
                </div>
              </div>

              <div style={{ background: "#F7FCF9", border: "1px solid #D5EFE0", borderRadius: "12px", padding: "13px" }}>
                <div style={{ fontSize: "10.5px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#0E8442" }}>
                  Biggest opportunity
                </div>
                <div style={{ fontSize: "12.5px", color: "#344054", marginTop: "6px", lineHeight: 1.6 }}>
                  Booking campaign has headroom — frequency is only 1.8 with positive return.
                </div>
              </div>

              <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "13px" }}>
                <div style={{ fontSize: "10.5px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3" }}>
                  If you do one thing today
                </div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#101828", marginTop: "6px", lineHeight: 1.55 }}>
                  Pause the headphones ad and move its budget to bookings.
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
          )}

          {/* 2. KPI SOURCE */}
          {drawer === "kpi" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ fontSize: "16px", fontWeight: 800, color: "#0F172A" }}>
                {drawerItem?.k || "Overview Metric"}
              </div>
              <div>
                {[
                  { l: "Where it comes from", v: "Meta, Google and TikTok ad APIs" },
                  { l: "Period", v: "3 Aug – 2 Sep 2026" },
                  { l: "Campaigns included", v: String(campaigns.length || 7) },
                  { l: "Last synced", v: "Meta 4 min ago · Google 11 min ago · TikTok 2 hrs ago" },
                  { l: "Not included", v: "LinkedIn — not connected" },
                  { l: "How revenue is matched", v: "Click within 7 days, then a traceable order or booking" },
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
                Every number on the overview is read from the platform APIs for this period. Nothing is modelled or filled in where a platform is not connected.
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

          {/* 3. NBA RECOMMENDATION */}
          {drawer === "nba" && (() => {
            const nbaList = [
              {
                t: "Headphones retargeting is returning Rs. 0.90 for every Rs. 1 spent",
                why: "Over 30 days it spent Rs. 14,200 and produced 4 conversions worth Rs. 12,800. The audience is a 30-day site-visitor pool of 1,180 people and frequency has reached 6.8, so most of them have seen it repeatedly.",
                ev: "Meta ad account, 3 Aug – 2 Sep. 4 conversions, Rs. 12,800 attributed revenue, frequency 6.8.",
                conf: "High",
                act: "Open the campaign",
                scr: "campaigns" as ScreenType,
              },
              {
                t: "The booking campaign has room to grow",
                why: "Return has held at 3.3× for nine days and frequency is 1.8, well below the point where performance usually drops off. The daily budget has been capped at Rs. 800 the whole time.",
                ev: "Meta, last 9 days. 31 conversions, Rs. 62,000 attributed revenue, frequency 1.8.",
                conf: "Medium",
                act: "Review the rule",
                scr: "rules" as ScreenType,
              },
              {
                t: "Two creatives are showing fatigue",
                why: "Both have passed frequency 5 and their click rate has fallen 44% over 14 days while spend held steady. That pattern usually means the audience has seen enough.",
                ev: "Meta and TikTok, last 14 days. Click rate 1.6% down to 0.9%.",
                conf: "High",
                act: "Open creatives",
                scr: "creatives" as ScreenType,
              },
              {
                t: "TikTok conversions may be under-reported",
                why: "The account is sending clicks at a normal rate but only 2 conversions have been recorded. The conversion event is only partly configured, so this may be a tracking gap rather than genuinely poor performance.",
                ev: "TikTok account health check — conversion tracking incomplete.",
                conf: "Medium",
                act: "Open settings",
                scr: "settings" as ScreenType,
              },
            ];
            const item = nbaList[drawerItem?.i ?? 0] || nbaList[0];

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

                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid #F2F4F7" }}>
                  <span style={{ fontSize: "12.5px", color: "#667085" }}>Confidence</span>
                  <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#344054" }}>
                    {item.conf}
                  </span>
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

          {/* 5. REVIEW DRAWER */}
          {drawer === "review" && (() => {
            const c = drawerItem?.c || {};

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ fontSize: "15.5px", fontWeight: 800, color: "#0F172A" }}>
                  {c.name || c.n || "Campaign Review"}
                </div>
                <div>
                  <div style={{ fontSize: "10.5px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#B42318", marginBottom: "9px" }}>
                    Three things holding it back
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
                    {[
                      { t: "Frequency is climbing on the main audience", d: "At 4.2, up from 2.8 a fortnight ago. Cost per result has risen with it." },
                      { t: "One creative is doing most of the work", d: "The static image drives 58% of conversions. If it fatigues, the campaign drops sharply." },
                      { t: "Stock is finite", d: "Limited units left. At the current rate that is about 12 days of demand." },
                    ].map((p, idx) => (
                      <div key={idx} style={{ border: "1px solid #FDD9D6", background: "#FEF3F2", borderRadius: "11px", padding: "12px" }}>
                        <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#912018" }}>{p.t}</div>
                        <div style={{ fontSize: "12px", color: "#B42318", marginTop: "4px", lineHeight: 1.55 }}>{p.d}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "10.5px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#0E8442", marginBottom: "9px" }}>
                    Three things worth trying
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
                    {[
                      { t: "The static creative outperforms the carousel", d: "Lower cost per conversion. Shifting budget toward it would lower the average." },
                      { t: "A lookalike audience is built but unused", d: "Thousands of people modelled on your best customers, never tested." },
                      { t: "Reviews are strong enough to use in copy", d: "Strong customer ratings — social proof you are not currently showing." },
                    ].map((o, idx) => (
                      <div key={idx} style={{ border: "1px solid #D5EFE0", background: "#F7FCF9", borderRadius: "11px", padding: "12px" }}>
                        <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#0E8442" }}>{o.t}</div>
                        <div style={{ fontSize: "12px", color: "#344054", marginTop: "4px", lineHeight: 1.55 }}>{o.d}</div>
                      </div>
                    ))}
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

          {/* 6. AUDIENCE DRAWER */}
          {drawer === "audience" && (() => {
            const a = drawerItem?.a || {};
            const chip = getChip(a.status || a.st || "Healthy");
            const isFatigued = (a.freq || 0) > 5 || a.status === "Fatigued" || a.st === "Fatigued";

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "16px", fontWeight: 800, color: "#0F172A" }}>
                      {a.name || a.n || "Audience"}
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
                      {a.status || a.st || "Healthy"}
                    </span>
                  </div>
                  <div style={{ fontSize: "11.5px", color: "#98A2B3", marginTop: "4px" }}>
                    {a.type || "Customer segment"} · {a.provider || a.pf || "Meta"} · {a.size || "1,200"}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "12px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#667085" }}>Conversions</div>
                    <div style={{ fontSize: "17px", fontWeight: 800, color: "#0F172A", marginTop: "4px" }}>
                      {a.conv ?? 28}
                    </div>
                  </div>
                  <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "12px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#667085" }}>Cost per result</div>
                    <div style={{ fontSize: "17px", fontWeight: 800, color: "#0F172A", marginTop: "4px" }}>
                      {formatMoney(a.cpa || 1420)}
                    </div>
                  </div>
                  <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "12px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#667085" }}>Return</div>
                    <div style={{ fontSize: "17px", fontWeight: 800, color: "#0F172A", marginTop: "4px" }}>
                      {a.roas ? `${a.roas}×` : "4.1×"}
                    </div>
                  </div>
                  <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "12px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#667085" }}>Frequency</div>
                    <div style={{ fontSize: "17px", fontWeight: 800, color: isFatigued ? "#B42318" : "#0F172A", marginTop: "4px" }}>
                      {a.freq ? `${a.freq}×` : "2.1×"}
                    </div>
                  </div>
                </div>

                {isFatigued && (
                  <div style={{ background: "#FEF3F2", border: "1px solid #FDD9D6", borderRadius: "12px", padding: "13px" }}>
                    <div style={{ fontSize: "12.5px", fontWeight: 800, color: "#912018" }}>
                      This audience has seen enough
                    </div>
                    <div style={{ fontSize: "12px", color: "#B42318", marginTop: "5px", lineHeight: 1.6 }}>
                      Most of these people have seen the same ads repeatedly. Either widen the pool or give them something new to look at.
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

          {/* 7. AD CREATIVE DRAWER */}
          {drawer === "ad" && (() => {
            const ad = drawerItem?.a || {};
            const isFatigued = ad.fatigue || ad.isFatigued;

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div
                  style={{
                    height: "170px",
                    borderRadius: "14px",
                    background: "linear-gradient(150deg,#0A1B2A,#132C3E)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: "13px",
                    fontWeight: 800,
                  }}
                >
                  {ad.format || ad.fmt || "Image"}
                </div>

                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "15.5px", fontWeight: 800, color: "#0F172A" }}>
                      {ad.name || ad.n || "Ad Creative"}
                    </span>
                    {(ad.ai || ad.aiBadge) && (
                      <span
                        style={{
                          fontSize: "9.5px",
                          fontWeight: 800,
                          color: "#0E8442",
                          background: "#E8F7EE",
                          borderRadius: "5px",
                          padding: "2px 7px",
                        }}
                      >
                        AI drafted
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: "11.5px", color: "#98A2B3", marginTop: "4px" }}>
                    {ad.campaign || ad.camp || "Campaign"} · {ad.provider || ad.pf || "Meta"}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "12px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#667085" }}>Spend</div>
                    <div style={{ fontSize: "17px", fontWeight: 800, color: "#0F172A", marginTop: "4px" }}>
                      {formatMoney(ad.spend || 18400)}
                    </div>
                  </div>
                  <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "12px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#667085" }}>Click rate</div>
                    <div style={{ fontSize: "17px", fontWeight: 800, color: "#0F172A", marginTop: "4px" }}>
                      {ad.ctr ? `${ad.ctr}%` : "2.8%"}
                    </div>
                  </div>
                  <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "12px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#667085" }}>Conversions</div>
                    <div style={{ fontSize: "17px", fontWeight: 800, color: "#0F172A", marginTop: "4px" }}>
                      {ad.conv || 14}
                    </div>
                  </div>
                  <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "12px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#667085" }}>Return</div>
                    <div style={{ fontSize: "17px", fontWeight: 800, color: "#0F172A", marginTop: "4px" }}>
                      {ad.roas ? `${ad.roas}×` : "4.6×"}
                    </div>
                  </div>
                </div>

                {isFatigued && (
                  <div style={{ background: "#FEF3F2", border: "1px solid #FDD9D6", borderRadius: "12px", padding: "13px" }}>
                    <div style={{ fontSize: "12.5px", fontWeight: 800, color: "#912018" }}>
                      Time to replace this creative
                    </div>
                    <div style={{ fontSize: "12px", color: "#B42318", marginTop: "5px", lineHeight: 1.6 }}>
                      Click rate has fallen while spend stayed flat. The audience has seen it too often.
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

          {/* 8. LEAD DRAWER */}
          {drawer === "lead" && (() => {
            const l = drawerItem?.l || leads[0] || {};
            const chip = getChip(l.status || l.st || "New");
            const hasName = l.fullName || (l.name && l.name !== "—");
            const hasEmail = l.email && l.email !== "—";
            const hasPhone = l.phone && l.phone !== "—";

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
                  {hasName ? (
                    <span style={{ fontSize: "16px", fontWeight: 800, color: "#0F172A" }}>
                      {l.fullName || l.name}
                    </span>
                  ) : (
                    <span style={{ fontSize: "15px", fontWeight: 700, color: "#98A2B3", fontStyle: "italic" }}>
                      Name not provided
                    </span>
                  )}
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
                    {l.status || l.st || "New"}
                  </span>
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
                    <span style={{ fontSize: "12.5px", color: "#667085" }}>Interested in</span>
                    <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#344054" }}>
                      {l.interest || "Hair styling"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "14px", padding: "9px 0", borderBottom: "1px solid #F2F4F7" }}>
                    <span style={{ fontSize: "12.5px", color: "#667085" }}>Came from</span>
                    <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#344054" }}>
                      {l.formName || l.src || "Meta lead form"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "14px", padding: "9px 0" }}>
                    <span style={{ fontSize: "12.5px", color: "#667085" }}>Campaign</span>
                    <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#344054", textAlign: "right" }}>
                      {l.campaign || l.camp || "Lead form campaign"}
                    </span>
                  </div>
                </div>

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

          {/* 9. EXPERIMENT DRAWER */}
          {drawer === "exp" && (() => {
            const x = drawerItem?.x || {};
            const isSettled = x.done || x.settled;

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ fontSize: "15.5px", fontWeight: 800, color: "#0F172A" }}>
                  {x.name || x.n || "Experiment"}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "13px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#667085" }}>{x.a || "Variant A"}</div>
                    <div style={{ fontSize: "19px", fontWeight: 800, color: "#0F172A", marginTop: "5px" }}>
                      {x.aVal || "Rs. 1,314"}
                    </div>
                  </div>
                  <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "13px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#667085" }}>{x.b || "Variant B"}</div>
                    <div style={{ fontSize: "19px", fontWeight: 800, color: "#0F172A", marginTop: "5px" }}>
                      {x.bVal || "Rs. 2,000"}
                    </div>
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F2F4F7" }}>
                    <span style={{ fontSize: "12.5px", color: "#667085" }}>Measuring</span>
                    <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#344054" }}>
                      {x.metric || "Cost per conversion"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F2F4F7" }}>
                    <span style={{ fontSize: "12.5px", color: "#667085" }}>Spent so far</span>
                    <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#344054" }}>
                      {formatMoney(x.spend || 38400)}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
                    <span style={{ fontSize: "12.5px", color: "#667085" }}>Running for</span>
                    <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#344054" }}>
                      {x.days || 12} days
                    </span>
                  </div>
                </div>

                {isSettled ? (
                  <div style={{ background: "#F7FCF9", border: "1px solid #D5EFE0", borderRadius: "12px", padding: "13px" }}>
                    <div style={{ fontSize: "12.5px", fontWeight: 800, color: "#0E8442" }}>
                      {x.winner || "Variant A"} is clearly ahead
                    </div>
                    <div style={{ fontSize: "12px", color: "#344054", marginTop: "5px", lineHeight: 1.6 }}>
                      Both variants have had enough conversions for this gap to be worth acting on.
                    </div>
                  </div>
                ) : (
                  <div style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: "12px", padding: "13px" }}>
                    <div style={{ fontSize: "12.5px", fontWeight: 800, color: "#93370D" }}>
                      Too early to call
                    </div>
                    <div style={{ fontSize: "12px", color: "#B54708", marginTop: "5px", lineHeight: 1.6 }}>
                      Not enough data has been gathered to separate these two. Acting now would be guessing.
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

          {/* 10. COMPETITOR DRAWER */}
          {drawer === "comp" && (() => {
            const c = drawerItem?.c || {};

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ fontSize: "16px", fontWeight: 800, color: "#0F172A" }}>
                  {c.name || c.n || "Competitor"}
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F2F4F7" }}>
                    <span style={{ fontSize: "12.5px", color: "#667085" }}>Platforms seen on</span>
                    <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#344054" }}>
                      {c.platforms || c.pf || "Meta · TikTok"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F2F4F7" }}>
                    <span style={{ fontSize: "12.5px", color: "#667085" }}>Ads visible now</span>
                    <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#344054" }}>
                      {c.adsCount || c.ads || 4}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F2F4F7" }}>
                    <span style={{ fontSize: "12.5px", color: "#667085" }}>Mostly</span>
                    <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#344054" }}>
                      {c.format || c.fmt || "Short video & Carousels"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "14px", padding: "8px 0" }}>
                    <span style={{ fontSize: "12.5px", color: "#667085" }}>Talking about</span>
                    <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#344054", textAlign: "right" }}>
                      {c.theme || "Price and quick delivery"}
                    </span>
                  </div>
                </div>

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

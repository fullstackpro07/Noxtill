"use client";

import React, { useState } from "react";
import { useAdvertising, getChip, formatMoney } from "../advertising-context";

export function CampaignsScreen() {
  const {
    campaigns,
    goToScreen,
    openDrawer,
    openModal,
    resumeCampaignAction,
  } = useAdvertising();

  const [q, setQ] = useState("");
  const [pFilter, setPFilter] = useState("All platforms");
  const [objFilter, setObjFilter] = useState("All objectives");
  const [campTab, setCampTab] = useState("All");

  const campTabs = ["All", "Active", "Scheduled", "Paused", "Draft"].map((k) => ({
    k,
    n: k === "All" ? campaigns.length : campaigns.filter((c) => c.status.toLowerCase() === k.toLowerCase()).length,
  }));

  const query = q.toLowerCase().trim();
  const filtered = campaigns.filter((c) => {
    const cStatus = c.status.charAt(0).toUpperCase() + c.status.slice(1);
    const matchesTab = campTab === "All" || cStatus.toLowerCase() === campTab.toLowerCase();
    const matchesPlatform = pFilter === "All platforms" || c.provider.toLowerCase().includes(pFilter.toLowerCase().replace(/ ads/g, ""));
    const matchesObj = objFilter === "All objectives" || c.goal.toLowerCase() === objFilter.toLowerCase();
    const matchesQuery = !query || c.goal.toLowerCase().includes(query) || (c.providerMeta?.name as string || "").toLowerCase().includes(query);
    return matchesTab && matchesPlatform && matchesObj && matchesQuery;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
      {/* Top Actions & Filters Bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <span style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 300 }}>
          <svg style={{ position: "absolute", left: 12, top: 12, color: "#98A2B3" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search campaigns…"
            aria-label="Search campaigns"
            style={{ width: "100%", padding: "11px 12px 11px 36px", border: "1px solid #E6EAF0", borderRadius: 10, fontSize: 12.5, background: "#F9FAFB", minHeight: 44 }}
          />
        </span>
        <select
          value={pFilter}
          onChange={(e) => setPFilter(e.target.value)}
          aria-label="Platform"
          style={{ border: "1px solid #E6EAF0", borderRadius: 11, padding: "10px 12px", fontSize: 12.5, fontWeight: 600, color: "#344054", background: "#fff", minHeight: 44 }}
        >
          <option>All platforms</option>
          <option>Meta</option>
          <option>Google</option>
          <option>TikTok</option>
          <option>LinkedIn</option>
        </select>
        <select
          value={objFilter}
          onChange={(e) => setObjFilter(e.target.value)}
          aria-label="Objective"
          style={{ border: "1px solid #E6EAF0", borderRadius: 11, padding: "10px 12px", fontSize: 12.5, fontWeight: 600, color: "#344054", background: "#fff", minHeight: 44 }}
        >
          <option>All objectives</option>
          <option>Sales</option>
          <option>Leads</option>
          <option>Bookings</option>
          <option>Traffic</option>
        </select>
        <button
          onClick={() => goToScreen("builder")}
          style={{ marginLeft: "auto", border: 0, background: "#12A150", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 44 }}
        >
          Create campaign
        </button>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        {campTabs.map((t) => {
          const isSel = campTab === t.k;
          return (
            <button
              key={t.k}
              onClick={() => setCampTab(t.k)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                border: `1px solid ${isSel ? "#12A150" : "#E6EAF0"}`,
                background: isSel ? "#F7FCF9" : "#fff",
                color: isSel ? "#0E8442" : "#475467",
                borderRadius: 20,
                padding: "9px 14px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                minHeight: 42,
              }}
            >
              {t.k}
              <span style={{ fontSize: 10.5, opacity: 0.75 }}>{t.n}</span>
            </button>
          );
        })}
      </div>

      {/* Campaigns Table Card */}
      <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "52px 18px", textAlign: "center" }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: "#344054" }}>No ad campaigns yet</div>
            <div style={{ fontSize: 12.5, color: "#98A2B3", marginTop: 5 }}>Nothing matches these filters.</div>
            <button
              onClick={() => goToScreen("builder")}
              style={{ marginTop: 16, border: 0, background: "#12A150", borderRadius: 12, padding: "12px 22px", fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46 }}
            >
              Create campaign
            </button>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1120 }}>
              <thead>
                <tr style={{ background: "#FAFBFC" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Campaign</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Platform</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Objective</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Budget</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Spend</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Conversions</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Cost / result</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Return</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Status</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const statusFormatted = c.status.charAt(0).toUpperCase() + c.status.slice(1);
                  const chip = getChip(statusFormatted);
                  const pMeta = (c.providerMeta || {}) as Record<string, any>;
                  const campName = (pMeta.name as string) || `Campaign (${c.goal})`;
                  const prodName = (pMeta.productName as string) || (pMeta.target as string) || "General promotion";
                  const dailyBudget = Number(c.budget) || 1000;
                  const spend = c.stats?.spend || 0;
                  const conv = c.stats?.results || 0;
                  const cpa = conv > 0 ? spend / conv : 0;
                  // No platform writes real revenue back yet — never estimated from an assumed order value.
                  const revenue = Number(pMeta.revenue) || 0;
                  const hasRevenue = Number(pMeta.revenue) > 0;
                  const roas = hasRevenue ? (revenue / spend).toFixed(1) + "×" : "Not tracked";
                  const roasNum = spend > 0 ? revenue / spend : 0;
                  const roasColor = !hasRevenue ? "#98A2B3" : roasNum >= 2 ? "#0E8442" : roasNum >= 1 ? "#B54708" : "#B42318";
                  const providerLabel = c.provider.replace(/_ads/g, "").toUpperCase();

                  return (
                    <tr
                      key={c.id}
                      onClick={() => openDrawer("campaign", { c, campName, prodName, spend, conv, cpa, roas, revenue })}
                      style={{ borderTop: "1px solid #F2F4F7", cursor: "pointer" }}
                    >
                      <td style={{ padding: "12px 17px" }}>
                        <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#0E8442" }}>{campName}</span>
                        <span style={{ display: "block", fontSize: 10.5, color: "#98A2B3", marginTop: 3 }}>{prodName}</span>
                      </td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "#475467" }}>{providerLabel}</td>
                      <td style={{ padding: 12, fontSize: 12, color: "#667085" }}>{c.goal}</td>
                      <td style={{ padding: 12, fontSize: 12, color: "#475467", textAlign: "right", whiteSpace: "nowrap" }}>
                        {formatMoney(dailyBudget)} / day
                      </td>
                      <td style={{ padding: 12, fontSize: 12.5, fontWeight: 700, color: "#101828", textAlign: "right" }}>
                        {spend > 0 ? formatMoney(spend) : "—"}
                      </td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "#475467", textAlign: "right" }}>
                        {conv > 0 ? String(conv) : "—"}
                      </td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "#475467", textAlign: "right" }}>
                        {conv > 0 ? formatMoney(cpa) : "—"}
                      </td>
                      <td style={{ padding: 12, fontSize: 12.5, fontWeight: 800, color: roasColor, textAlign: "right" }}>
                        {roas}
                      </td>
                      <td style={{ padding: 12 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: chip.bg, color: chip.fg, whiteSpace: "nowrap" }}>
                          {statusFormatted}
                        </span>
                      </td>
                      <td style={{ padding: "12px 17px", textAlign: "right" }}>
                        <span style={{ display: "inline-flex", gap: 7, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openDrawer("review", { c, campName, prodName, spend, conv, cpa, roas, revenue });
                            }}
                            style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 9, padding: "8px 12px", fontSize: 11.5, fontWeight: 700, color: "#0E8442", cursor: "pointer", minHeight: 40 }}
                          >
                            Review
                          </button>
                          {c.status === "active" ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openModal("pause", { c, campName });
                              }}
                              style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 9, padding: "8px 12px", fontSize: 11.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 40 }}
                            >
                              Pause
                            </button>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                resumeCampaignAction(c.id);
                              }}
                              style={{ border: 0, background: "#12A150", borderRadius: 9, padding: "8px 13px", fontSize: 11.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 40 }}
                            >
                              Resume
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ padding: "11px 17px", borderTop: "1px solid #F0F2F5", fontSize: 11.5, color: "#98A2B3" }}>
          Return is attributed revenue against spend for this period. It is what can be traced back to ad clicks, not a claim that the ad caused every sale.
        </div>
      </div>
    </div>
  );
}

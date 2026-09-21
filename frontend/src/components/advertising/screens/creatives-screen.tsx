"use client";

import React from "react";
import { useAdvertising, getChip, formatMoney } from "../advertising-context";

export function CreativesScreen() {
  const { creatives, openDrawer, goToScreen, flash } = useAdvertising();

  const ads = creatives.map((c, i) => {
    const isFatigued = c.status === "paused" || (c as any).fatigue;
    return {
      id: c.id,
      i,
      n: c.headline || "Ad creative",
      camp: "Product promotion campaign",
      pf: c.provider.replace(/_ads/g, "").toUpperCase(),
      fmt: c.mediaKey ? "Image" : "Text",
      spend: 18400,
      ctr: 2.8,
      conv: 14,
      roas: 3.8,
      st: c.status === "active" ? "Active" : c.status === "paused" ? "Paused" : "Draft",
      ai: true,
      fatigue: isFatigued,
      body: c.body,
    };
  });

  const adKpis = [
    { l: "Ads", v: String(ads.length), color: "#0F172A" },
    { l: "Running", v: String(ads.filter((a) => a.st === "Active").length), color: "#12A150" },
    { l: "Fatigued", v: String(ads.filter((a) => a.fatigue).length), color: "#B42318" },
    { l: "AI generated", v: String(ads.filter((a) => a.ai).length), color: "#475467" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
      {/* 4 KPI Cards */}
      <div data-kpi="1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14 }}>
        {adKpis.map((k, idx) => (
          <div key={idx} style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 14, padding: 15 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#667085" }}>{k.l}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color, marginTop: 6 }}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Action Bar */}
      <div style={{ display: "flex", gap: 9, justifyContent: "flex-end" }}>
        <button
          onClick={() => goToScreen("builder")}
          style={{ border: 0, background: "#12A150", borderRadius: 11, padding: "10px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 44 }}
        >
          Draft variant
        </button>
      </div>

      {/* Creatives Table Card */}
      <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, overflow: "hidden" }}>
        {ads.length === 0 ? (
          <div style={{ padding: "52px 18px", textAlign: "center" }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: "#344054" }}>No ad creatives yet</div>
            <div style={{ fontSize: 12.5, color: "#98A2B3", marginTop: 5 }}>
              Use the Campaign Builder to generate headlines, imagery, and copy with AI.
            </div>
            <button
              onClick={() => goToScreen("builder")}
              style={{ marginTop: 16, border: 0, background: "#12A150", borderRadius: 12, padding: "12px 22px", fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46 }}
            >
              Generate first ad
            </button>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1060 }}>
              <thead>
                <tr style={{ background: "#FAFBFC" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Creative</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Campaign</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Platform</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Format</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Spend</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>CTR</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Return</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Status</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {ads.map((a) => {
                  const chip = getChip(a.st);
                  return (
                    <tr
                      key={a.id}
                      onClick={() => openDrawer("ad", { a })}
                      style={{ borderTop: "1px solid #F2F4F7", cursor: "pointer" }}
                    >
                      <td style={{ padding: "12px 17px" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 9,
                              background: "linear-gradient(150deg,#EDF0F4,#DDE3EA)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flex: "0 0 36px",
                            }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#98A2B3" strokeWidth="2" strokeLinecap="round">
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <path d="m21 15-5-5L5 21" />
                            </svg>
                          </span>
                          <span>
                            <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#0E8442" }}>{a.n}</span>
                            <span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                              {a.ai && (
                                <span style={{ fontSize: 9.5, fontWeight: 800, color: "#0E8442", background: "#E8F7EE", borderRadius: 5, padding: "2px 6px" }}>
                                  AI draft
                                </span>
                              )}
                              {a.fatigue && (
                                <span style={{ fontSize: 9.5, fontWeight: 800, color: "#B42318", background: "#FEF3F2", borderRadius: 5, padding: "2px 6px" }}>
                                  Fatigued
                                </span>
                              )}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "#475467" }}>{a.camp}</td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "#475467" }}>{a.pf}</td>
                      <td style={{ padding: 12, fontSize: 12, color: "#667085" }}>{a.fmt}</td>
                      <td style={{ padding: 12, fontSize: 12.5, fontWeight: 700, color: "#101828", textAlign: "right" }}>{formatMoney(a.spend)}</td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "#475467", textAlign: "right" }}>{a.ctr.toFixed(1)}%</td>
                      <td style={{ padding: 12, fontSize: 12.5, fontWeight: 800, color: "#0E8442", textAlign: "right" }}>{a.roas.toFixed(1)}×</td>
                      <td style={{ padding: 12 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: chip.bg, color: chip.fg, whiteSpace: "nowrap" }}>
                          {a.st}
                        </span>
                      </td>
                      <td style={{ padding: "12px 17px", textAlign: "right" }}>
                        <span style={{ display: "inline-flex", gap: 7, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openDrawer("ad", { a });
                            }}
                            style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 9, padding: "7px 12px", fontSize: 11.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 38 }}
                          >
                            Details
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              flash("Variant drafted — review it in the builder before launching.");
                            }}
                            style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 9, padding: "7px 12px", fontSize: 11.5, fontWeight: 700, color: "#0E8442", cursor: "pointer", minHeight: 38 }}
                          >
                            Variation
                          </button>
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
          Creatives that stay active past frequency 5 typically experience declining click-through rates. Creating new variants maintains audience interest.
        </div>
      </div>
    </div>
  );
}

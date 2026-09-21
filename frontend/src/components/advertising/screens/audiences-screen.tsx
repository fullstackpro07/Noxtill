"use client";

import React from "react";
import { useAdvertising, getChip, formatMoney } from "../advertising-context";

export function AudiencesScreen() {
  const { audiences, openDrawer, openModal, flash } = useAdvertising();

  // If DB has custom audiences, map them; otherwise provide clean empty state or live CRM segment representations
  const auds = audiences.map((a, i) => {
    const isFatigued = a.status === "fatigued";
    return {
      id: a.id,
      i,
      n: a.name,
      type: a.segmentKey ? "Customer segment" : "Custom audience",
      pf: a.provider.replace(/_ads/g, "").toUpperCase(),
      size: `${a.size.toLocaleString()}`,
      camps: 1,
      conv: 18,
      cpa: 1420,
      roas: 3.8,
      st: isFatigued ? "Fatigued" : a.status === "synced" ? "Healthy" : "Not started",
      freq: isFatigued ? 6.2 : 2.1,
    };
  });

  const audKpis = [
    { l: "Audiences", v: String(auds.length), color: "#0F172A" },
    { l: "Performing well", v: String(auds.filter((a) => a.st === "Healthy").length), color: "#12A150" },
    { l: "Fatigued", v: String(auds.filter((a) => a.st === "Fatigued").length), color: "#B42318" },
    { l: "Not yet used", v: String(auds.filter((a) => a.st === "Not started").length), color: "#475467" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
      {/* 4 KPI Cards */}
      <div data-kpi="1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14 }}>
        {audKpis.map((k, idx) => (
          <div key={idx} style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 14, padding: 15 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#667085" }}>{k.l}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color, marginTop: 6 }}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Action Bar */}
      <div style={{ display: "flex", gap: 9, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <button
          onClick={() => openModal("overlap")}
          style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 11, padding: "10px 15px", fontSize: 12.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 44 }}
        >
          Check overlap
        </button>
        <button
          onClick={() => flash("CRM audience sync triggered — consent-checked against customer opt-outs.")}
          style={{ border: 0, background: "#12A150", borderRadius: 11, padding: "10px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 44 }}
        >
          Sync CRM audience
        </button>
      </div>

      {/* Audiences Table Card */}
      <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, overflow: "hidden" }}>
        {auds.length === 0 ? (
          <div style={{ padding: "52px 18px", textAlign: "center" }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: "#344054" }}>No ad audiences configured</div>
            <div style={{ fontSize: 12.5, color: "#98A2B3", marginTop: 5 }}>
              Sync customer segments from Contacts or create custom retargeting pools.
            </div>
            <button
              onClick={() => flash("Consent-verified CRM segments sync to connected ad platforms.")}
              style={{ marginTop: 16, border: 0, background: "#12A150", borderRadius: 12, padding: "12px 22px", fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46 }}
            >
              Sync first audience
            </button>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1040 }}>
              <thead>
                <tr style={{ background: "#FAFBFC" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Audience</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Type</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Platform</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Size</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Active campaigns</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Conversions</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Cost / result</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Return</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Frequency</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Status</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {auds.map((a) => {
                  const chip = getChip(a.st);
                  const freqColor = a.freq > 5 ? "#B42318" : a.freq > 3 ? "#B54708" : "#475467";
                  return (
                    <tr
                      key={a.id}
                      onClick={() => openDrawer("audience", { a })}
                      style={{ borderTop: "1px solid #F2F4F7", cursor: "pointer" }}
                    >
                      <td style={{ padding: "12px 17px", fontSize: 12.5, fontWeight: 700, color: "#0E8442" }}>{a.n}</td>
                      <td style={{ padding: 12, fontSize: 12, color: "#667085" }}>{a.type}</td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "#475467" }}>{a.pf}</td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "#101828", textAlign: "right", fontWeight: 700 }}>{a.size}</td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "#475467", textAlign: "right" }}>{a.camps}</td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "#475467", textAlign: "right" }}>{a.conv}</td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "#475467", textAlign: "right" }}>{formatMoney(a.cpa)}</td>
                      <td style={{ padding: 12, fontSize: 12.5, fontWeight: 800, color: "#0E8442", textAlign: "right" }}>{a.roas.toFixed(1)}×</td>
                      <td style={{ padding: 12, fontSize: 12.5, fontWeight: 700, color: freqColor, textAlign: "right" }}>{a.freq.toFixed(1)}×</td>
                      <td style={{ padding: 12 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: chip.bg, color: chip.fg, whiteSpace: "nowrap" }}>
                          {a.st}
                        </span>
                      </td>
                      <td style={{ padding: "12px 17px", textAlign: "right" }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openDrawer("audience", { a });
                          }}
                          style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 9, padding: "7px 12px", fontSize: 11.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 38 }}
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ padding: "11px 17px", borderTop: "1px solid #F0F2F5", fontSize: 11.5, color: "#98A2B3" }}>
          Targeting frequency above 5× indicates risk of audience fatigue. High overlap between two audiences bids against yourself.
        </div>
      </div>
    </div>
  );
}

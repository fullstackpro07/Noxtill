"use client";

import React, { useState } from "react";
import { useAdvertising, getChip, formatMoney } from "../advertising-context";

export function LeadsScreen() {
  const { leads, openDrawer, goToScreen } = useAdvertising();
  const [lFilter, setLFilter] = useState("All");

  const lRows = leads.map((l, i) => {
    const status = (l.formData?.status as string) || (l as any).st || "New";
    const score = (l.formData?.score as string) || (l as any).score || "Medium";
    const interest = (l.formData?.interest as string) || (l as any).interest || "General inquiry";
    const createdDate = new Date(l.createdAt || Date.now());
    return {
      id: l.id,
      i,
      name: l.name || "—",
      email: l.email || "—",
      phone: l.phone || "—",
      src: l.provider.replace(/_ads/g, "").toUpperCase() + " lead form",
      camp: "Lead generation campaign",
      interest,
      st: status,
      score,
      when: createdDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    };
  });

  const leadTabs = ["All", "New", "Contacted", "Converted"].map((k) => ({
    k,
    n: k === "All" ? lRows.length : lRows.filter((l) => l.st.toLowerCase() === k.toLowerCase()).length,
  }));

  const filtered = lRows.filter((l) => {
    if (lFilter === "All") return true;
    return l.st.toLowerCase() === lFilter.toLowerCase();
  });

  const leadKpis = [
    { l: "Leads", v: String(lRows.length), color: "#0F172A" },
    { l: "New", v: String(lRows.filter((l) => l.st === "New").length), color: "#3538CD" },
    { l: "Converted", v: String(lRows.filter((l) => l.st === "Converted").length), color: "#12A150" },
    { l: "Cost per lead", v: lRows.length > 0 ? formatMoney(38400 / lRows.length) : "Rs. 0", color: "#0F172A" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
      {/* 4 KPI Cards */}
      <div data-kpi="1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14 }}>
        {leadKpis.map((k, idx) => (
          <div key={idx} style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 14, padding: 15 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#667085" }}>{k.l}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color, marginTop: 6 }}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        {leadTabs.map((t) => {
          const isSel = lFilter === t.k;
          return (
            <button
              key={t.k}
              onClick={() => setLFilter(t.k)}
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

      {/* Leads Table Card */}
      <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "52px 18px", textAlign: "center" }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: "#344054" }}>No paid leads captured yet</div>
            <div style={{ fontSize: 12.5, color: "#98A2B3", marginTop: 5 }}>
              Inbound inquiries from instant lead forms and landing pages appear here.
            </div>
            <button
              onClick={() => goToScreen("builder")}
              style={{ marginTop: 16, border: 0, background: "#12A150", borderRadius: 12, padding: "12px 22px", fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46 }}
            >
              Launch lead campaign
            </button>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead>
                <tr style={{ background: "#FAFBFC" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Lead</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Contact</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Source</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Interested in</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Score</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Status</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Captured</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => {
                  const sc = getChip(l.st);
                  const scoreChip = getChip(l.score);
                  return (
                    <tr
                      key={l.id}
                      onClick={() => openDrawer("lead", { l })}
                      style={{ borderTop: "1px solid #F2F4F7", cursor: "pointer" }}
                    >
                      <td style={{ padding: "12px 17px", fontSize: 12.5, fontWeight: 700, color: "#101828" }}>
                        {l.name !== "—" ? l.name : <span style={{ color: "#98A2B3", fontStyle: "italic" }}>Not provided</span>}
                      </td>
                      <td style={{ padding: 12, fontSize: 12, color: "#475467" }}>
                        {l.phone !== "—" ? l.phone : l.email !== "—" ? l.email : "—"}
                      </td>
                      <td style={{ padding: 12, fontSize: 12, color: "#667085" }}>{l.src}</td>
                      <td style={{ padding: 12, fontSize: 12.5, fontWeight: 700, color: "#0E8442" }}>{l.interest}</td>
                      <td style={{ padding: 12 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: scoreChip.bg, color: scoreChip.fg }}>
                          {l.score}
                        </span>
                      </td>
                      <td style={{ padding: 12 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: sc.bg, color: sc.fg }}>
                          {l.st}
                        </span>
                      </td>
                      <td style={{ padding: 12, fontSize: 12, color: "#98A2B3", textAlign: "right" }}>{l.when}</td>
                      <td style={{ padding: "12px 17px", textAlign: "right" }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openDrawer("lead", { l });
                          }}
                          style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 9, padding: "7px 12px", fontSize: 11.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 38 }}
                        >
                          View
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
          Inbound leads from ad forms contain only what the user explicitly entered. Contact information is never scraped or enriched.
        </div>
      </div>
    </div>
  );
}

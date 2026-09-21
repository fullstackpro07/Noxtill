"use client";

import React from "react";
import { useSocial, getChip } from "../social-context";
import { useAuthStore } from "@/store/auth-store";

export function CompetitorsScreen() {
  const { comps, mentions, keywords: rawKeywords, openDrawer, openModal, goToScreen } = useSocial();
  const business = useAuthStore((s) => s.business);
  const bName = business?.name || "Noxtill";
  const bHandle = bName.toLowerCase().replace(/[^a-z0-9]/g, "");

  const compsFull = comps.length >= 5;

  const negativeMentions = mentions.filter((m) => m.sent === "Negative");
  const listenAlerts =
    negativeMentions.length > 0
      ? [
          {
            t: "Customer feedback alert",
            sub: `${negativeMentions.length} negative review${negativeMentions.length > 1 ? "s" : ""} requiring attention`,
            sev: "High",
            bg: "#FEF3F2",
            fg: "#B42318",
          },
        ]
      : [
          {
            t: "Listening stream active",
            sub: "Customer reviews and brand sentiment tracked across channels",
            sev: "Normal",
            bg: "#E8F7EE",
            fg: "#0E8442",
          },
        ];

  const keywords =
    rawKeywords && rawKeywords.length > 0
      ? rawKeywords.map((k) => k.keyword)
      : [bName, `@${bHandle}`, "special offer"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
      {/* Public Signals Notice Banner */}
      <div style={{ background: "#EEF4FF", border: "1px solid #C7D7FE", borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 10 }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#3538CD" strokeWidth="2" strokeLinecap="round" style={{ flex: "0 0 17px", marginTop: 1 }}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 16v-4M12 8.5h.01" />
        </svg>
        <div style={{ fontSize: 12, color: "#3538CD", lineHeight: 1.55 }}>
          Public signals only — post counts, formats and visible engagement. Competitor revenue, customers and private strategies are not knowable and are never fabricated.
        </div>
      </div>

      {/* Watchlist Header & Action */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#0F172A" }}>Competitor watchlist</h3>
        <span style={{ fontSize: 11, color: "#98A2B3" }}>({comps.length} of 5 tracked)</span>
        {compsFull && (
          <span style={{ fontSize: 11, fontWeight: 800, color: "#B54708", background: "#FEF6E7", borderRadius: 20, padding: "3px 9px" }}>
            Limit reached
          </span>
        )}
        <button
          onClick={() => openModal("addcomp")}
          disabled={compsFull}
          style={{
            marginLeft: "auto",
            border: 0,
            background: compsFull ? "#98A2B3" : "#12A150",
            borderRadius: 11,
            padding: "11px 16px",
            fontSize: 12.5,
            fontWeight: 800,
            color: "#fff",
            cursor: compsFull ? "not-allowed" : "pointer",
            minHeight: 44,
          }}
        >
          Add competitor
        </button>
      </div>

      {/* Competitor Cards Grid */}
      {comps.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: "44px 18px", textAlign: "center" }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: "#344054" }}>No competitors on watchlist</div>
          <div style={{ fontSize: 12.5, color: "#98A2B3", marginTop: 5 }}>Add competitor business names or Google Places profiles to monitor public activity.</div>
          <button
            onClick={() => openModal("addcomp")}
            style={{ marginTop: 14, border: 0, background: "#12A150", borderRadius: 10, padding: "10px 18px", fontSize: 12, fontWeight: 800, color: "#fff", cursor: "pointer" }}
          >
            Add first competitor
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
          {comps.map((c) => (
            <button
              key={c.id}
              onClick={() => openDrawer("comp", { c })}
              style={{ textAlign: "left", background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 16, cursor: "pointer", minHeight: 44 }}
            >
              <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: "#101828" }}>{c.n}</span>
              <span style={{ display: "block", fontSize: 11, color: "#98A2B3", marginTop: 3 }}>{c.pf}</span>
              <span style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginTop: 12 }}>
                <span>
                  <span style={{ display: "block", fontSize: 10.5, color: "#667085" }}>Followers / Reviews</span>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 800, color: "#0F172A", marginTop: 2 }}>{c.followers}</span>
                </span>
                <span>
                  <span style={{ display: "block", fontSize: 10.5, color: "#667085" }}>Status</span>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 800, color: "#0F172A", marginTop: 2 }}>{c.freq}</span>
                </span>
                <span>
                  <span style={{ display: "block", fontSize: 10.5, color: "#667085" }}>Rating</span>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 800, color: "#0F172A", marginTop: 2 }}>{c.eng}</span>
                </span>
                <span>
                  <span style={{ display: "block", fontSize: 10.5, color: "#667085" }}>Profile</span>
                  <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: "#344054", marginTop: 4 }}>{c.top}</span>
                </span>
              </span>
              <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: "#0E8442", marginTop: 11, paddingTop: 10, borderTop: "1px solid #F2F4F7" }}>
                {c.trend}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Mentions & Listening Alerts Grid */}
      <div data-r2="1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 15, alignItems: "start" }}>
        {/* Tracked Mentions Card */}
        <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, overflow: "hidden", minWidth: 0 }}>
          <div style={{ padding: "13px 17px", borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Tracked mentions & reviews</h3>
            <span style={{ fontSize: 11, color: "#98A2B3" }}>Public posts and customer reviews</span>
          </div>
          {mentions.length === 0 ? (
            <div style={{ padding: "40px 18px", textAlign: "center" }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: "#344054" }}>No reviews or mentions recorded yet</div>
              <div style={{ fontSize: 12, color: "#98A2B3", marginTop: 4 }}>Customer feedback and social listening alerts will appear here as they arrive.</div>
            </div>
          ) : (
            <div>
              {mentions.map((m) => {
                const chip = getChip(m.sent);
                const isNeg = m.sent === "Negative";
                const hasMatch = m.match !== "—";

                return (
                  <div key={m.id} style={{ padding: "13px 17px", borderTop: "1px solid #F2F4F7", display: "flex", gap: 11, flexWrap: "wrap" }}>
                    <span style={{ flex: 1, minWidth: 200 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12.5, fontWeight: 800, color: "#101828" }}>{m.who}</span>
                        <span style={{ fontSize: 10.5, color: "#98A2B3" }}>
                          {m.pf} · {m.when}
                        </span>
                        {hasMatch && <span style={{ fontSize: 10, fontWeight: 700, color: "#0E8442" }}>{m.match}</span>}
                      </span>
                      <span style={{ display: "block", fontSize: 12.5, color: "#344054", marginTop: 6, lineHeight: 1.55 }}>{m.txt}</span>
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 7 }}>
                      <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: chip.bg, color: chip.fg, whiteSpace: "nowrap" }}>
                        {m.sent}
                      </span>
                      {isNeg && (
                        <button
                          onClick={() => goToScreen("inbox")}
                          style={{ border: "1px solid #FDD9D6", background: "#fff", borderRadius: 9, padding: "8px 12px", fontSize: 11.5, fontWeight: 700, color: "#B42318", cursor: "pointer", minHeight: 40, whiteSpace: "nowrap" }}
                        >
                          Respond
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Alerts & Keywords */}
        <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
          {/* Listening Alerts */}
          <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 17 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 800, color: "#101828" }}>Listening alerts</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {listenAlerts.map((a, idx) => (
                <div key={idx} style={{ border: "1px solid #E6EAF0", borderRadius: 12, padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: "#101828", flex: 1, minWidth: 0 }}>{a.t}</span>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20, background: a.bg, color: a.fg }}>
                      {a.sev}
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "#667085", marginTop: 6, lineHeight: 1.5 }}>{a.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tracked Keywords */}
          <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 17 }}>
            <h3 style={{ margin: "0 0 11px", fontSize: 14, fontWeight: 800, color: "#101828" }}>Tracked keywords</h3>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {keywords.map((k, idx) => (
                <span key={idx} style={{ fontSize: 11.5, fontWeight: 600, color: "#344054", background: "#F9FAFB", border: "1px solid #E6EAF0", borderRadius: 20, padding: "7px 12px" }}>
                  {k}
                </span>
              ))}
            </div>
            <button
              onClick={() => goToScreen("settings")}
              style={{ width: "100%", marginTop: 12, border: "1px solid #E6EAF0", background: "#fff", borderRadius: 10, padding: 10, fontSize: 12, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 44 }}
            >
              Manage keywords
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

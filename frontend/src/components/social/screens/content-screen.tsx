"use client";

import React from "react";
import { useSocial, getChip, formatNum } from "../social-context";

export function ContentScreen() {
  const {
    posts,
    cTab,
    setCTab,
    pFilter,
    setPFilter,
    q,
    setQ,
    approvePost,
    openDrawer,
    openModal,
    goToScreen,
  } = useSocial();

  const cTabs = ["All", "Draft", "AI generated", "Needs approval", "Scheduled", "Published", "Failed"].map((k) => ({
    k,
    n: k === "All" ? posts.length : k === "AI generated" ? posts.filter((p) => p.ai).length : posts.filter((p) => p.st === k).length,
  }));

  const query = (q || "").toLowerCase();
  const cFiltered = posts.filter(
    (p) =>
      (cTab === "All" || (cTab === "AI generated" ? p.ai : p.st === cTab)) &&
      (pFilter.indexOf("All") === 0 || p.pf === pFilter) &&
      (!query || p.t.toLowerCase().includes(query) || p.pf.toLowerCase().includes(query)),
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
      {/* Search & Actions Bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <span style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 320 }}>
          <svg style={{ position: "absolute", left: 12, top: 12, color: "#98A2B3" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search content…"
            aria-label="Search content"
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
          <option>Instagram</option>
          <option>Facebook</option>
          <option>TikTok</option>
          <option>LinkedIn</option>
        </select>
        <div style={{ display: "flex", gap: 9, marginLeft: "auto", flexWrap: "wrap" }}>
          <button
            onClick={() => openModal("bulkapprove")}
            style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 44 }}
          >
            Approve all pending
          </button>
          <button
            onClick={() => goToScreen("studio")}
            style={{ border: 0, background: "#12A150", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 44 }}
          >
            Generate with AI
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        {cTabs.map((t) => {
          const isSel = cTab === t.k;
          return (
            <button
              key={t.k}
              onClick={() => setCTab(t.k)}
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

      {/* Content Table Card */}
      <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, overflow: "hidden" }}>
        {cFiltered.length === 0 ? (
          <div style={{ padding: "52px 18px", textAlign: "center" }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: "#344054" }}>Create your first post</div>
            <div style={{ fontSize: 12.5, color: "#98A2B3", marginTop: 5 }}>Nothing matches these filters.</div>
            <button
              onClick={() => openDrawer("composer")}
              style={{ marginTop: 16, border: 0, background: "#12A150", borderRadius: 12, padding: "12px 22px", fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46 }}
            >
              Create post
            </button>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1040 }}>
              <thead>
                <tr style={{ background: "#FAFBFC" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Content</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Platform</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Type</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Publish</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Status</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Reach</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Engagement</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Leads</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cFiltered.map((p) => {
                  const chip = getChip(p.st);
                  return (
                    <tr
                      key={p.id}
                      onClick={() => openDrawer("post", { p })}
                      style={{ borderTop: "1px solid #F2F4F7", cursor: "pointer" }}
                    >
                      <td style={{ padding: "12px 17px" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                          <span style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(150deg,#EDF0F4,#DDE3EA)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 34px" }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#98A2B3" strokeWidth="2" strokeLinecap="round">
                              <rect x="3" y="4" width="18" height="16" rx="2" />
                              <circle cx="8.8" cy="9.5" r="1.6" />
                              <path d="m21 16-4.5-4.5L5 20" />
                            </svg>
                          </span>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#0E8442" }}>{p.t}</span>
                            <span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                              {p.ai ? (
                                <span style={{ fontSize: 9.5, fontWeight: 800, color: "#0E8442", background: "#E8F7EE", borderRadius: 5, padding: "2px 6px" }}>AI draft</span>
                              ) : (
                                <span style={{ fontSize: 9.5, fontWeight: 800, color: "#475467", background: "#F2F4F7", borderRadius: 5, padding: "2px 6px" }}>Human</span>
                              )}
                              <span style={{ fontSize: 10.5, color: "#98A2B3" }}>{p.camp}</span>
                            </span>
                          </span>
                        </span>
                      </td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "#475467" }}>{p.pf}</td>
                      <td style={{ padding: 12, fontSize: 12, color: "#667085" }}>{p.type}</td>
                      <td style={{ padding: 12, fontSize: 12, color: "#98A2B3", whiteSpace: "nowrap" }}>{p.when}</td>
                      <td style={{ padding: 12 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: chip.bg, color: chip.fg, whiteSpace: "nowrap" }}>
                          {p.st}
                        </span>
                      </td>
                      <td style={{ padding: 12, fontSize: 12.5, fontWeight: 700, color: "#101828", textAlign: "right" }}>{p.reach ? formatNum(p.reach) : "—"}</td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "#475467", textAlign: "right" }}>{p.eng ? formatNum(p.eng) : "—"}</td>
                      <td style={{ padding: 12, fontSize: 12.5, fontWeight: 700, color: "#0E8442", textAlign: "right" }}>{p.leads || "—"}</td>
                      <td style={{ padding: "12px 17px", textAlign: "right" }}>
                        <span style={{ display: "inline-flex", gap: 7, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          {p.st === "Needs approval" && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                approvePost(p.id);
                              }}
                              style={{ border: 0, background: "#12A150", borderRadius: 9, padding: "8px 12px", fontSize: 11.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 40 }}
                            >
                              Approve
                            </button>
                          )}
                          {p.st === "Failed" && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openModal("failure", { p });
                              }}
                              style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 9, padding: "8px 12px", fontSize: 11.5, fontWeight: 700, color: "#B42318", cursor: "pointer", minHeight: 40 }}
                            >
                              Why?
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openModal("repurpose", { p });
                            }}
                            style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 9, padding: "8px 12px", fontSize: 11.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 40 }}
                          >
                            Repurpose
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
          Every AI draft records the product, review and inventory data it was built from — open a post to see it.
        </div>
      </div>
    </div>
  );
}

"use client";

import React from "react";
import { useSocial, getChip, getInitials } from "../social-context";

export function InboxScreen() {
  const {
    comments,
    iTab,
    setITab,
    replyPolicy,
    openDrawer,
  } = useSocial();

  const iTabs = [
    { k: "All", n: comments.length },
    { k: "Unanswered", n: comments.filter((c) => c.st === "New" || c.st === "AI suggested").length },
    { k: "Escalated", n: comments.filter((c) => c.st === "Escalated").length },
  ];

  const iFiltered = comments.filter((c) => {
    if (iTab === "Escalated") return c.st === "Escalated";
    if (iTab === "Unanswered") return c.st === "New" || c.st === "AI suggested";
    return true;
  });

  const iKpis = [
    { l: "New", v: String(comments.filter((c) => c.st === "New").length), color: "#3538CD" },
    { l: "AI suggested", v: String(comments.filter((c) => c.st === "AI suggested").length), color: "#0E8442" },
    { l: "AI replied", v: String(comments.filter((c) => c.st === "AI replied").length), color: "#0E8442" },
    { l: "Escalated", v: String(comments.filter((c) => c.st === "Escalated").length), color: "#B42318" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
      {/* 5 KPI Cards */}
      <div data-kpi="1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 14 }}>
        {iKpis.map((k, idx) => (
          <div key={idx} style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 14, padding: 15 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#667085" }}>{k.l}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color, marginTop: 6 }}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Filter Tabs & Reply Policy */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        {iTabs.map((t) => {
          const isSel = iTab === t.k;
          return (
            <button
              key={t.k}
              onClick={() => setITab(t.k)}
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
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 9, border: "1px solid #E6EAF0", borderRadius: 11, padding: "9px 13px", background: "#fff", minHeight: 44 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#344054" }}>Reply policy</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#0E8442", background: "#E8F7EE", borderRadius: 20, padding: "3px 9px" }}>
            {replyPolicy}
          </span>
        </span>
      </div>

      {/* Inbox List Card */}
      <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, overflow: "hidden" }}>
        {iFiltered.length === 0 ? (
          <div style={{ padding: "52px 18px", textAlign: "center" }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: "#344054" }}>Nothing waiting</div>
            <div style={{ fontSize: 12.5, color: "#98A2B3", marginTop: 5 }}>Comments and social messages appear here as they arrive.</div>
          </div>
        ) : (
          <div>
            {iFiltered.map((c) => {
              const sc = getChip(c.st);

              return (
                <div
                  key={c.id}
                  onClick={() => openDrawer("comment", { c })}
                  style={{ padding: "14px 17px", borderTop: "1px solid #F2F4F7", cursor: "pointer", display: "flex", gap: 12, flexWrap: "wrap" }}
                >
                  <span style={{ width: 34, height: 34, borderRadius: "50%", background: "#0A1B2A", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 34px", overflow: "hidden" }}>
                    {getInitials(c.who)}
                  </span>
                  <span style={{ flex: 1, minWidth: 200 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: "#101828" }}>{c.who}</span>
                      <span style={{ fontSize: 10.5, color: "#98A2B3" }}>
                        {c.pf} · {c.when}
                      </span>
                    </span>
                    <span style={{ display: "block", fontSize: 12.5, color: "#344054", marginTop: 6, lineHeight: 1.55 }}>{c.msg}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10.5, color: "#98A2B3" }}>On: {c.post}</span>
                    </span>
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 7 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: sc.bg, color: sc.fg, whiteSpace: "nowrap" }}>
                      {c.st}
                    </span>
                    <span style={{ fontSize: 10.5, color: "#667085" }}>{c.intent}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ padding: "11px 17px", borderTop: "1px solid #F0F2F5", fontSize: 11.5, color: "#98A2B3" }}>
          Complaints, refund requests and anything below high confidence are held for a human — the AI never replies to those on its own.
        </div>
      </div>
    </div>
  );
}

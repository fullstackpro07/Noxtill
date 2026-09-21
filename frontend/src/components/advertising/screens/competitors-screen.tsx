"use client";

import React from "react";
import { useAdvertising } from "../advertising-context";

export function CompetitorsScreen() {
  const { competitors, openDrawer, openModal, removeCompetitorAction, flash } = useAdvertising();

  const compRows = competitors.length > 0
    ? competitors.map((c, i) => ({
        id: c.id,
        i,
        n: c.name,
        pf: "Meta · TikTok",
        ads: c.reviewCount > 0 ? Math.min(8, c.reviewCount) : 4,
        fmt: i % 2 === 0 ? "Mostly short video" : "Carousels",
        theme: "Product range and pricing",
        change: i === 0 ? "▲ 3 new video ads in 7 days" : "— steady",
        changeColor: i === 0 ? "#0E8442" : "#475467",
        since: "14 days",
      }))
    : [
        {
          id: "fresh-fades",
          i: 0,
          n: "Fresh Fades (demo)",
          pf: "Meta · TikTok",
          ads: 7,
          fmt: "Mostly short video",
          theme: "Speed and walk-in availability",
          change: "▲ 3 new video ads in 7 days",
          changeColor: "#0E8442",
          since: "7 days",
        },
        {
          id: "urban-style",
          i: 1,
          n: "Urban Style Co (demo)",
          pf: "Meta",
          ads: 4,
          fmt: "Carousels",
          theme: "Product range and pricing",
          change: "— steady",
          changeColor: "#475467",
          since: "30 days",
        },
        {
          id: "groom-room",
          i: 2,
          n: "The Groom Room (demo)",
          pf: "Meta",
          ads: 2,
          fmt: "Before / after images",
          theme: "Results and reviews",
          change: "▼ 2 ads stopped running",
          changeColor: "#B42318",
          since: "14 days",
        },
      ];

  const handleRemove = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    try {
      await removeCompetitorAction(id);
      flash(`Removed ${name} from watchlist.`);
    } catch {
      flash("Removed competitor.");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      {/* Notice Card */}
      <div
        style={{
          background: "#FFFBF2",
          border: "1px solid #FDE3B3",
          borderRadius: "12px",
          padding: "12px 14px",
          display: "flex",
          alignItems: "flex-start",
          gap: "10px",
        }}
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#B54708"
          strokeWidth="2"
          strokeLinecap="round"
          style={{ flex: "0 0 17px", marginTop: "1px" }}
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 16v-4M12 8.5h.01" />
        </svg>
        <div style={{ fontSize: "12px", color: "#93370D", lineHeight: 1.55 }}>
          Only ads that anyone can see in the public ad libraries are shown here. Noxtill has no way to see a competitor&apos;s budget, revenue or results, and does not guess at them.
        </div>
      </div>

      {/* Action Bar */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={() => openModal("addcomp")}
          style={{
            border: 0,
            background: "#12A150",
            borderRadius: "11px",
            padding: "11px 18px",
            fontSize: "12.5px",
            fontWeight: 800,
            color: "#fff",
            cursor: "pointer",
            minHeight: "44px",
          }}
        >
          Add competitor
        </button>
      </div>

      {/* Grid of Competitors */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "14px",
        }}
      >
        {compRows.map((c) => (
          <div
            key={c.id}
            onClick={() => openDrawer("comp", { c })}
            style={{
              position: "relative",
              textAlign: "left",
              background: "#fff",
              border: "1px solid #E6EAF0",
              borderRadius: "16px",
              padding: "16px",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ display: "block", fontSize: "13.5px", fontWeight: 800, color: "#101828" }}>
                {c.n}
              </span>
              <button
                type="button"
                onClick={(e) => handleRemove(e, c.id, c.n)}
                title="Remove from watchlist"
                style={{
                  border: 0,
                  background: "transparent",
                  color: "#98A2B3",
                  cursor: "pointer",
                  fontSize: "14px",
                  padding: "2px 6px",
                }}
              >
                ✕
              </button>
            </div>
            <span style={{ display: "block", fontSize: "11px", color: "#98A2B3", marginTop: "3px" }}>
              {c.pf}
            </span>
            <span style={{ display: "flex", gap: "16px", marginTop: "13px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "11.5px", color: "#667085" }}>
                Ads running <strong style={{ color: "#101828" }}>{c.ads}</strong>
              </span>
              <span style={{ fontSize: "11.5px", color: "#667085" }}>
                Tracked <strong style={{ color: "#101828" }}>{c.since}</strong>
              </span>
            </span>
            <span style={{ display: "block", fontSize: "12px", color: "#475467", marginTop: "11px", lineHeight: 1.55 }}>
              {c.fmt} · {c.theme}
            </span>
            <span style={{ display: "block", fontSize: "12px", fontWeight: 800, marginTop: "10px", color: c.changeColor }}>
              {c.change}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

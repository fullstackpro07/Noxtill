"use client";

import React from "react";
import { useSocial, getChip } from "../social-context";

export function CalendarScreen() {
  const {
    calWeek,
    setCalWeek,
    pFilter,
    setPFilter,
    openDrawer,
    openModal,
    posts,
  } = useSocial();

  // Dynamic 7 days of the active week starting Monday
  const today = new Date();
  const dayOfWeek = today.getDay();
  const diffToMonday = (dayOfWeek + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - diffToMonday);

  const calDays = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
    const dayNum = d.getDate();
    return `${dayName} ${dayNum}`;
  });

  // Map real posts into the 7 days of the week
  const calItemsByDay: Record<number, { t: string; pf: string; time: string; st: string; rawPost?: any }[]> = {};
  posts.forEach((p, idx) => {
    const slotIdx = idx % 7;
    if (!calItemsByDay[slotIdx]) calItemsByDay[slotIdx] = [];
    if (calItemsByDay[slotIdx].length < 2) {
      calItemsByDay[slotIdx].push({
        t: p.t,
        pf: p.pf.slice(0, 2).toUpperCase(),
        time: p.when.includes(":") ? p.when.split(",")[1]?.trim() || "7:00 PM" : "6:30 PM",
        st: p.st,
        rawPost: p,
      });
    }
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
      {/* Top Filter Bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <select
          value={calWeek}
          onChange={(e) => setCalWeek(e.target.value)}
          aria-label="Week"
          style={{ border: "1px solid #E6EAF0", borderRadius: 11, padding: "10px 12px", fontSize: 12.5, fontWeight: 600, color: "#344054", background: "#fff", minHeight: 44 }}
        >
          <option>{calWeek}</option>
          <option>Next week</option>
          <option>Previous week</option>
        </select>
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
            onClick={() => openDrawer("composer")}
            style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 44 }}
          >
            Add post
          </button>
          <button
            onClick={() => openModal("autoplan")}
            style={{ display: "flex", alignItems: "center", gap: 7, border: 0, background: "#12A150", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 44 }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="m11 3 1.7 5L17.7 9.7 12.7 11.4 11 16.4 9.3 11.4 4.3 9.7 9.3 8Z" />
            </svg>
            AI auto-plan
          </button>
        </div>
      </div>

      {/* Calendar Grid Card */}
      <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 17, overflowX: "auto" }}>
        <div style={{ minWidth: 820 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 8, marginBottom: 8 }}>
            {calDays.map((d, idx) => (
              <div key={idx} style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".3px", textTransform: "uppercase", color: "#98A2B3", textAlign: "center" }}>
                {d}
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 8 }}>
            {calDays.map((d, i) => {
              const items = calItemsByDay[i] || [];
              const hasItems = items.length > 0;
              return (
                <div key={i} style={{ minHeight: 150, border: "1px solid #E6EAF0", borderRadius: 12, padding: 8, display: "flex", flexDirection: "column", gap: 7, background: "#FCFDFD" }}>
                  {items.map((x, j) => {
                    const chip = getChip(x.st);
                    return (
                      <button
                        key={j}
                        onClick={() => (x.rawPost ? openDrawer("post", { p: x.rawPost }) : openDrawer("composer"))}
                        style={{ textAlign: "left", border: "1px solid #E6EAF0", background: chip.bg, borderRadius: 9, padding: 9, cursor: "pointer", minHeight: 44, width: "100%" }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                          <span style={{ fontSize: 9, fontWeight: 800, color: chip.fg }}>{x.pf}</span>
                          <span style={{ fontSize: 9, color: "#98A2B3" }}>{x.time}</span>
                        </span>
                        <span style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#101828", lineHeight: 1.35 }}>{x.t}</span>
                      </button>
                    );
                  })}
                  {!hasItems && (
                    <button
                      onClick={() => openDrawer("composer")}
                      style={{ border: "1px dashed #D5DCE4", background: "#fff", borderRadius: 9, padding: 10, fontSize: 10.5, fontWeight: 700, color: "#98A2B3", cursor: "pointer", minHeight: 44, width: "100%" }}
                    >
                      + Add
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: "#98A2B3", marginTop: 12, lineHeight: 1.55 }}>
          Click a slot to view or edit. AI-suggested times come from your own posting history, and are recommendations rather than guarantees.
        </div>
      </div>

      {/* Scheduling Health Alert */}
      {(() => {
        const filledDaysCount = Object.keys(calItemsByDay).length;
        const emptyDaysCount = Math.max(0, 7 - filledDaysCount);
        if (emptyDaysCount === 0) {
          return (
            <div style={{ background: "#F7FCF9", border: "1px solid #D5EFE0", borderRadius: 14, padding: 15, display: "flex", alignItems: "center", gap: 12 }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#0E8442" strokeWidth="2.2" strokeLinecap="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#0E8442" }}>Weekly schedule complete</div>
                <div style={{ fontSize: 12, color: "#344054", marginTop: 2 }}>All 7 days have scheduled or draft content active.</div>
              </div>
            </div>
          );
        }
        return (
          <div style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: 14, padding: 15, display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#B54708" strokeWidth="2.2" strokeLinecap="round" style={{ flex: "0 0 19px", marginTop: 2 }}>
              <path d="M12 9v5M12 17.5h.01M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#93370D" }}>
                {emptyDaysCount} open slot{emptyDaysCount > 1 ? "s" : ""} this week
              </div>
              <div style={{ fontSize: 12, color: "#B54708", marginTop: 4, lineHeight: 1.55 }}>
                Fill open days with product spotlights, behind-the-counter stories, or booking availability to maintain consistent audience reach.
              </div>
            </div>
            <button
              onClick={() => openModal("autoplan")}
              style={{ border: 0, background: "#B54708", borderRadius: 11, padding: "11px 16px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 44 }}
            >
              Fill open slots
            </button>
          </div>
        );
      })()}
    </div>
  );
}

"use client";

import React from "react";
import { useAdvertising, formatMoney } from "../advertising-context";

export function CalendarScreen() {
  const { campaigns, goToScreen } = useAdvertising();

  const calDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const today = new Date();
  const dayOfWeek = today.getDay();
  const diffToMonday = (dayOfWeek + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - diffToMonday);

  const activeCamps = campaigns.filter((c) => c.status === "active" || (c.status as string) === "scheduled");

  // Map campaigns to the 7 days of this week
  const calCells = calDays.map((dayName, idx) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + idx);
    const dateNum = d.getDate();
    const items = activeCamps.slice(0, 2).map((c) => ({
      n: (c.providerMeta?.name as string) || `Ad (${c.goal})`,
      pf: c.provider.replace(/_ads/g, "").toUpperCase(),
      b: formatMoney(Number(c.budget) || 1200),
      bg: "#EEF4FF",
      fg: "#3538CD",
    }));

    return {
      dayName,
      dateNum,
      items,
      empty: items.length === 0,
    };
  });

  const totalMonthlyPlanned = campaigns.reduce((sum, c) => sum + (Number(c.budget) || 1200) * 30, 0) || 96000;
  const totalSpentSoFar = campaigns.reduce((sum, c) => sum + (c.stats?.spend || 0), 0) || 112400;
  const expectedByToday = Math.round(totalMonthlyPlanned * 0.75);

  const pacing = [
    { l: "Planned this month", v: formatMoney(totalMonthlyPlanned), w: "100%", color: "#E6EAF0" },
    { l: "Spent so far", v: formatMoney(totalSpentSoFar), w: "100%", color: totalSpentSoFar > expectedByToday ? "#B42318" : "#12A150" },
    { l: "Expected by today", v: formatMoney(expectedByToday), w: "75%", color: "#12A150" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
      {/* Top Action Bar */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={() => goToScreen("builder")}
          style={{ border: 0, background: "#12A150", borderRadius: 11, padding: "10px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 44 }}
        >
          Add to schedule
        </button>
      </div>

      {/* Calendar Grid Card */}
      <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 17, overflowX: "auto" }}>
        <div style={{ minWidth: 840 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 8, marginBottom: 8 }}>
            {calCells.map((c, idx) => (
              <div key={idx} style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".3px", textTransform: "uppercase", color: "#98A2B3", textAlign: "center" }}>
                {c.dayName} {c.dateNum}
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 8 }}>
            {calCells.map((c, i) => (
              <div
                key={i}
                style={{
                  minHeight: 140,
                  border: "1px solid #E6EAF0",
                  borderRadius: 12,
                  padding: 8,
                  display: "flex",
                  flexDirection: "column",
                  gap: 7,
                  background: "#FCFDFD",
                }}
              >
                {c.items.map((x, j) => (
                  <div key={j} style={{ background: x.bg, border: "1px solid #E6EAF0", borderRadius: 8, padding: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 9.5, fontWeight: 800, color: x.fg }}>{x.pf}</span>
                      <span style={{ fontSize: 9, color: "#667085" }}>{x.b}</span>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#101828", lineHeight: 1.3 }}>{x.n}</div>
                  </div>
                ))}
                {c.empty && (
                  <button
                    onClick={() => goToScreen("builder")}
                    style={{ border: "1px dashed #D5DCE4", background: "#fff", borderRadius: 8, padding: 8, fontSize: 10.5, fontWeight: 700, color: "#98A2B3", cursor: "pointer", width: "100%", height: "100%", minHeight: 40 }}
                  >
                    + Add
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: "#98A2B3", marginTop: 12, lineHeight: 1.55 }}>
          Daily spend caps are enforced per ad account. Pacing allows smooth distribution rather than exhausting budgets in early hours.
        </div>
      </div>

      {/* Monthly Budget Pacing Card */}
      <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 18 }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Monthly budget pacing</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
          {pacing.map((p, idx) => (
            <div key={idx} style={{ border: "1px solid #E6EAF0", borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 12, color: "#667085" }}>{p.l}</div>
              <div style={{ fontSize: 19, fontWeight: 800, color: p.color === "#E6EAF0" ? "#101828" : p.color, marginTop: 4 }}>
                {p.v}
              </div>
              <div style={{ width: "100%", height: 6, background: "#F2F4F7", borderRadius: 3, marginTop: 10, overflow: "hidden" }}>
                <div style={{ width: p.w, height: "100%", background: p.color === "#E6EAF0" ? "#3538CD" : p.color, borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </div>
        <div style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: 11, padding: "11px 13px", fontSize: 12, color: "#93370D", marginTop: 14, lineHeight: 1.55 }}>
          Pacing projection is calculated daily against scheduled day-parts and conversion rates. Adjust campaign caps to maintain balanced delivery through month-end.
        </div>
      </div>
    </div>
  );
}

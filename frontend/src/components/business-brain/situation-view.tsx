"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSituation, type Compare } from "@/lib/brain-api";
import { useBrainScope, useBrainStore } from "./brain-store";
import { Empty, Loading, card, errorText } from "./brain-ui";

const SEV: Record<string, { bg: string; fg: string; dot: string; filter: string }> = {
  Critical: { bg: "#FEF3F2", fg: "#B42318", dot: "#F04438", filter: "Critical" },
  Important: { bg: "#FEF6E7", fg: "#B54708", dot: "#F79009", filter: "Important" },
  Opportunity: { bg: "#E8F7EE", fg: "#0E8442", dot: "#12A150", filter: "Opportunities" },
  Positive: { bg: "#E8F7EE", fg: "#0E8442", dot: "#12A150", filter: "Positive" },
};
const CHANGE: Record<string, { bd: string; bg: string; fg: string }> = {
  bad: { bd: "#FDD9D6", bg: "#FEF3F2", fg: "#B42318" },
  warn: { bd: "#FDE3B3", bg: "#FEF6E7", fg: "#B54708" },
  good: { bd: "#D5EFE0", bg: "#F7FCF9", fg: "#0E8442" },
  neutral: { bd: "#E6EAF0", bg: "#FAFBFC", fg: "#475467" },
};
const EV_FILTERS = ["All", "Critical", "Important", "Opportunities", "Positive"];

export function SituationView() {
  const scope = useBrainScope();
  const compare = useBrainStore((s) => s.compare);
  const setCompare = useBrainStore((s) => s.setCompare);
  const openModal = useBrainStore((s) => s.openModal);
  const openDrawer = useBrainStore((s) => s.openDrawer);
  const [ev, setEv] = useState("All");
  const { data, isLoading, error } = useQuery({ queryKey: ["brain-situation", scope], queryFn: () => fetchSituation(scope) });
  const events = (data?.events ?? []).filter((e) => ev === "All" || SEV[e.sev].filter === ev);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <div style={{ ...card, padding: "15px 17px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 800, color: "#101828" }}>What&apos;s happening now</h2>
          <div style={{ fontSize: "11.5px", color: "#98A2B3", marginTop: "3px" }}>The changes, signals and events shaping the business. Routine transactions are left out on purpose.</div>
        </div>
        <select
          aria-label="Comparison period"
          value={compare}
          onChange={(e) => {
            const v = e.target.value as Compare;
            if (v === "custom") openModal({ type: "custom-range" });
            else setCompare(v);
          }}
          style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "11px", padding: "11px 13px", fontSize: "12.5px", fontWeight: 700, color: "#344054", minHeight: "44px" }}
        >
          <option value="week">vs the previous 7 days</option>
          <option value="yesterday">vs the 24 hours before</option>
          <option value="month">vs the previous 30 days</option>
          <option value="custom">Custom range…</option>
        </select>
      </div>

      {isLoading && <Loading />}
      {error && <div style={card}><Empty title="Could not read the situation" sub={errorText(error)} /></div>}

      {data && (
        <>
          <div data-2col="1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "15px", alignItems: "start" }}>
            <section style={{ ...card, padding: "17px" }}>
              <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 800, color: "#101828" }}>How it connects</h3>
              <div style={{ fontSize: "11.5px", color: "#98A2B3", marginTop: "3px" }}>One reading, followed down to where it actually came from.</div>
              <div style={{ display: "flex", flexDirection: "column", marginTop: "16px" }}>
                {data.chain.length === 0 && <div style={{ fontSize: "12px", color: "#98A2B3" }}>No completed sales in either period, so there is nothing to follow.</div>}
                {data.chain.map((m, i) => {
                  const dot = m.tone === "bad" ? "#F04438" : m.tone === "good" ? "#12A150" : "#F79009";
                  const line = i === data.chain.length - 1 ? "transparent" : m.tone === "bad" ? "#FDD9D6" : m.tone === "good" ? "#D5EFE0" : "#FDE3B3";
                  const fg = m.tone === "bad" ? "#B42318" : m.tone === "good" ? "#0E8442" : "#B54708";
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "stretch", gap: "12px" }}>
                      <div style={{ width: "26px", display: "flex", flexDirection: "column", alignItems: "center", flex: "0 0 26px" }}>
                        <span style={{ width: "11px", height: "11px", borderRadius: "50%", background: dot, marginTop: "5px" }} />
                        <span style={{ flex: 1, width: "2px", background: line }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0, paddingBottom: "14px", marginLeft: `${m.level * 10}px` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#101828" }}>{m.n}</span>
                          <span style={{ fontSize: "11px", fontWeight: 800, color: fg }}>{m.ch}</span>
                          <span style={{ fontSize: "10px", fontWeight: 700, color: "#475467", background: "#F2F4F7", borderRadius: "5px", padding: "2px 6px" }}>{m.src}</span>
                        </div>
                        <div style={{ fontSize: "11.5px", color: "#667085", marginTop: "4px", lineHeight: 1.5 }}>{m.d}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ background: "#FAFBFC", border: "1px solid #F0F2F5", borderRadius: "11px", padding: "12px", fontSize: "11.5px", color: "#475467", lineHeight: 1.55, marginTop: "4px" }}>
                Each step down this chain is a recorded figure, not an inference. The chain stops where the records stop.
              </div>
            </section>

            <section style={{ ...card, padding: "17px" }}>
              <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 800, color: "#101828" }}>What changed</h3>
              <div style={{ fontSize: "11.5px", color: "#98A2B3", marginTop: "3px" }}>Unusual against this business&apos;s own history, not against an industry average.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "15px" }}>
                {data.changes.map((c, i) => {
                  const t = CHANGE[c.tone];
                  return (
                    <div key={i} style={{ border: `1px solid ${t.bd}`, background: t.bg, borderRadius: "12px", padding: "12px 13px", display: "flex", alignItems: "flex-start", gap: "11px" }}>
                      <span style={{ fontSize: "10px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: t.fg, flex: "0 0 auto", paddingTop: "2px", width: "58px" }}>{c.kind}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>{c.t}</span>
                        <span style={{ display: "block", fontSize: "11px", color: "#475467", marginTop: "4px", lineHeight: 1.5 }}>{c.d}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <section style={{ ...card, overflow: "hidden" }}>
            <div style={{ padding: "15px 17px", borderBottom: "1px solid #F2F4F7", display: "flex", alignItems: "center", gap: "11px", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "170px" }}>
                <h3 style={{ margin: 0, fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>Business events</h3>
                <div style={{ fontSize: "11.5px", color: "#98A2B3", marginTop: "3px" }}>
                  {data.events.length} events kept out of {data.totalRecords.toLocaleString()} records today — the rest were ordinary.
                </div>
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {EV_FILTERS.map((k) => {
                  const on = ev === k;
                  return (
                    <button key={k} type="button" onClick={() => setEv(k)} style={{ border: `1px solid ${on ? "#12A150" : "#E6EAF0"}`, background: on ? "#F7FCF9" : "#fff", color: on ? "#0E8442" : "#475467", borderRadius: "20px", padding: "7px 12px", fontSize: "11.5px", fontWeight: 700, cursor: "pointer", minHeight: "38px" }}>
                      {k}
                    </button>
                  );
                })}
              </div>
            </div>
            {events.map((e, i) => {
              const s = SEV[e.sev];
              return (
                <div key={i} style={{ padding: "13px 17px", borderBottom: "1px solid #F2F4F7", display: "flex", alignItems: "flex-start", gap: "13px" }}>
                  <span style={{ fontSize: "10.5px", color: "#98A2B3", width: "62px", flex: "0 0 62px", paddingTop: "3px" }}>{e.t}</span>
                  <span style={{ width: "4px", alignSelf: "stretch", borderRadius: "3px", background: s.dot, flex: "0 0 4px" }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>{e.title}</span>
                    <span style={{ display: "block", fontSize: "11.5px", color: "#667085", marginTop: "4px", lineHeight: 1.5 }}>{e.d}</span>
                    <span style={{ display: "flex", gap: "7px", flexWrap: "wrap", marginTop: "7px" }}>
                      <span style={{ fontSize: "10px", fontWeight: 700, color: "#475467", background: "#F2F4F7", borderRadius: "5px", padding: "2px 7px" }}>{e.src}</span>
                      <span style={{ fontSize: "10px", fontWeight: 700, color: s.fg, background: s.bg, borderRadius: "5px", padding: "2px 7px" }}>{e.sev}</span>
                      <span style={{ fontSize: "10px", color: "#98A2B3", padding: "2px 0" }}>{e.rel}</span>
                    </span>
                  </span>
                  <button type="button" onClick={() => openDrawer({ type: "event", event: e })} className="bb-soft" style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "8px 12px", fontSize: "11.5px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "38px", flex: "0 0 auto" }}>
                    Context
                  </button>
                </div>
              );
            })}
            {events.length === 0 && <Empty title={data.events.length ? "No events in this filter today" : "No notable events today"} sub="Stock, deliveries, returns, discounts, credit, reviews, integrations and large orders are all still being watched. An empty list here is a good sign, not a broken one." />}
          </section>
        </>
      )}
    </div>
  );
}

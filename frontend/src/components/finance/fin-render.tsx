"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import type { FinFlow, FinKpi, FinNotice, FinTable } from "@/lib/finance-api";
import { IC } from "./fin-core";
import { useFin, type Pipe } from "./fin-store";

export const FIN_STYLES = `
.ui-fin{font-variant-numeric:tabular-nums}
.ui-fin a{color:#12A150;text-decoration:none}
.ui-fin :focus-visible{outline:2px solid #12A150;outline-offset:2px}
@keyframes nxin{from{opacity:0;transform:translateY(-6px) scale(.985)}to{opacity:1;transform:none}}
@keyframes nxslide{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}
@keyframes nxpulse{0%,100%{opacity:1}50%{opacity:.35}}
.ui-fin .fx-sub:hover{background:#F2FBF5!important;color:#0E8442!important}
.ui-fin .fx-btn:hover{border-color:#12A150!important;color:#0E8442!important}
.ui-fin .fx-pri:hover{background:#0E8442!important}
.ui-fin .fx-kpi:hover{border-color:#BFE7CF!important;box-shadow:0 6px 18px rgba(16,24,40,.07)!important}
.ui-fin .fx-k2:hover{border-color:#BFE7CF!important}
.ui-fin .fx-row:hover{background:#F7FCF9!important}
.ui-fin .fx-att:hover{border-color:#12A150!important;background:#F7FCF9!important}
.ui-fin .fx-dark:hover{background:#132C3E!important}
.ui-fin .fx-in:focus{background:#fff!important;border-color:#12A150!important;box-shadow:0 0 0 3px rgba(18,161,80,.12)}
@media(max-width:1180px){.ui-fin [data-subnav]{display:none!important}.ui-fin [data-subsel]{display:block!important}}
@media(max-width:1100px){.ui-fin [data-r2]{grid-template-columns:minmax(0,1fr)!important}}
@media(max-width:900px){.ui-fin [data-drawer]{width:100%!important;border-radius:18px 18px 0 0!important;top:auto!important;height:88%!important}.ui-fin [data-hidesm]{display:none!important}}
@media(max-width:620px){.ui-fin [data-kpi]{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
`;

export function Svg({ d, size = 16, sw = 2, stroke = "currentColor", style }: { d: string; size?: number; sw?: number; stroke?: string; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export const card: CSSProperties = { background: "#fff", border: "1px solid #E6EAF0", borderRadius: "16px" };
export const btnSec: CSSProperties = { border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "10px 14px", fontSize: "12.5px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "44px" };
export const btnPri: CSSProperties = { display: "flex", alignItems: "center", gap: "7px", border: 0, background: "#12A150", borderRadius: "10px", padding: "10px 18px", fontSize: "13px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "44px", boxShadow: "0 1px 2px rgba(16,24,40,.08)" };
export const selSt: CSSProperties = { border: "1px solid #E6EAF0", borderRadius: "9px", padding: "7px 10px", fontSize: "12.5px", fontWeight: 700, color: "#344054", background: "#fff", minHeight: "36px" };

export function Chip({ t, bg, fg, style }: { t: string; bg: string; fg: string; style?: CSSProperties }) {
  return <span style={{ fontSize: "10.5px", fontWeight: 800, padding: "3px 9px", borderRadius: "20px", background: bg, color: fg, whiteSpace: "nowrap", ...style }}>{t}</span>;
}

export function Notices({ items, act }: { items: FinNotice[]; act: (a: string) => void }) {
  return (
    <>
      {items.map((n, i) => (
        <div key={i} role="note" style={{ display: "flex", gap: "12px", alignItems: "flex-start", background: n.bg, border: `1px solid ${n.bd}`, borderRadius: "14px", padding: "13px 16px", flexWrap: "wrap" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={n.fg} strokeWidth="2.2" strokeLinecap="round" style={{ flex: "0 0 18px", marginTop: "1px" }} aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <div style={{ flex: 1, minWidth: "220px" }}>
            <div style={{ fontSize: "13px", fontWeight: 800, color: n.fg }}>{n.title}</div>
            <div style={{ fontSize: "12.5px", color: n.body_fg, marginTop: "2px", textWrap: "pretty" }}>{n.body}</div>
          </div>
          {n.hasA ? (
            <button type="button" onClick={() => act(n.a)} style={{ border: `1px solid ${n.bd}`, background: "#fff", borderRadius: "9px", padding: "8px 13px", fontSize: "12px", fontWeight: 700, color: n.fg === "#FFFFFF" ? "#0A1B2A" : n.fg, cursor: "pointer", minHeight: "38px" }}>
              {n.al}
            </button>
          ) : null}
        </div>
      ))}
    </>
  );
}

export function KpiGrid({ kpis, overview, adv, onKpi }: { kpis: FinKpi[]; overview: boolean; adv: boolean; onKpi: (k: FinKpi) => void }) {
  return (
    <div data-kpi="1" style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit,minmax(${overview ? "220px" : "165px"},1fr))`, gap: "12px" }}>
      {kpis.map((k) => {
        const clickable = !!(k.go || k.seg);
        return (
          <button key={k.label} type="button" className="fx-kpi" onClick={() => onKpi(k)} aria-label={`${k.label}: ${k.value}${k.state ? " · " + k.state : ""}`} style={{ textAlign: "left", background: "#fff", border: "1px solid #E6EAF0", borderRadius: "14px", padding: "15px", cursor: clickable ? "pointer" : "default", display: "flex", flexDirection: "column", gap: "6px", boxShadow: "0 1px 2px rgba(16,24,40,.04)", minWidth: 0 }}>
            <span style={{ display: "flex", alignItems: "center", gap: "9px", width: "100%" }}>
              <span style={{ width: "30px", height: "30px", borderRadius: "9px", background: k.icBg, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 30px" }}>
                <Svg d={IC[k.ic] ?? IC.overview} stroke={k.icFg} />
              </span>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#475467", flex: 1, minWidth: 0 }}>{k.label}</span>
              {k.hasSt ? <span style={{ fontSize: "10px", fontWeight: 800, padding: "2px 8px", borderRadius: "20px", background: k.stBg, color: k.stFg, whiteSpace: "nowrap" }}>{k.state}</span> : null}
            </span>
            <span style={{ fontSize: overview ? "26px" : "21px", fontWeight: 800, color: "#0F172A", letterSpacing: "-.6px" }}>{k.value}</span>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "#98A2B3" }}>{k.meta}</span>
            <span style={{ fontSize: "11.5px", color: "#667085", textWrap: "pretty" }}>{k.def}</span>
            {adv && k.adv ? <span style={{ fontSize: "11px", color: "#344054", background: "#F9FAFB", border: "1px dashed #D0D5DD", borderRadius: "8px", padding: "6px 8px" }}>{k.adv}</span> : null}
            {k.go ? <span style={{ fontSize: "11.5px", fontWeight: 700, color: "#0E8442", marginTop: "auto" }}>View source ›</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function Kpis2({ kpis, onKpi }: { kpis: FinKpi[]; onKpi: (k: FinKpi) => void }) {
  return (
    <div data-kpi="1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "12px" }}>
      {kpis.map((k) => (
        <button key={k.label} type="button" className="fx-k2" onClick={() => onKpi(k)} style={{ textAlign: "left", background: "#fff", border: "1px solid #E6EAF0", borderRadius: "12px", padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
          <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ fontSize: "11.5px", fontWeight: 700, color: "#475467" }}>{k.label}</span>
            <span style={{ fontSize: "11px", color: "#98A2B3" }}>{k.meta}</span>
          </span>
          <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "3px" }}>
            <span style={{ fontSize: "17px", fontWeight: 800, color: "#0F172A", letterSpacing: "-.4px" }}>{k.value}</span>
            {k.hasSt ? <span style={{ fontSize: "10px", fontWeight: 800, padding: "1px 7px", borderRadius: "20px", background: k.stBg, color: k.stFg }}>{k.state}</span> : null}
          </span>
        </button>
      ))}
    </div>
  );
}

export function FlowView({ flow }: { flow: FinFlow }) {
  return (
    <section style={{ ...card, padding: "15px 18px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", gap: "10px", alignItems: "baseline", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 800, color: "#101828" }}>{flow.title}</h2>
        <span style={{ fontSize: "11.5px", color: "#667085", textWrap: "pretty" }}>{flow.note}</span>
      </div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", gap: 0, overflowX: "auto" }}>
        {flow.steps.map((s) => (
          <li key={s.n} aria-label={`${s.l} — ${s.sr}`} style={{ display: "flex", flexDirection: "column", gap: "7px", flex: 1, minWidth: "104px" }}>
            <span style={{ display: "flex", alignItems: "center" }}>
              <span style={{ width: "24px", height: "24px", borderRadius: "50%", background: s.bg, border: `1.5px solid ${s.bd}`, color: s.fg, fontSize: "11px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 24px" }}>{s.n}</span>
              <span style={{ flex: 1, height: "2px", background: s.bar, margin: "0 6px", visibility: s.barVis as CSSProperties["visibility"] }} />
            </span>
            <span style={{ fontSize: "11.5px", fontWeight: s.lw, color: s.lc, paddingRight: "8px", textWrap: "pretty" }}>{s.l}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function TableView({ screenKey, table, onRow, extraFilters, emptyText, emptyAct }: { screenKey: string; table: FinTable; onRow: (id: string) => void; extraFilters?: ReactNode; emptyText?: string; emptyAct?: ReactNode }) {
  const q = useFin((s) => s.q);
  const seg = useFin((s) => s.seg[screenKey] ?? "All");
  const filt = useFin((s) => s.filt);
  const moreF = useFin((s) => s.moreF);
  const more = useFin((s) => s.more);
  const set = useFin((s) => s.set);
  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return table.rows.filter((r) => {
      if (seg !== "All" && !r.seg.includes(seg)) return false;
      if (qq && !r.text.toLowerCase().includes(qq)) return false;
      for (const [label, opts] of table.filters) {
        const v = filt[`${screenKey}:${label}`];
        if (v && v !== opts[0] && r.f?.[label] !== v) return false;
      }
      for (const m of table.moreFilters ?? []) {
        const v = (more[`${screenKey}:${m}`] ?? "").trim().toLowerCase();
        if (!v) continue;
        const rv = (r.f?.[m] ?? "").toLowerCase();
        if (m === "Min amount" ? Number(rv) < Number(v) : !rv.includes(v)) return false;
      }
      return true;
    });
  }, [table, q, seg, filt, more, screenKey]);
  return (
    <section style={{ ...card, overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", borderBottom: "1px solid #F0F2F5" }}>
        <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 800, color: "#101828" }}>{table.title}</h2>
        <span style={{ fontSize: "11.5px", color: "#98A2B3" }}>{table.count}</span>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginLeft: "auto", alignItems: "center" }}>
          {extraFilters}
          {table.filters.map(([l, opts]) => (
            <select key={l} aria-label={l} value={filt[`${screenKey}:${l}`] ?? opts[0]} onChange={(e) => set((s) => ({ filt: { ...s.filt, [`${screenKey}:${l}`]: e.target.value } }))} style={{ ...selSt, fontSize: "12px", maxWidth: "220px" }}>
              {opts.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          ))}
          {table.moreFilters?.length ? (
            <button type="button" onClick={() => set((s) => ({ moreF: !s.moreF }))} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "7px 11px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "36px" }}>
              More filters
            </button>
          ) : null}
        </div>
      </div>
      {moreF && table.moreFilters?.length ? (
        <div style={{ padding: "12px 18px", borderBottom: "1px solid #F0F2F5", background: "#FAFBFC", display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {table.moreFilters.map((m) => (
            <label key={m} style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "10.5px", fontWeight: 700, color: "#98A2B3" }}>
              {m}
              <input placeholder="Any" value={more[`${screenKey}:${m}`] ?? ""} onChange={(e) => set((s) => ({ more: { ...s.more, [`${screenKey}:${m}`]: e.target.value } }))} inputMode={m === "Min amount" ? "decimal" : undefined} style={{ border: "1px solid #E6EAF0", borderRadius: "8px", padding: "7px 9px", fontSize: "12px", width: "140px", minHeight: "34px" }} />
            </label>
          ))}
        </div>
      ) : null}
      {table.segs.length ? (
        <div role="tablist" aria-label="Filter by status" style={{ padding: "10px 18px", display: "flex", gap: "6px", flexWrap: "wrap", borderBottom: "1px solid #F0F2F5" }}>
          {table.segs.map((s) => {
            const on = s === seg;
            const n = s === "All" ? table.rows.length : table.rows.filter((r) => r.seg.includes(s)).length;
            return (
              <button key={s} type="button" role="tab" aria-selected={on} onClick={() => set((st) => ({ seg: { ...st.seg, [screenKey]: s } }))} style={{ border: `1px solid ${on ? "#0A1B2A" : "#E6EAF0"}`, background: on ? "#0A1B2A" : "#fff", color: on ? "#fff" : "#344054", borderRadius: "20px", padding: "6px 12px", fontSize: "12px", fontWeight: 700, cursor: "pointer", minHeight: "34px", display: "flex", gap: "6px", alignItems: "center" }}>
                {s}
                <span style={{ fontSize: "10.5px", opacity: 0.75 }}>{n}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      <div style={{ overflowX: "auto" }}>
        <div role="table" aria-label={table.title} style={{ minWidth: `${table.minW}px` }}>
          <div role="row" style={{ display: "grid", gridTemplateColumns: table.grid, gap: "12px", padding: "9px 18px", background: "#FAFBFC" }}>
            {table.cols.map((c, i) => (
              <span key={i} role="columnheader" style={{ fontSize: "11px", fontWeight: 800, color: "#667085", textTransform: "uppercase", letterSpacing: ".3px", textAlign: c[1] ? "right" : "left" }}>
                {c[0]}
              </span>
            ))}
          </div>
          {rows.map((r) => (
            <div key={r.id} role="row" tabIndex={0} className="fx-row" onClick={() => onRow(r.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRow(r.id); } }} aria-label={`Open ${r.cells[0]?.t ?? r.id}`} style={{ display: "grid", gridTemplateColumns: table.grid, gap: "12px", padding: "11px 18px", borderTop: "1px solid #F2F4F7", alignItems: "center", cursor: "pointer", background: r.bg ?? "#fff" }}>
              {r.cells.map((c, i) => (
                <span key={i} role="cell" style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0, alignItems: c.ai, textAlign: c.ta as CSSProperties["textAlign"], paddingLeft: c.pl }}>
                  {c.isChip ? <span style={{ fontSize: "10.5px", fontWeight: 800, padding: "3px 9px", borderRadius: "20px", background: c.bg, color: c.fg, whiteSpace: "nowrap" }}>{c.t}</span> : null}
                  {c.isText ? <span style={{ fontSize: "12.5px", fontWeight: c.fw, color: c.color, overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{c.t}</span> : null}
                  {c.sub ? <span style={{ fontSize: "11px", color: "#98A2B3", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{c.sub}</span> : null}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      {!rows.length ? (
        <div style={{ padding: "44px 18px", textAlign: "center" }}>
          <div style={{ fontSize: "14px", fontWeight: 800, color: "#344054" }}>{table.rows.length ? "Nothing matches this view" : emptyText ?? "Nothing here yet"}</div>
          <div style={{ fontSize: "12.5px", color: "#98A2B3", marginTop: "4px" }}>{table.rows.length ? "Try another status or clear the search." : ""}</div>
          {table.rows.length ? (
            <button type="button" onClick={() => set((s) => ({ q: "", seg: { ...s.seg, [screenKey]: "All" }, filt: {}, more: {} }))} style={{ marginTop: "12px", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "9px 16px", fontSize: "12.5px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "40px" }}>
              Clear filters
            </button>
          ) : (
            emptyAct
          )}
        </div>
      ) : null}
    </section>
  );
}

export function Toast() {
  const toast = useFin((s) => s.toast);
  if (!toast) return null;
  return (
    <div role="status" aria-live="polite" style={{ position: "fixed", left: "50%", bottom: "22px", transform: "translateX(-50%)", zIndex: 190, background: "#0A1B2A", color: "#fff", borderRadius: "12px", padding: "12px 16px", fontSize: "12.5px", fontWeight: 600, boxShadow: "0 14px 40px rgba(10,27,42,.3)", maxWidth: "560px", width: "calc(100% - 40px)", animation: "nxin .18s ease", textWrap: "pretty" }}>
      {toast}
    </div>
  );
}

export function PipePanel() {
  const pipe: Pipe | null = useFin((s) => s.pipe);
  const set = useFin((s) => s.set);
  if (!pipe) return null;
  const mFg = pipe.tone === "bad" ? "#B42318" : pipe.tone === "warn" ? "#93370D" : "#0E6B3A";
  const mBg = pipe.tone === "bad" ? "#FEF3F2" : pipe.tone === "warn" ? "#FFFCF5" : "#F7FCF9";
  return (
    <div role="status" aria-live="polite" style={{ position: "fixed", right: "20px", bottom: "20px", zIndex: 185, width: "370px", maxWidth: "calc(100% - 40px)", background: "#fff", border: "1px solid #E6EAF0", borderRadius: "16px", boxShadow: "0 20px 50px rgba(10,27,42,.22)", padding: "15px 16px", animation: "nxin .18s ease", display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "13.5px", fontWeight: 800, color: "#0F172A", flex: 1 }}>{pipe.title}</span>
        {pipe.done ? (
          <button type="button" onClick={() => set({ pipe: null })} aria-label="Dismiss" style={{ border: 0, background: "transparent", color: "#98A2B3", cursor: "pointer", fontSize: "18px", lineHeight: 1 }}>
            ×
          </button>
        ) : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {pipe.steps.map((s, i) => {
          const f = s.state === "fail";
          const done = s.state === "done";
          const active = s.state === "active" && !pipe.done;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "9px", fontSize: "12px", color: f ? "#B42318" : done || active ? "#101828" : "#98A2B3", fontWeight: active || f ? 800 : 600 }}>
              <span style={{ width: "18px", height: "18px", borderRadius: "50%", background: f ? "#B42318" : done ? "#12A150" : active ? "#0A1B2A" : "#fff", border: `1.5px solid ${f ? "#B42318" : done ? "#12A150" : active ? "#0A1B2A" : "#D0D5DD"}`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: 800, flex: "0 0 18px", animation: active ? "nxpulse 1s ease infinite" : "none" }}>{f ? "✕" : done ? "✓" : ""}</span>
              {s.l}
            </div>
          );
        })}
      </div>
      {pipe.msg ? <div style={{ fontSize: "12.5px", fontWeight: 700, color: mFg, background: mBg, borderRadius: "10px", padding: "9px 11px", textWrap: "pretty" }}>{pipe.msg}</div> : null}
    </div>
  );
}

export function Skeleton() {
  return <div style={{ ...card, padding: "40px", textAlign: "center", fontSize: "13px", color: "#667085" }}>Loading posted ledger…</div>;
}

export function Gate({ t, d, act }: { t: string; d: string; act?: ReactNode }) {
  return (
    <div style={{ ...card, padding: "48px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
      <span style={{ width: "48px", height: "48px", borderRadius: "14px", background: "#F2F4F7", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Svg d={IC.close} size={22} stroke="#475467" />
      </span>
      <div style={{ fontSize: "16px", fontWeight: 800, color: "#101828" }}>{t}</div>
      <div style={{ fontSize: "13px", color: "#667085", maxWidth: "520px" }}>{d}</div>
      {act}
    </div>
  );
}

"use client";

import type { FormEvent, ReactNode } from "react";
import type { Block, Btn, Card, LayoutRow } from "./hd-core";

export const HD_STYLES = `
.ui-hd button:disabled{cursor:not-allowed!important;opacity:.55}
.ui-hd :focus-visible{outline:2px solid #12A150;outline-offset:2px}
.ui-hd .hd-kpi:hover{border-color:#12A150!important;box-shadow:0 4px 14px rgba(10,27,42,.06)}
.ui-hd .hd-row:hover{background:#F7FAF8!important}
.ui-hd .hd-qc:hover{border-color:#12A150!important}
.ui-hd .hd-tab:hover{color:#0E8442!important}
.ui-hd .hd-ref:hover{border-color:#12A150!important;color:#0E8442!important}
.ui-hd .hd-menu:hover{background:#F7FCF9!important;color:#0E8442!important}
@keyframes hdin{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:none}}
@keyframes hdpulse{0%,100%{opacity:.35}50%{opacity:1}}
@keyframes hdsk{0%,100%{opacity:.55}50%{opacity:1}}
@media(prefers-reduced-motion:reduce){.ui-hd *{animation:none!important;transition:none!important}}
@media(max-width:1180px){.ui-hd [data-2col="1"]{grid-template-columns:minmax(0,1fr)!important}.ui-hd [data-setnav]{flex-direction:row!important;overflow-x:auto;position:static!important}}
@media(max-width:1100px){.ui-hd [data-opt="1"]{display:none!important}.ui-hd [data-ctx]{display:none!important}.ui-hd [data-ctxbtn]{display:inline-flex!important}.ui-hd [data-3col]{grid-template-columns:minmax(0,1fr)!important}}
@media(max-width:900px){.ui-hd [data-drawer]{width:100%!important}.ui-hd [data-hidesm]{display:none!important}}
@media(max-width:760px){.ui-hd [data-tbl]{display:none!important}.ui-hd [data-cards]{display:flex!important}.ui-hd [data-sticky-reply]{display:flex!important}}
`;

export interface Handlers {
  kpiClick?: (k: string) => void;
  blockAct?: (k: string, b: string) => void;
  segPick?: (b: string, k: string) => void;
  setQ?: (b: string, v: string) => void;
  setF?: (b: string, k: string, v: string) => void;
  clearF?: (b: string) => void;
  sortCol?: (b: string, k: string) => void;
  pageGo?: (d: number) => void;
  selRow?: (id: string) => void;
  selAll?: () => void;
  selNone?: () => void;
  bulkAct?: (k: string) => void;
  rowOpen?: (b: string, id: string) => void;
  cardOpen?: (b: string, id: string) => void;
  rowAct?: (b: string, id: string, v: string) => void;
  emptyAct?: (k: string) => void;
}

export function Svg({ d, size = 16, sw = 2, stroke = "currentColor" }: { d: string; size?: number; sw?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function ActBtn({ a, onClick, style }: { a: Btn; onClick: () => void; style?: React.CSSProperties }) {
  return (
    <button type="button" onClick={onClick} disabled={a.dis} title={a.why} style={{ border: `1px solid ${a.bd}`, background: a.bg, color: a.fg, borderRadius: "9px", padding: "8px 12px", fontSize: "12px", fontWeight: 700, cursor: "pointer", minHeight: "36px", whiteSpace: "nowrap", ...style }}>
      {a.t}
    </button>
  );
}

function CardView({ b, h }: { b: Card; h: Handlers }) {
  const bid = b.id ?? "";
  return (
    <section aria-label={b.title || undefined} style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: "16px", overflow: "hidden" }}>
      {b.title ? (
        <div style={{ padding: "14px 16px", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid #F2F4F7" }}>
          <div style={{ flex: 1, minWidth: "180px" }}>
            <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 800, color: "#0F172A", letterSpacing: "-.2px" }}>{b.title}</h2>
            {b.sub ? <div style={{ fontSize: "11.5px", color: "#667085", marginTop: "3px", textWrap: "pretty", lineHeight: 1.45 }}>{b.sub}</div> : null}
          </div>
          {(b.acts ?? []).map((a) => (
            <ActBtn key={a.k} a={a} onClick={() => h.blockAct?.(a.k, bid)} />
          ))}
        </div>
      ) : null}
      {b.seg ? (
        <div role="tablist" aria-label={b.title || "Segments"} style={{ display: "flex", gap: "5px", padding: "12px 16px 2px", flexWrap: "wrap" }}>
          {b.seg.map((s) => (
            <button key={s.k} type="button" role="tab" aria-selected={s.on} onClick={() => h.segPick?.(bid, s.k)} style={{ border: `1px solid ${s.bd}`, background: s.bg, color: s.fg, borderRadius: "20px", padding: "6px 12px", fontSize: "12px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", minHeight: "34px", display: "flex", gap: "6px", alignItems: "center" }}>
              {s.t}
              <span style={{ fontSize: "10.5px", fontWeight: 800, opacity: 0.75 }}>{s.n}</span>
            </button>
          ))}
        </div>
      ) : null}
      {b.filters ? (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", padding: "12px 16px", borderBottom: "1px solid #F2F4F7", alignItems: "center" }}>
          {b.filters.search ? (
            <input type="search" aria-label={b.filters.search} placeholder={b.filters.search} value={b.filters.q} onChange={(e) => h.setQ?.(bid, e.target.value)} style={{ flex: "1 1 240px", minWidth: "190px", border: "1px solid #E6EAF0", borderRadius: "10px", padding: "9px 12px", fontSize: "12.5px", minHeight: "40px" }} />
          ) : null}
          {b.filters.sels.map((f) => (
            <select key={f.k} aria-label={f.l} value={f.v} onChange={(e) => h.setF?.(bid, f.k, e.target.value)} style={{ border: `1px solid ${f.bd}`, background: f.bg, borderRadius: "10px", padding: "8px 10px", fontSize: "12px", fontWeight: 600, color: "#344054", minHeight: "40px", maxWidth: "190px" }}>
              {f.opts.map((o) => (
                <option key={o.v + o.t} value={o.v}>
                  {o.t}
                </option>
              ))}
            </select>
          ))}
          {b.filters.nOn ? (
            <button type="button" onClick={() => h.clearF?.(bid)} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "8px 11px", fontSize: "12px", fontWeight: 700, color: "#B42318", cursor: "pointer", minHeight: "40px" }}>
              Clear filters ({b.filters.nOn})
            </button>
          ) : null}
          <span style={{ marginLeft: "auto", fontSize: "11.5px", color: "#667085", fontWeight: 600 }}>{b.filters.count}</span>
        </div>
      ) : null}
      {b.bulk ? (
        <div role="region" aria-label="Bulk actions" style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center", padding: "10px 16px", background: "#F7FCF9", borderBottom: "1px solid #D1F2DF" }}>
          <span style={{ fontSize: "12px", fontWeight: 800, color: "#0E8442", marginRight: "6px" }}>{b.bulk.n} selected</span>
          {b.bulk.acts.map((a) => (
            <button key={a.k} type="button" onClick={() => h.bulkAct?.(a.k)} disabled={a.dis} title={a.why} style={{ border: `1px solid ${a.bd}`, background: "#fff", borderRadius: "8px", padding: "7px 11px", fontSize: "12px", fontWeight: 700, color: a.fg, cursor: "pointer", minHeight: "34px" }}>
              {a.t}
            </button>
          ))}
          <button type="button" onClick={() => h.selNone?.()} style={{ marginLeft: "auto", border: 0, background: "transparent", fontSize: "12px", fontWeight: 700, color: "#475467", cursor: "pointer", minHeight: "34px" }}>
            Clear selection
          </button>
        </div>
      ) : null}
      {b.table ? (
        <>
          <div data-tbl="1" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
              <thead>
                <tr style={{ background: "#FAFBFC" }}>
                  {b.table.sel ? (
                    <th style={{ width: "40px", padding: "10px 0 10px 16px", textAlign: "left", borderBottom: "1px solid #EEF1F4" }}>
                      <input type="checkbox" aria-label="Select all on this page" checked={!!b.table.allOn} onChange={() => h.selAll?.()} style={{ width: "16px", height: "16px", accentColor: "#12A150" }} />
                    </th>
                  ) : null}
                  {b.table.cols.map((c) => (
                    <th key={c.t} data-opt={c.opt} scope="col" aria-sort={c.aria as "none"} style={{ textAlign: "left", padding: "10px 12px", fontSize: "11px", fontWeight: 800, color: "#667085", letterSpacing: ".2px", whiteSpace: "nowrap", borderBottom: "1px solid #EEF1F4" }}>
                      {c.sk ? (
                        <button type="button" onClick={() => h.sortCol?.(bid, c.sk!)} style={{ border: 0, background: "transparent", padding: 0, font: "inherit", color: c.fg, cursor: "pointer", fontWeight: 800 }}>
                          {c.t} {c.arrow}
                        </button>
                      ) : (
                        c.t
                      )}
                    </th>
                  ))}
                  {b.table.hasActs ? <th scope="col" style={{ textAlign: "right", padding: "10px 16px", fontSize: "11px", fontWeight: 800, color: "#667085", borderBottom: "1px solid #EEF1F4" }}>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {b.table.rows.map((row) => (
                  <tr key={row.id} className="hd-row" onClick={(e) => !(e.target as HTMLElement).closest("[data-stop]") && h.rowOpen?.(bid, row.id)} style={{ cursor: "pointer", background: row.bg, borderBottom: "1px solid #F2F4F7" }}>
                    {b.table!.sel ? (
                      <td data-stop="1" style={{ padding: "10px 0 10px 16px", verticalAlign: "top" }}>
                        <input type="checkbox" aria-label={row.selLabel} checked={!!row.on} onChange={() => h.selRow?.(row.id)} style={{ width: "16px", height: "16px", accentColor: "#12A150" }} />
                      </td>
                    ) : null}
                    {row.cells.map((c, i) => (
                      <td key={i} data-opt={c.opt} style={{ padding: "10px 12px", verticalAlign: "top", maxWidth: c.mw }}>
                        {c.bt ? <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 800, borderRadius: "6px", padding: "3px 7px", background: c.bbg, color: c.bfg, whiteSpace: "nowrap" }}>{c.bt}</span> : null}
                        {c.t ? <div style={{ fontWeight: c.fw, color: c.fg, fontFamily: c.ff, lineHeight: 1.4, overflowWrap: "break-word" }}>{c.t}</div> : null}
                        {c.s ? <div style={{ fontSize: "11px", color: "#667085", marginTop: "2px", lineHeight: 1.35 }}>{c.s}</div> : null}
                      </td>
                    ))}
                    {b.table!.hasActs ? (
                      <td data-stop="1" style={{ padding: "8px 16px 8px 8px", textAlign: "right", whiteSpace: "nowrap", verticalAlign: "top" }}>
                        <select aria-label={row.actLabel} value="" onChange={(e) => h.rowAct?.(bid, row.id, e.target.value)} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "8px", padding: "6px 8px", fontSize: "12px", fontWeight: 700, color: "#344054", minHeight: "34px", cursor: "pointer" }}>
                          <option value="">Actions</option>
                          {(row.acts ?? []).map((a) => (
                            <option key={a} value={a}>
                              {a}
                            </option>
                          ))}
                        </select>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div data-cards="1" style={{ display: "none", flexDirection: "column", gap: "8px", padding: "12px" }}>
            {b.table.rows.map((row) => (
              <div key={row.id} style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "12px", display: "flex", gap: "10px", alignItems: "flex-start", background: row.bg }}>
                {b.table!.sel ? <input type="checkbox" aria-label={row.selLabel} checked={!!row.on} onChange={() => h.selRow?.(row.id)} style={{ width: "20px", height: "20px", marginTop: "2px", accentColor: "#12A150" }} /> : null}
                <button type="button" onClick={() => h.rowOpen?.(bid, row.id)} style={{ flex: 1, minWidth: 0, textAlign: "left", border: 0, background: "transparent", padding: 0, cursor: "pointer", font: "inherit", minHeight: "44px" }}>
                  <div style={{ fontSize: "13px", fontWeight: 800, color: "#101828", lineHeight: 1.35 }}>{row.cardT}</div>
                  <div style={{ fontSize: "11.5px", color: "#667085", marginTop: "3px", lineHeight: 1.4 }}>{row.cardS}</div>
                  <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginTop: "8px" }}>
                    {row.cardB.map((x, i) => (
                      <span key={i} style={{ fontSize: "11px", fontWeight: 800, borderRadius: "6px", padding: "3px 7px", background: x.bg, color: x.fg }}>
                        {x.t}
                      </span>
                    ))}
                  </div>
                </button>
                {b.table!.hasActs ? (
                  <select aria-label={row.actLabel} value="" onChange={(e) => h.rowAct?.(bid, row.id, e.target.value)} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "8px", padding: "6px", fontSize: "12px", fontWeight: 700, color: "#344054", minHeight: "44px", maxWidth: "96px" }}>
                    <option value="">More</option>
                    {(row.acts ?? []).map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            ))}
          </div>
        </>
      ) : null}
      {b.bars ? (
        <div role="list" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
          {b.bars.map((x) => (
            <div key={x.l} role="listitem" aria-label={x.aria} style={{ display: "grid", gridTemplateColumns: "minmax(80px,130px) minmax(0,1fr) auto", gap: "10px", alignItems: "center" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#344054", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.l}</span>
              <div style={{ height: "10px", background: "#F2F4F7", borderRadius: "6px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: x.w, background: x.c, borderRadius: "6px" }} />
              </div>
              <span style={{ fontSize: "12px", fontWeight: 800, color: "#101828", textAlign: "right", minWidth: "44px" }}>{x.v}</span>
            </div>
          ))}
          {!b.bars.length ? <div style={{ fontSize: "12px", color: "#667085" }}>No data in this range.</div> : null}
        </div>
      ) : null}
      {b.trend ? (
        <div style={{ padding: "14px 16px" }}>
          <div style={{ display: "flex", gap: "14px", marginBottom: "10px", flexWrap: "wrap", alignItems: "center" }}>
            {b.trend.legend.map((g) => (
              <span key={g.t} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", color: "#475467", fontWeight: 600 }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: g.c }} />
                {g.t}
              </span>
            ))}
            <span style={{ marginLeft: "auto", fontSize: "11px", color: "#98A2B3" }}>{b.trend.note}</span>
          </div>
          <div role="img" aria-label={b.trend.aria} style={{ display: "flex", alignItems: "flex-end", gap: "5px", height: "150px", borderBottom: "1px solid #EEF1F4" }}>
            {b.trend.cols.map((c, i) => (
              <div key={i} title={c.tip} style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: "2px" }}>
                {c.bars.map((x, j) => (
                  <div key={j} style={{ flex: 1, maxWidth: "16px", height: x.h, background: x.c, borderRadius: "3px 3px 0 0" }} />
                ))}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "5px", marginTop: "6px" }}>
            {b.trend.cols.map((c, i) => (
              <div key={i} style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: "10px", color: "#98A2B3", overflow: "hidden" }}>
                {c.l}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {b.qcards ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: "10px", padding: "14px 16px" }}>
          {b.qcards.map((q) => (
            <button key={q.id} type="button" className="hd-qc" onClick={() => h.cardOpen?.(bid, q.id)} aria-label={q.aria} style={{ textAlign: "left", border: "1px solid #E6EAF0", background: q.bg, borderRadius: "12px", padding: "12px", cursor: "pointer", display: "flex", flexDirection: "column", gap: "8px", font: "inherit" }}>
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <span style={{ fontSize: "13px", fontWeight: 800, color: "#101828", flex: 1 }}>{q.t}</span>
                <span style={{ fontSize: "10.5px", fontWeight: 800, borderRadius: "6px", padding: "2px 7px", background: q.bbg, color: q.bfg }}>{q.badge}</span>
              </div>
              <div style={{ fontSize: "11.5px", color: "#667085", lineHeight: 1.4 }}>{q.d}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                {q.stats.map((s) => (
                  <div key={s.l} style={{ background: "#FAFBFC", borderRadius: "8px", padding: "6px 8px" }}>
                    <div style={{ fontSize: "10.5px", color: "#667085" }}>{s.l}</div>
                    <div style={{ fontSize: "13px", fontWeight: 800, color: s.fg }}>{s.v}</div>
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>
      ) : null}
      {b.empty ? (
        <div style={{ padding: "36px 20px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "8px" }}>
          <div style={{ width: "44px", height: "44px", borderRadius: "13px", background: "#F2F4F7", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Svg d="M4 5h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4Z" size={20} stroke="#667085" />
          </div>
          <div style={{ fontSize: "14px", fontWeight: 800, color: "#0F172A" }}>{b.empty.t}</div>
          <div style={{ fontSize: "12px", color: "#667085", maxWidth: "420px", lineHeight: 1.5, textWrap: "pretty" }}>{b.empty.d}</div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center", marginTop: "6px" }}>
            {b.empty.acts.map((a) => (
              <ActBtn key={a.k} a={a} onClick={() => h.emptyAct?.(a.k)} style={{ borderRadius: "10px", padding: "9px 14px", fontSize: "12.5px", fontWeight: 800, minHeight: "40px" }} />
            ))}
          </div>
        </div>
      ) : null}
      {b.pager ? (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px", borderTop: "1px solid #F2F4F7", flexWrap: "wrap" }}>
          <span style={{ fontSize: "11.5px", color: "#667085", flex: 1 }}>{b.pager.t}</span>
          {[
            [-1, "Previous", b.pager.noPrev],
            [1, "Next", b.pager.noNext],
          ].map(([d, t, dis]) => (
            <button key={String(t)} type="button" onClick={() => h.pageGo?.(Number(d))} disabled={!!dis} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "8px", padding: "7px 12px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "36px" }}>
              {String(t)}
            </button>
          ))}
        </div>
      ) : null}
      {b.info ? <div style={{ padding: "10px 16px", fontSize: "11.5px", color: "#475467", background: "#FAFBFC", borderTop: "1px solid #F2F4F7", lineHeight: 1.5, textWrap: "pretty" }}>{b.info}</div> : null}
      {b.api ? <div style={{ padding: "8px 16px", fontSize: "10.5px", color: "#98A2B3", fontFamily: "ui-monospace,SFMono-Regular,monospace", borderTop: "1px solid #F2F4F7", overflowWrap: "anywhere" }}>{b.api}</div> : null}
    </section>
  );
}

export function Rows({ rows, h, label }: { rows: LayoutRow[]; h: Handlers; label: string }) {
  return (
    <div data-screen-label={label} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {rows.map((r, i) => (
        <div key={i} data-2col={r.collapse} style={{ display: "grid", gridTemplateColumns: r.cols, gap: "14px", alignItems: "start" }}>
          {r.blocks.map((b: Block, j) => (
            <div key={j} style={{ minWidth: 0 }}>
              {"kpis" in b ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(168px,1fr))", gap: "10px" }}>
                  {b.kpis.map((k) => (
                    <button key={k.k} type="button" className="hd-kpi" onClick={() => h.kpiClick?.(k.k)} aria-label={k.aria} style={{ textAlign: "left", background: "#fff", border: "1px solid #E6EAF0", borderRadius: "14px", padding: "13px 14px", cursor: "pointer", display: "flex", flexDirection: "column", gap: "6px", minHeight: "92px" }}>
                      <span style={{ fontSize: "11.5px", fontWeight: 700, color: "#667085", display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: k.dot }} />
                        {k.l}
                      </span>
                      <span style={{ fontSize: "24px", fontWeight: 800, letterSpacing: "-.6px", color: k.fg }}>{k.v}</span>
                      <span style={{ fontSize: "11px", color: "#667085", lineHeight: 1.35 }}>{k.sub}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <CardView b={b} h={h} />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function Skeleton() {
  const sk = { background: "#fff", border: "1px solid #E6EAF0", animation: "hdsk 1.4s ease-in-out infinite" };
  return (
    <div aria-busy="true" aria-label="Loading Helpdesk" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(168px,1fr))", gap: "10px" }}>
        {[1, 2, 3, 4, 5, 6, 7, 8].map((x) => (
          <div key={x} style={{ ...sk, height: "92px", borderRadius: "14px" }} />
        ))}
      </div>
      <div style={{ ...sk, height: "230px", borderRadius: "16px" }} />
      <div style={{ ...sk, height: "300px", borderRadius: "16px" }} />
    </div>
  );
}

export const LOCK = "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4";
export const WARN = "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z";

export function Gate({ t, d, icon, bg, fg, acts, meta }: { t: string; d: string; icon: string; bg: string; fg: string; acts: Array<Btn & { on: () => void }>; meta?: string | null }) {
  return (
    <div role="alert" style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: "18px", padding: "44px 24px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "10px" }}>
      <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Svg d={icon} size={22} stroke={fg} />
      </div>
      <div style={{ fontSize: "17px", fontWeight: 800, color: "#0F172A", letterSpacing: "-.3px" }}>{t}</div>
      <div style={{ fontSize: "12.5px", color: "#475467", maxWidth: "520px", lineHeight: 1.6, textWrap: "pretty" }}>{d}</div>
      {meta ? <div style={{ fontSize: "11px", color: "#98A2B3", fontFamily: "ui-monospace,monospace" }}>{meta}</div> : null}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center", marginTop: "6px" }}>
        {acts.map((a) => (
          <button key={a.k} type="button" onClick={a.on} disabled={a.dis} style={{ border: `1px solid ${a.bd}`, background: a.bg, borderRadius: "10px", padding: "10px 15px", fontSize: "12.5px", fontWeight: 800, color: a.fg, cursor: "pointer", minHeight: "42px" }}>
            {a.t}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Banner({ t, d, bg, bd, fg, acts }: { t: string; d: string; bg: string; bd: string; fg: string; acts: Array<{ k: string; t: string; on: () => void }> }) {
  return (
    <div role="alert" style={{ display: "flex", gap: "12px", alignItems: "flex-start", flexWrap: "wrap", background: bg, border: `1px solid ${bd}`, borderRadius: "14px", padding: "13px 15px" }}>
      <div style={{ flex: 1, minWidth: "220px" }}>
        <div style={{ fontSize: "13px", fontWeight: 800, color: fg }}>{t}</div>
        <div style={{ fontSize: "12px", color: "#344054", marginTop: "3px", lineHeight: 1.5, textWrap: "pretty" }}>{d}</div>
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {acts.map((a) => (
          <button key={a.k} type="button" onClick={a.on} style={{ border: `1px solid ${bd}`, background: "#fff", borderRadius: "9px", padding: "8px 12px", fontSize: "12px", fontWeight: 700, color: fg, cursor: "pointer", minHeight: "36px" }}>
            {a.t}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── drawer ───────────────────────────────────────────────────────────────────

export interface DrawerSection {
  h: string;
  warn?: string | null;
  text?: string | null;
  kv?: Array<{ k: string; v: string | number }> | null;
  bullets?: string[] | null;
  items?: Array<{ a: string; b: string; c: string; d: string }> | null;
  node?: ReactNode;
}
export interface DrawerView {
  kicker: string;
  title: string;
  badges: Array<{ t: string; bg: string; fg: string }>;
  sections: DrawerSection[];
  acts: Array<Btn & { on: () => void }>;
}

export function DrawerPanel({ v, onClose }: { v: DrawerView; onClose: () => void }) {
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,27,42,.35)", zIndex: 90 }} />
      <aside data-drawer="1" role="dialog" aria-modal="true" aria-label={v.title} style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "500px", maxWidth: "100%", background: "#fff", zIndex: 91, display: "flex", flexDirection: "column", boxShadow: "-20px 0 60px rgba(10,27,42,.18)", animation: "hdin .22s ease" }}>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid #F2F4F7", display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "10.5px", fontWeight: 800, letterSpacing: ".5px", textTransform: "uppercase", color: "#0E8442" }}>{v.kicker}</div>
            <h2 style={{ margin: "5px 0 0", fontSize: "17px", fontWeight: 800, color: "#0F172A", letterSpacing: "-.3px", lineHeight: 1.3, textWrap: "pretty" }}>{v.title}</h2>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
              {v.badges.map((b, i) => (
                <span key={i} style={{ fontSize: "10.5px", fontWeight: 800, borderRadius: "6px", padding: "3px 7px", background: b.bg, color: b.fg }}>
                  {b.t}
                </span>
              ))}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: "38px", height: "38px", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", cursor: "pointer", color: "#344054", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Svg d="M18 6 6 18M6 6l12 12" sw={2.2} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 18px 18px" }}>
          {v.sections.map((x, i) => (
            <section key={i} style={{ padding: "14px 0", borderBottom: "1px solid #F2F4F7" }}>
              <div style={{ fontSize: "10.5px", fontWeight: 800, letterSpacing: ".5px", textTransform: "uppercase", color: "#667085", marginBottom: "8px" }}>{x.h}</div>
              {x.warn ? <div style={{ background: "#FEF6E7", border: "1px solid #FDE3B3", borderRadius: "10px", padding: "9px 11px", fontSize: "12px", color: "#7A2E0B", lineHeight: 1.5, marginBottom: "8px" }}>{x.warn}</div> : null}
              {x.text ? <p style={{ margin: 0, fontSize: "12.5px", color: "#344054", lineHeight: 1.6, textWrap: "pretty", whiteSpace: "pre-wrap" }}>{x.text}</p> : null}
              {x.kv ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  {x.kv.map((p) => (
                    <div key={p.k} style={{ background: "#FAFBFC", borderRadius: "9px", padding: "9px 10px", minWidth: 0 }}>
                      <div style={{ fontSize: "10.5px", fontWeight: 700, color: "#667085" }}>{p.k}</div>
                      <div style={{ fontSize: "12.5px", fontWeight: 800, color: "#101828", marginTop: "2px", lineHeight: 1.35, overflowWrap: "anywhere" }}>{p.v}</div>
                    </div>
                  ))}
                </div>
              ) : null}
              {x.bullets ? (
                <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12.5px", color: "#344054", lineHeight: 1.6 }}>
                  {x.bullets.map((b, j) => (
                    <li key={j}>{b}</li>
                  ))}
                </ul>
              ) : null}
              {x.items ? (
                <div style={{ border: "1px solid #F2F4F7", borderRadius: "10px", overflow: "hidden" }}>
                  {x.items.map((it, j) => (
                    <div key={j} style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: "10px", padding: "9px 11px", borderBottom: "1px solid #F2F4F7" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "12px", fontWeight: 700, color: "#101828", overflowWrap: "anywhere" }}>{it.a}</div>
                        <div style={{ fontSize: "10.5px", color: "#667085", marginTop: "2px" }}>{it.c}</div>
                      </div>
                      <div style={{ textAlign: "right", minWidth: 0 }}>
                        <div style={{ fontSize: "12px", fontWeight: 800, color: "#101828" }}>{it.b}</div>
                        <div style={{ fontSize: "10.5px", color: "#0E8442", marginTop: "2px" }}>{it.d}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {x.node}
            </section>
          ))}
        </div>
        {v.acts.length ? (
          <div style={{ padding: "12px 18px", borderTop: "1px solid #F2F4F7", display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {v.acts.map((a) => (
              <button key={a.k} type="button" onClick={a.on} disabled={a.dis} title={a.why} style={{ border: `1px solid ${a.bd}`, background: a.bg, borderRadius: "9px", padding: "9px 12px", fontSize: "12px", fontWeight: 800, color: a.fg, cursor: "pointer", minHeight: "40px" }}>
                {a.t}
              </button>
            ))}
          </div>
        ) : null}
      </aside>
    </>
  );
}

// ── modal form ───────────────────────────────────────────────────────────────

export type FieldType = "text" | "number" | "select" | "area" | "file" | "read" | "checks" | "time";
export interface Field {
  name: string;
  label: string;
  type: FieldType;
  value?: string;
  ph?: string;
  rows?: number;
  options?: Array<{ v: string; t: string; on?: boolean }>;
  req?: boolean;
  help?: string;
  af?: boolean;
  min?: number;
  max?: number;
  /** Optional live search box above a select (large lists such as CRM customers). */
  search?: { ph: string; onChange: (q: string) => void };
}
export interface ModalView {
  title: string;
  sub?: string | null;
  fields: Field[];
  note?: string | null;
  primaryT: string;
  pBg?: string;
  cancel?: string;
  submit: (fd: FormData) => void | Promise<void>;
}

export function ModalForm({ m, err, busy, onClose }: { m: ModalView; err: string | null; busy: boolean; onClose: () => void }) {
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void m.submit(new FormData(e.currentTarget));
  };
  const inp = { border: "1px solid #E6EAF0", borderRadius: "10px", padding: "10px", fontSize: "12.5px", minHeight: "42px", background: "#fff" };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,27,42,.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <form onSubmit={onSubmit} role="dialog" aria-modal="true" aria-label={m.title} style={{ width: "540px", maxWidth: "100%", maxHeight: "92vh", overflowY: "auto", background: "#fff", borderRadius: "18px", padding: "20px", display: "flex", flexDirection: "column", gap: "13px", boxShadow: "0 30px 80px rgba(10,27,42,.3)" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 800, color: "#0F172A", letterSpacing: "-.3px" }}>{m.title}</h2>
          {m.sub ? <p style={{ margin: "5px 0 0", fontSize: "12.5px", color: "#475467", lineHeight: 1.55 }}>{m.sub}</p> : null}
        </div>
        {m.fields.map((f) => {
          const fid = "hdf_" + f.name;
          return (
            <div key={f.name} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label htmlFor={fid} style={{ fontSize: "12px", fontWeight: 700, color: "#344054" }}>
                {f.label}
                {f.req ? <span style={{ color: "#B42318" }}> *</span> : null}
              </label>
              {f.search ? <input type="search" placeholder={f.search.ph} aria-label={f.search.ph} onChange={(e) => f.search!.onChange(e.target.value)} style={{ ...inp, minHeight: "38px" }} /> : null}
              {f.type === "select" ? (
                <select id={fid} name={f.name} defaultValue={f.value} key={(f.options ?? []).map((o) => o.v).join("|")} autoFocus={f.af} style={inp}>
                  {(f.options ?? []).map((o) => (
                    <option key={o.v + o.t} value={o.v}>
                      {o.t}
                    </option>
                  ))}
                </select>
              ) : f.type === "area" ? (
                <textarea id={fid} name={f.name} rows={f.rows ?? 4} defaultValue={f.value} placeholder={f.ph} autoFocus={f.af} style={{ ...inp, minHeight: undefined, resize: "vertical", lineHeight: 1.5 }} />
              ) : f.type === "file" ? (
                <input id={fid} name={f.name} type="file" multiple style={{ fontSize: "12px" }} />
              ) : f.type === "read" ? (
                <div id={fid} style={{ background: "#FAFBFC", borderRadius: "10px", padding: "10px 12px", fontSize: "12.5px", color: "#101828", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                  {f.value}
                </div>
              ) : f.type === "checks" ? (
                <div id={fid} role="group" style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "220px", overflowY: "auto", border: "1px solid #F2F4F7", borderRadius: "10px", padding: "6px 8px" }}>
                  {(f.options ?? []).map((o) => (
                    <label key={o.v} style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "12.5px", color: "#101828", minHeight: "32px", cursor: "pointer" }}>
                      <input type="checkbox" name={f.name} value={o.v} defaultChecked={!!o.on} style={{ width: "16px", height: "16px", accentColor: "#12A150" }} />
                      {o.t}
                    </label>
                  ))}
                  {!(f.options ?? []).length ? <span style={{ fontSize: "12px", color: "#667085", padding: "6px 0" }}>None available.</span> : null}
                </div>
              ) : (
                <input id={fid} name={f.name} type={f.type} defaultValue={f.value} placeholder={f.ph} autoFocus={f.af} min={f.min} max={f.max} style={inp} />
              )}
              {f.help ? <span style={{ fontSize: "11px", color: "#667085", lineHeight: 1.45 }}>{f.help}</span> : null}
            </div>
          );
        })}
        {m.note ? <div style={{ background: "#FEF6E7", border: "1px solid #FDE3B3", borderRadius: "10px", padding: "10px 12px", fontSize: "12px", color: "#7A2E0B", lineHeight: 1.5 }}>{m.note}</div> : null}
        {err ? (
          <div role="alert" style={{ background: "#FEF3F2", border: "1px solid #FDD9D6", borderRadius: "10px", padding: "10px 12px", fontSize: "12px", color: "#B42318", fontWeight: 700, lineHeight: 1.5 }}>
            {err}
          </div>
        ) : null}
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" onClick={onClose} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "10px 15px", fontSize: "12.5px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "42px" }}>
            {m.cancel ?? "Cancel"}
          </button>
          <button type="submit" disabled={busy} style={{ border: 0, background: m.pBg ?? "#12A150", borderRadius: "10px", padding: "10px 16px", fontSize: "12.5px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "42px" }}>
            {busy ? "Saving…" : m.primaryT}
          </button>
        </div>
      </form>
    </div>
  );
}

export function Toast({ msg }: { msg: string }) {
  return (
    <div role="status" aria-live="polite" style={{ position: "fixed", left: "50%", bottom: "22px", transform: "translateX(-50%)", background: "#0A1B2A", color: "#fff", borderRadius: "12px", padding: "12px 16px", fontSize: "12.5px", fontWeight: 600, zIndex: 120, boxShadow: "0 14px 40px rgba(10,27,42,.3)", maxWidth: "92vw", lineHeight: 1.45 }}>
      {msg}
    </div>
  );
}

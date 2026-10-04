"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import type { PBtn, PCard, PField, PKpi, PRowGroup, PSel } from "@/lib/payments-api";

/** Interactions the generic renderer reports back to the dispatcher. */
export interface RenderHandlers {
  kpiClick: (k: string) => void;
  blockAct: (k: string, blockId: string) => void;
  segPick: (blockId: string, k: string) => void;
  setQ: (blockId: string, v: string) => void;
  setF: (blockId: string, k: string, v: string) => void;
  clearF: (blockId: string) => void;
  pageGo: (d: number) => void;
  selRow: (id: string) => void;
  selAll: (ids: string[]) => void;
  rowOpen: (blockId: string, id: string) => void;
  rowAct: (blockId: string, id: string, v: string) => void;
  cardOpen: (blockId: string, id: string) => void;
  calOpen: (blockId: string, id: string) => void;
  sel: string[];
}

export const PAY_STYLES = `
.ui-pay *{box-sizing:border-box}
.ui-pay button,.ui-pay input,.ui-pay select,.ui-pay textarea{font-family:inherit}
.ui-pay button:disabled{cursor:not-allowed!important;opacity:.55}
.ui-pay :focus-visible{outline:2px solid #12A150;outline-offset:2px}
.ui-pay .ph-k:hover{border-color:#12A150!important;box-shadow:0 4px 14px rgba(10,27,42,.06)}
.ui-pay .ph-tr:hover{background:#F7FAF8!important}
.ui-pay .ph-q:hover{border-color:#12A150!important}
.ui-pay .ph-tab:hover{color:#0E8442!important}
@keyframes pyin{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:none}}
@keyframes pypulse{0%,100%{opacity:.35}50%{opacity:1}}
@keyframes pysk{0%,100%{opacity:.55}50%{opacity:1}}
@media(prefers-reduced-motion:reduce){.ui-pay *{animation:none!important;transition:none!important}}
@media(max-width:1180px){.ui-pay [data-2col="1"]{grid-template-columns:minmax(0,1fr)!important}.ui-pay [data-setnav]{flex-direction:row!important;overflow-x:auto;position:static!important}}
@media(max-width:1100px){.ui-pay [data-opt="1"]{display:none!important}}
@media(max-width:900px){.ui-pay [data-drawer]{width:100%!important}}
@media(max-width:760px){.ui-pay [data-tbl]{display:none!important}.ui-pay [data-cards]{display:flex!important}.ui-pay [data-main]{padding:12px!important}}
`;

export const Svg = ({ d, size = 18, stroke = "currentColor", w = 1.8, style }: { d: string; size?: number; stroke?: string; w?: number; style?: CSSProperties }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
    <path d={d} />
  </svg>
);

export const BtnV = ({ b, onClick, style }: { b: PBtn; onClick: () => void; style?: CSSProperties }) => (
  <button type="button" disabled={b.dis} title={b.why || undefined} onClick={onClick} style={{ border: `1px solid ${b.bd}`, background: b.bg, color: b.fg, borderRadius: 9, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", minHeight: 36, whiteSpace: "nowrap", ...style }}>
    {b.t}
  </button>
);

export function Kpis({ kpis, h }: { kpis: PKpi[]; h: RenderHandlers }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(168px,1fr))", gap: 10 }}>
      {kpis.map((k) => (
        <button key={k.k} type="button" className="ph-k" onClick={() => h.kpiClick(k.k)} aria-label={k.aria} style={{ textAlign: "left", background: "#fff", border: "1px solid #E6EAF0", borderRadius: 14, padding: "13px 14px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 6, minHeight: 92 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "#667085", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: k.dot }} />
            {k.l}
          </span>
          <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-.6px", color: k.fg }}>{k.v}</span>
          <span style={{ fontSize: 11, color: "#667085", lineHeight: 1.35 }}>{k.sub}</span>
        </button>
      ))}
    </div>
  );
}

const SelectF = ({ f, onChange }: { f: PSel; onChange: (v: string) => void }) => (
  <select aria-label={f.l} value={f.v} onChange={(e) => onChange(e.target.value)} style={{ border: `1px solid ${f.bd}`, background: f.bg ?? "#fff", borderRadius: 10, padding: "8px 10px", fontSize: 12, fontWeight: 600, color: "#344054", minHeight: 40, maxWidth: 190 }}>
    {f.opts.map((o) => (
      <option key={o.v} value={o.v}>
        {o.t}
      </option>
    ))}
  </select>
);

function Card({ b, h }: { b: PCard; h: RenderHandlers }) {
  const [q, setQ] = useState(b.filters?.q ?? "");
  const bid = b.id;
  const t = b.table;
  return (
    <section aria-label={b.title || undefined} style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, overflow: "hidden" }}>
      {b.title ? (
        <div style={{ padding: "14px 16px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid #F2F4F7" }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#0F172A", letterSpacing: "-.2px" }}>{b.title}</h2>
            {b.sub ? <div style={{ fontSize: 11.5, color: "#667085", marginTop: 3, lineHeight: 1.45 }}>{b.sub}</div> : null}
          </div>
          {b.acts.map((a) => (
            <BtnV key={a.k} b={a} onClick={() => h.blockAct(a.k, bid)} />
          ))}
        </div>
      ) : null}
      {b.seg ? (
        <div role="tablist" aria-label={b.title || "Views"} style={{ display: "flex", gap: 5, padding: "12px 16px 2px", flexWrap: "wrap" }}>
          {b.seg.map((s) => (
            <button key={s.k} type="button" role="tab" aria-selected={s.on} onClick={() => h.segPick(bid, s.k)} style={{ border: `1px solid ${s.bd}`, background: s.bg, color: s.fg, borderRadius: 20, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", minHeight: 34, display: "flex", gap: 6, alignItems: "center" }}>
              {s.t}
              {s.n ? <span style={{ fontSize: 10.5, fontWeight: 800, opacity: 0.75 }}>{s.n}</span> : null}
            </button>
          ))}
          {!b.title && b.acts.length ? <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>{b.acts.map((a) => <BtnV key={a.k} b={a} onClick={() => h.blockAct(a.k, bid)} />)}</span> : null}
        </div>
      ) : null}
      {b.filters ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "12px 16px", borderBottom: "1px solid #F2F4F7", alignItems: "center" }}>
          {b.filters.search ? (
            <input
              type="search"
              aria-label={b.filters.search}
              placeholder={b.filters.search}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                h.setQ(bid, e.target.value);
              }}
              style={{ flex: "1 1 240px", minWidth: 190, border: "1px solid #E6EAF0", borderRadius: 10, padding: "9px 12px", fontSize: 12.5, minHeight: 40 }}
            />
          ) : null}
          {b.filters.sels.map((f) => (
            <SelectF key={f.k} f={f} onChange={(v) => h.setF(bid, f.k, v)} />
          ))}
          {b.filters.nOn ? (
            <button type="button" onClick={() => { setQ(""); h.clearF(bid); }} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 10, padding: "8px 11px", fontSize: 12, fontWeight: 700, color: "#B42318", cursor: "pointer", minHeight: 40 }}>
              Clear filters ({b.filters.nOn})
            </button>
          ) : null}
          <span style={{ marginLeft: "auto", fontSize: 11.5, color: "#667085", fontWeight: 600 }}>{b.filters.count}</span>
        </div>
      ) : null}
      {t?.sel && h.sel.length ? (
        <div role="region" aria-label="Bulk actions" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", padding: "10px 16px", background: "#F7FCF9", borderBottom: "1px solid #D1F2DF" }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: "#0E8442", marginRight: 6 }}>{h.sel.length} selected</span>
          {b.bulk?.acts ? (
            b.bulk.acts.map((a) => <BtnV key={a.k} b={a} onClick={() => h.blockAct(a.k, bid)} style={{ borderRadius: 8, padding: "7px 11px", minHeight: 34 }} />)
          ) : (
            <>
              <button type="button" onClick={() => h.blockAct("bk-export", bid)} style={bulkBtn}>Export selected</button>
              <button type="button" onClick={() => h.blockAct("bk-refresh", bid)} style={bulkBtn}>Refresh provider state</button>
            </>
          )}
          <button type="button" onClick={() => h.selAll([])} style={{ marginLeft: "auto", border: 0, background: "transparent", fontSize: 12, fontWeight: 700, color: "#475467", cursor: "pointer", minHeight: 34 }}>Clear selection</button>
        </div>
      ) : null}
      {t ? (
        <>
          <div data-tbl="1" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: "#FAFBFC" }}>
                  {t.sel ? (
                    <th style={{ width: 40, padding: "10px 0 10px 16px", textAlign: "left", borderBottom: "1px solid #EEF1F4" }}>
                      <input type="checkbox" aria-label="Select all on this page" checked={t.rows.length > 0 && t.rows.every((r) => h.sel.includes(r.id))} onChange={() => h.selAll(t.rows.every((r) => h.sel.includes(r.id)) ? [] : t.rows.map((r) => r.id))} style={{ width: 16, height: 16, accentColor: "#12A150" }} />
                    </th>
                  ) : null}
                  {t.cols.map((c, i) => (
                    <th key={i} data-opt={c.opt} scope="col" style={{ textAlign: "left", padding: "10px 12px", fontSize: 11, fontWeight: 800, color: "#667085", letterSpacing: ".2px", whiteSpace: "nowrap", borderBottom: "1px solid #EEF1F4" }}>
                      {c.t}
                    </th>
                  ))}
                  {t.hasActs ? <th scope="col" style={{ textAlign: "right", padding: "10px 16px", fontSize: 11, fontWeight: 800, color: "#667085", borderBottom: "1px solid #EEF1F4" }}>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {t.rows.map((row) => {
                  const on = h.sel.includes(row.id);
                  return (
                    <tr key={row.id} className="ph-tr" onClick={(e) => { if ((e.target as HTMLElement).closest("[data-stop]")) return; h.rowOpen(bid, row.id); }} style={{ cursor: "pointer", background: on ? "#F7FCF9" : row.bg, borderBottom: "1px solid #F2F4F7" }}>
                      {t.sel ? (
                        <td data-stop="1" style={{ padding: "10px 0 10px 16px", verticalAlign: "top" }}>
                          <input type="checkbox" aria-label={row.selLabel} checked={on} onChange={() => h.selRow(row.id)} style={{ width: 16, height: 16, accentColor: "#12A150" }} />
                        </td>
                      ) : null}
                      {row.cells.map((c, i) => (
                        <td key={i} data-opt={c.opt} style={{ padding: "10px 12px", verticalAlign: "top", maxWidth: c.mw }}>
                          {c.bt ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 800, borderRadius: 6, padding: "3px 7px", background: c.bbg, color: c.bfg, whiteSpace: "nowrap" }}>{c.bt}</span> : null}
                          {c.t ? <div style={{ fontWeight: c.fw, color: c.fg, fontFamily: c.ff, lineHeight: 1.4, overflowWrap: "break-word" }}>{c.t}</div> : null}
                          {c.s ? <div style={{ fontSize: 11, color: "#667085", marginTop: 2, lineHeight: 1.35 }}>{c.s}</div> : null}
                        </td>
                      ))}
                      {t.hasActs ? (
                        <td data-stop="1" style={{ padding: "8px 16px 8px 8px", textAlign: "right", whiteSpace: "nowrap", verticalAlign: "top" }}>
                          <select aria-label={row.actLabel} value="" onChange={(e) => { const v = e.target.value; e.target.value = ""; if (v) h.rowAct(bid, row.id, v); }} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 8, padding: "6px 8px", fontSize: 12, fontWeight: 700, color: "#344054", minHeight: 34, cursor: "pointer" }}>
                            <option value="">Actions</option>
                            {row.acts.map((a) => (
                              <option key={a} value={a}>
                                {a}
                              </option>
                            ))}
                          </select>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div data-cards="1" style={{ display: "none", flexDirection: "column", gap: 8, padding: 12 }}>
            {t.rows.map((row) => (
              <div key={row.id} style={{ border: "1px solid #E6EAF0", borderRadius: 12, padding: 12, display: "flex", gap: 10, alignItems: "flex-start", background: row.bg }}>
                <button type="button" onClick={() => h.rowOpen(bid, row.id)} style={{ flex: 1, minWidth: 0, textAlign: "left", border: 0, background: "transparent", padding: 0, cursor: "pointer", font: "inherit", minHeight: 44 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#101828", lineHeight: 1.35 }}>{row.cardT}</div>
                  <div style={{ fontSize: 11.5, color: "#667085", marginTop: 3, lineHeight: 1.4 }}>{row.cardS}</div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
                    {row.cardB.map((x, i) => (
                      <span key={i} style={{ fontSize: 11, fontWeight: 800, borderRadius: 6, padding: "3px 7px", background: x.bg, color: x.fg }}>{x.t}</span>
                    ))}
                  </div>
                </button>
                {t.hasActs ? (
                  <select aria-label={row.actLabel} value="" onChange={(e) => { const v = e.target.value; e.target.value = ""; if (v) h.rowAct(bid, row.id, v); }} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 8, padding: 6, fontSize: 12, fontWeight: 700, color: "#344054", minHeight: 44, maxWidth: 96 }}>
                    <option value="">More</option>
                    {row.acts.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                ) : null}
              </div>
            ))}
          </div>
        </>
      ) : null}
      {b.bars ? (
        <div role="list" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {b.bars.map((x, i) => (
            <div key={i} role="listitem" aria-label={x.aria} style={{ display: "grid", gridTemplateColumns: "minmax(80px,130px) minmax(0,1fr) auto", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#344054", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.l}</span>
              <div style={{ height: 10, background: "#F2F4F7", borderRadius: 6, overflow: "hidden" }}>
                <div style={{ height: "100%", width: x.w, background: x.c, borderRadius: 6 }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#101828", textAlign: "right", minWidth: 44 }}>{x.v}</span>
            </div>
          ))}
        </div>
      ) : null}
      {b.trend ? (
        <div style={{ padding: "14px 16px" }}>
          <div style={{ display: "flex", gap: 14, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
            {b.trend.legend.map((g) => (
              <span key={g.t} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#475467", fontWeight: 600 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: g.c }} />
                {g.t}
              </span>
            ))}
            <span style={{ marginLeft: "auto", fontSize: 11, color: "#98A2B3" }}>{b.trend.note}</span>
          </div>
          <div role="img" aria-label={b.trend.aria} style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 150, borderBottom: "1px solid #EEF1F4" }}>
            {b.trend.cols.map((c, i) => (
              <div key={i} title={c.tip} style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 2 }}>
                {c.bars.map((x, j) => (
                  <div key={j} style={{ flex: 1, maxWidth: 16, height: x.h, background: x.c, borderRadius: "3px 3px 0 0" }} />
                ))}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 5, marginTop: 6 }}>
            {b.trend.cols.map((c, i) => (
              <div key={i} style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: 10, color: "#98A2B3", overflow: "hidden" }}>{c.l}</div>
            ))}
          </div>
        </div>
      ) : null}
      {b.qcards ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 10, padding: "14px 16px" }}>
          {b.qcards.map((q2) => (
            <button key={q2.id} type="button" className="ph-q" onClick={() => h.cardOpen(bid, q2.id)} aria-label={q2.aria} style={{ textAlign: "left", border: "1px solid #E6EAF0", background: q2.bg, borderRadius: 12, padding: 12, cursor: "pointer", display: "flex", flexDirection: "column", gap: 8, font: "inherit" }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#101828", flex: 1 }}>{q2.t}</span>
                <span style={{ fontSize: 10.5, fontWeight: 800, borderRadius: 6, padding: "2px 7px", background: q2.bbg, color: q2.bfg }}>{q2.badge}</span>
              </div>
              <div style={{ fontSize: 11.5, color: "#667085", lineHeight: 1.4 }}>{q2.d}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {q2.stats.map((s) => (
                  <div key={s.l} style={{ background: "#FAFBFC", borderRadius: 8, padding: "6px 8px" }}>
                    <div style={{ fontSize: 10.5, color: "#667085" }}>{s.l}</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: s.fg }}>{s.v}</div>
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>
      ) : null}
      {b.cal ? (
        <div style={{ padding: "12px 16px", overflowX: "auto" }}>
          <div role="grid" aria-label={b.cal.aria} style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(92px,1fr))", gap: 4, minWidth: 660 }}>
            {b.cal.head.map((d) => (
              <div key={d} role="columnheader" style={{ fontSize: 11, fontWeight: 800, color: "#667085", padding: "4px 6px" }}>{d}</div>
            ))}
            {b.cal.days.map((d, i) => (
              <div key={i} role="gridcell" style={{ minHeight: 78, border: `1px solid ${d.bd}`, background: d.bg, borderRadius: 8, padding: 5, display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 11, fontWeight: d.fw, color: d.fg }}>{d.d}</span>
                {d.items.map((it) => (
                  <button key={it.id} type="button" onClick={() => h.calOpen(bid, it.id)} title={it.t} style={{ textAlign: "left", border: 0, borderRadius: 6, padding: "4px 6px", fontSize: 10.5, fontWeight: 700, background: it.bg, color: it.fg, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minHeight: 24 }}>
                    {it.t}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {b.empty ? <Empty e={b.empty} onAct={(k) => h.blockAct(k, bid)} /> : null}
      {b.pager ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderTop: "1px solid #F2F4F7", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, color: "#667085", flex: 1 }}>{b.pager.t}</span>
          <button type="button" onClick={() => h.pageGo(-1)} disabled={b.pager.noPrev} style={pagerBtn}>Previous</button>
          <button type="button" onClick={() => h.pageGo(1)} disabled={b.pager.noNext} style={pagerBtn}>Next</button>
        </div>
      ) : null}
      {b.info ? <div style={{ padding: "10px 16px", fontSize: 11.5, color: "#475467", background: "#FAFBFC", borderTop: "1px solid #F2F4F7", lineHeight: 1.5 }}>{b.info}</div> : null}
    </section>
  );
}

const bulkBtn: CSSProperties = { border: "1px solid #E6EAF0", background: "#fff", borderRadius: 8, padding: "7px 11px", fontSize: 12, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 34 };
const pagerBtn: CSSProperties = { border: "1px solid #E6EAF0", background: "#fff", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 36 };

export function Empty({ e, onAct }: { e: { t: string; d: string; acts: PBtn[] }; onAct: (k: string) => void }) {
  return (
    <div style={{ padding: "36px 20px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 8 }}>
      <div style={{ width: 44, height: 44, borderRadius: 13, background: "#F2F4F7", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Svg d="M4 5h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4Z" size={20} stroke="#667085" w={2} />
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A" }}>{e.t}</div>
      {e.d ? <div style={{ fontSize: 12, color: "#667085", maxWidth: 420, lineHeight: 1.5 }}>{e.d}</div> : null}
      {e.acts.length ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 6 }}>
          {e.acts.map((a) => (
            <BtnV key={a.k} b={a} onClick={() => onAct(a.k)} style={{ borderRadius: 10, padding: "9px 14px", fontSize: 12.5, fontWeight: 800, minHeight: 40 }} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Rows({ rows, h }: { rows: PRowGroup[]; h: RenderHandlers }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {rows.map((r, i) => (
        <div key={i} data-2col={r.collapse} style={{ display: "grid", gridTemplateColumns: r.cols, gap: 14, alignItems: "start" }}>
          {r.blocks.map((b, j) => (
            <div key={j} style={{ minWidth: 0 }}>
              {b.card ? <Card b={b} h={h} /> : <Kpis kpis={b.kpis} h={h} />}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** One settings field (select / text / toggle / chips / read / buttons), value from the draft when edited. */
export function FieldRow({ f, value, onSet, onBtn }: { f: PField; value: unknown; onSet: (v: unknown) => void; onBtn: (k: string) => void }) {
  const ctl: CSSProperties = { border: "1px solid #E6EAF0", borderRadius: 10, padding: "8px 10px", fontSize: 12.5, minHeight: 40, width: "100%", background: "#fff", color: "#101828" };
  const on = f.isToggle ? Boolean(value) : false;
  const chosen = f.isChips ? ((value as string[]) ?? []) : [];
  return (
    <div style={{ display: "grid", gridTemplateColumns: f.cols, gap: "10px 14px", padding: "11px 0", borderBottom: "1px solid #F2F4F7", alignItems: "center" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#101828" }}>
          {f.l}
          {f.req ? <span style={{ color: "#B42318" }}> *</span> : null}
        </div>
        {f.h ? <div style={{ fontSize: 11.5, color: "#667085", marginTop: 3, lineHeight: 1.45 }}>{f.h}</div> : null}
      </div>
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {f.isSelect ? (
          <select aria-label={f.l} value={String(value ?? "")} disabled={f.dis} onChange={(e) => onSet(e.target.value)} style={ctl}>
            {(f.opts ?? []).map((o) => (
              <option key={o.v} value={o.v}>{o.t}</option>
            ))}
          </select>
        ) : null}
        {f.isText ? <input type={f.type} aria-label={f.l} value={String(value ?? "")} placeholder={f.ph} disabled={f.dis} onChange={(e) => onSet(f.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)} style={ctl} /> : null}
        {f.isToggle ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" role="switch" aria-checked={on} aria-label={f.l} disabled={f.dis} onClick={() => onSet(!on)} style={{ width: 44, height: 26, borderRadius: 14, border: 0, background: on ? "#12A150" : "#D0D5DD", position: "relative", cursor: "pointer", padding: 0, flex: "0 0 44px" }}>
              <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
            </button>
            <span style={{ fontSize: 11.5, color: "#475467" }}>{on ? "On" : "Off"}</span>
          </div>
        ) : null}
        {f.isChips ? (
          <div role="group" aria-label={f.l} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(f.chips ?? []).map((c) => {
              const s = chosen.includes(c.v);
              return (
                <button key={c.v} type="button" aria-pressed={s} disabled={f.dis} onClick={() => onSet(s ? chosen.filter((x) => x !== c.v) : [...chosen, c.v])} style={{ border: `1px solid ${s ? "#12A150" : "#E6EAF0"}`, background: s ? "#ECFDF3" : "#fff", borderRadius: 20, padding: "6px 11px", fontSize: 11.5, fontWeight: 700, color: s ? "#0E8442" : "#475467", cursor: "pointer", minHeight: 34 }}>
                  {s ? "✓" : "+"} {c.t}
                </button>
              );
            })}
          </div>
        ) : null}
        {f.isRead ? <div style={{ fontSize: 12.5, color: f.fg, background: "#FAFBFC", borderRadius: 9, padding: "8px 10px", lineHeight: 1.45, overflowWrap: "break-word" }}>{f.v}</div> : null}
        {f.btns ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {f.btns.map((b2) => (
              <BtnV key={b2.k} b={b2} onClick={() => onBtn(b2.k)} style={{ padding: "7px 11px" }} />
            ))}
          </div>
        ) : null}
        {f.warn ? <div style={{ fontSize: 11.5, fontWeight: 700, color: f.warnFg, lineHeight: 1.45 }}>{f.warn}</div> : null}
      </div>
    </div>
  );
}

export const Skeleton = () => (
  <div aria-busy="true" aria-label="Loading Payments & Billing" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(168px,1fr))", gap: 10 }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{ height: 92, background: "#fff", border: "1px solid #E6EAF0", borderRadius: 14, animation: "pysk 1.4s ease-in-out infinite" }} />
      ))}
    </div>
    <div style={{ height: 230, background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, animation: "pysk 1.4s ease-in-out infinite" }} />
    <div style={{ height: 300, background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, animation: "pysk 1.4s ease-in-out infinite" }} />
  </div>
);

export function Gate({ t, d, icon, bg, fg, act }: { t: string; d: string; icon: string; bg: string; fg: string; act?: ReactNode }) {
  return (
    <div role="alert" style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 18, padding: "44px 24px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 10 }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Svg d={icon} size={22} stroke={fg} w={2} />
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A", letterSpacing: "-.3px" }}>{t}</div>
      <div style={{ fontSize: 12.5, color: "#475467", maxWidth: 520, lineHeight: 1.6 }}>{d}</div>
      {act ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 6 }}>{act}</div> : null}
    </div>
  );
}

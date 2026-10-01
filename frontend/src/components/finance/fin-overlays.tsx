"use client";

import { useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { finApi, type Rec } from "@/lib/finance-api";
import { chip, errText, money } from "./fin-core";
import { useFin } from "./fin-store";
import type { FinAct } from "./fin-actions";

const TONES: Record<string, [string, string, string]> = {
  info: ["#F7FCF9", "#CDEBD8", "#0E6B3A"],
  warn: ["#FFFCF5", "#FEDF89", "#93370D"],
  bad: ["#FEF3F2", "#FDA29B", "#B42318"],
};

const inputSt: CSSProperties = { border: "1px solid #E6EAF0", borderRadius: "10px", padding: "11px 12px", fontSize: "13px", minHeight: "44px", width: "100%", background: "#fff" };

/** The design's generic modal: intro, key/values, lines, fields, live validation, error, buttons. */
export function FinModal() {
  const m = useFin((s) => s.modal);
  const mf = useFin((s) => s.mf);
  const mErr = useFin((s) => s.mErr);
  const mBusy = useFin((s) => s.mBusy);
  const files = useFin((s) => s.mfiles);
  const set = useFin((s) => s.set);
  const close = useFin((s) => s.closeModal);
  if (!m) return null;
  const it = TONES[m.introTone ?? "info"];
  const live = m.live ? m.live(mf) : null;
  const disErr = m.buttons.filter((b) => b.dis && b.why).map((b) => b.why).join(" ");
  const onBtn = async (i: number) => {
    const b = m.buttons[i];
    if (!b || b.dis || mBusy) return;
    if (b.run === "close") return close();
    const miss = (b.req ?? []).filter((k) => {
      const f = m.fields?.find((x) => x.k === k);
      return f?.type === "file" ? !files[k] : !String(mf[k] ?? "").trim();
    });
    if (miss.length) {
      const f = m.fields?.find((x) => x.k === miss[0]);
      set({ mErr: `${f ? f.l : "This field"} is required.` });
      return;
    }
    try {
      await b.run(mf, files);
    } catch (e) {
      set({ mErr: errText(e), mBusy: false });
    }
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,27,42,.45)", zIndex: 175, display: "flex", alignItems: "center", justifyContent: "center", padding: "18px" }}>
      <div role="dialog" aria-modal="true" aria-label={m.title} style={{ background: "#fff", borderRadius: "18px", width: m.wide ? "820px" : "620px", maxWidth: "100%", maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 30px 80px rgba(10,27,42,.3)", animation: "nxin .18s ease" }}>
        <div style={{ padding: "17px 20px", borderBottom: "1px solid #F0F2F5", display: "flex", gap: "12px", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "#0F172A", flex: 1 }}>{m.title}</h3>
          <button type="button" onClick={close} aria-label="Close" style={{ width: "34px", height: "34px", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", color: "#475467", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "13px" }}>
          {m.intro ? <div style={{ fontSize: "12.5px", color: it[2], background: it[0], border: `1px solid ${it[1]}`, borderRadius: "11px", padding: "10px 12px", fontWeight: 600, textWrap: "pretty" }}>{m.intro}</div> : null}
          {m.kv?.length ? (
            <div>
              {m.kv.map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: "14px", padding: "7px 0", borderBottom: "1px solid #F2F4F7" }}>
                  <span style={{ fontSize: "12.5px", color: "#667085" }}>{k}</span>
                  <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#101828", textAlign: "right", userSelect: "all" }}>{v}</span>
                </div>
              ))}
            </div>
          ) : null}
          {m.lines?.length ? (
            <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", overflow: "hidden", flexShrink: 0 }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) 100px 100px", gap: "8px", padding: "8px 12px", background: "#FAFBFC", fontSize: "11px", fontWeight: 800, color: "#667085" }}>
                <span>{m.linesTitle ?? "Lines"}</span>
                <span style={{ textAlign: "right" }}>Debit</span>
                <span style={{ textAlign: "right" }}>Credit</span>
              </div>
              {m.lines.map((l, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) 100px 100px", gap: "8px", padding: "8px 12px", borderTop: "1px solid #F2F4F7", fontSize: "12.5px" }}>
                  <span style={{ fontWeight: 700, color: "#101828" }}>{l.acct}</span>
                  <span style={{ textAlign: "right" }}>{l.dr}</span>
                  <span style={{ textAlign: "right" }}>{l.cr}</span>
                </div>
              ))}
            </div>
          ) : null}
          {(m.fields ?? []).map((f) => (
            <label key={f.k} style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              <span style={{ fontSize: "11px", fontWeight: 800, color: "#667085", textTransform: "uppercase", letterSpacing: ".3px" }}>
                {f.l}
                {f.req ? <span style={{ color: "#B42318" }}> *</span> : null}
              </span>
              {f.type === "sel" ? (
                <select value={mf[f.k] ?? ""} onChange={(e) => set((s) => ({ mf: { ...s.mf, [f.k]: e.target.value }, mErr: "" }))} style={{ ...inputSt, fontWeight: 600, color: "#344054" }}>
                  {(f.opts ?? []).map((o) => (typeof o === "string" ? <option key={o} value={o}>{o}</option> : <option key={o.v} value={o.v}>{o.l}</option>))}
                </select>
              ) : f.type === "area" ? (
                <textarea rows={3} value={mf[f.k] ?? ""} onChange={(e) => set((s) => ({ mf: { ...s.mf, [f.k]: e.target.value }, mErr: "" }))} placeholder={f.ph} className="fx-in" style={{ ...inputSt, resize: "vertical", minHeight: "80px" }} />
              ) : f.type === "file" ? (
                <input type="file" accept={f.accept} onChange={(e) => set((s) => ({ mfiles: { ...s.mfiles, [f.k]: e.target.files?.[0] ?? null }, mErr: "" }))} style={{ ...inputSt, padding: "9px 12px" }} />
              ) : (
                <input type={f.type === "date" ? "date" : "text"} inputMode={f.type === "number" ? "decimal" : undefined} value={mf[f.k] ?? ""} onChange={(e) => set((s) => ({ mf: { ...s.mf, [f.k]: e.target.value }, mErr: "" }))} placeholder={f.ph} className="fx-in" style={inputSt} />
              )}
            </label>
          ))}
          {live ? <div style={{ fontSize: "12.5px", fontWeight: 700, color: live.ok ? "#0E8442" : "#B54708", background: live.ok ? "#F7FCF9" : "#FFFCF5", borderRadius: "10px", padding: "10px 12px" }}>{live.t}</div> : null}
          {mErr || disErr ? <div role="alert" style={{ fontSize: "12.5px", fontWeight: 700, color: "#B42318", background: "#FEF3F2", border: "1px solid #FDA29B", borderRadius: "10px", padding: "10px 12px" }}>{mErr || disErr}</div> : null}
        </div>
        <div style={{ padding: "14px 20px", borderTop: "1px solid #F0F2F5", display: "flex", gap: "8px", justifyContent: "flex-end", flexWrap: "wrap" }}>
          {m.buttons.map((b, i) => {
            const dis = !!b.dis || mBusy;
            const k = b.kind;
            return (
              <button key={i} type="button" onClick={() => void onBtn(i)} disabled={dis} title={b.why} style={{ border: `1px solid ${k === "p" ? (dis ? "#D0D5DD" : "#12A150") : k === "d" ? "#FDA29B" : "#E6EAF0"}`, background: k === "p" ? (dis ? "#D0D5DD" : "#12A150") : "#fff", color: k === "p" ? "#fff" : k === "d" ? "#B42318" : "#344054", borderRadius: "10px", padding: "10px 16px", fontSize: "13px", fontWeight: 800, cursor: dis ? "not-allowed" : "pointer", minHeight: "44px" }}>
                {mBusy && k === "p" ? "Working…" : b.l}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** The 560px record drawer: overview (compare / three-way / key values / accountant detail), lines, source trace, lists. */
export function FinDrawer({ fin, scope }: { fin: FinAct; scope: Record<string, unknown> }) {
  const drawer = useFin((s) => s.drawer);
  const adv = useFin((s) => s.adv);
  const set = useFin((s) => s.set);
  const [opening, setOpening] = useState("");
  const q = useQuery({
    queryKey: ["fin", "record", drawer?.k, drawer?.id, scope],
    queryFn: () => finApi.record(drawer!.k, drawer!.id, scope),
    enabled: !!drawer,
  });
  if (!drawer) return null;
  const close = () => set({ drawer: null });
  const rec: Rec | undefined = q.data;
  const tab = rec ? (drawer.tab && rec.tabs.includes(drawer.tab) ? drawer.tab : rec.tabs[0]) : "Overview";
  const c = rec ? chip(rec.status) : { bg: "#F2F4F7", fg: "#475467" };
  const tone = TONES[rec?.noteTone ?? "info"] ?? TONES.info;
  const drT = rec ? rec.lines.reduce((a, l) => a + (l.dr ?? 0), 0) : 0;
  const crT = rec ? rec.lines.reduce((a, l) => a + (l.cr ?? 0), 0) : 0;
  const bal = Math.round((drT - crT) * 100) === 0;
  const list = rec && !["Overview", "Accounting", "Source"].includes(tab) ? rec.lists[tab] ?? [] : [];
  const openFile = async (k: string) => {
    setOpening(k);
    try {
      const r = await finApi.fileUrl(k);
      window.open(r.url, "_blank", "noopener");
    } catch (e) {
      useFin.getState().flash(errText(e));
    } finally {
      setOpening("");
    }
  };
  return (
    <>
      <div onClick={close} style={{ position: "fixed", inset: 0, background: "rgba(10,27,42,.36)", zIndex: 160 }} />
      <aside data-drawer="1" role="dialog" aria-modal="true" aria-label={rec?.title ?? "Record"} style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "560px", maxWidth: "100%", background: "#fff", zIndex: 165, boxShadow: "-18px 0 46px rgba(10,27,42,.18)", display: "flex", flexDirection: "column", animation: "nxslide .22s ease" }}>
        <div style={{ padding: "16px 18px 0", display: "flex", flexDirection: "column", gap: "10px", borderBottom: "1px solid #F0F2F5" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "11px", fontWeight: 800, color: "#98A2B3", textTransform: "uppercase", letterSpacing: ".4px" }}>{rec?.kind ?? "Loading"}</div>
              <h3 style={{ margin: "3px 0 0", fontSize: "17px", fontWeight: 800, color: "#0F172A", letterSpacing: "-.3px" }}>{rec?.title ?? (q.isError ? "Couldn’t load this record" : "…")}</h3>
              <div style={{ fontSize: "12px", color: "#667085", marginTop: "2px" }}>{rec?.sub ?? (q.isError ? errText(q.error) : "")}</div>
            </div>
            <button type="button" onClick={close} aria-label="Close" style={{ width: "36px", height: "36px", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", color: "#475467", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 36px" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          {rec ? (
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "11px", fontWeight: 800, padding: "3px 10px", borderRadius: "20px", background: c.bg, color: c.fg }}>{rec.status}</span>
              <span style={{ marginLeft: "auto", fontSize: "18px", fontWeight: 800, color: "#0F172A" }}>{rec.amount}</span>
            </div>
          ) : null}
          <div role="tablist" style={{ display: "flex", gap: "2px", overflowX: "auto" }}>
            {(rec?.tabs ?? []).map((t) => {
              const on = t === tab;
              return (
                <button key={t} type="button" role="tab" aria-selected={on} onClick={() => set({ drawer: { ...drawer, tab: t } })} style={{ border: 0, background: "transparent", padding: "10px 11px 11px", fontSize: "12.5px", fontWeight: on ? 800 : 600, color: on ? "#0E8442" : "#667085", cursor: "pointer", borderBottom: `2.5px solid ${on ? "#12A150" : "transparent"}`, whiteSpace: "nowrap", minHeight: "40px" }}>
                  {t}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {!rec ? <div style={{ fontSize: "12.5px", color: "#98A2B3" }}>{q.isError ? errText(q.error) : "Loading…"}</div> : null}
          {rec?.note ? <div style={{ background: tone[0], border: `1px solid ${tone[1]}`, borderRadius: "12px", padding: "11px 13px", fontSize: "12.5px", color: tone[2], fontWeight: 600, textWrap: "pretty" }}>{rec.note}</div> : null}
          {rec && tab === "Overview" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {rec.compare ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "12px" }}>
                      <div style={{ fontSize: "10.5px", fontWeight: 800, color: "#98A2B3", marginBottom: "6px" }}>BANK TRANSACTION</div>
                      {rec.compare.left.map(([k, v]) => (
                        <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: "8px", padding: "4px 0", fontSize: "12px" }}>
                          <span style={{ color: "#667085" }}>{k}</span>
                          <span style={{ fontWeight: 700, color: "#101828", textAlign: "right" }}>{v}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ border: "1px solid #BFE7CF", background: "#F7FCF9", borderRadius: "12px", padding: "12px" }}>
                      <div style={{ fontSize: "10.5px", fontWeight: 800, color: "#0E8442", marginBottom: "6px" }}>SUGGESTED NOXTILL RECORD</div>
                      {rec.compare.right.map(([k, v]) => (
                        <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: "8px", padding: "4px 0", fontSize: "12px" }}>
                          <span style={{ color: "#667085" }}>{k}</span>
                          <span style={{ fontWeight: 700, color: "#101828", textAlign: "right" }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", fontSize: "12px" }}>
                    <span style={{ fontWeight: 800, color: rec.compare.dfg }}>{rec.compare.diff}</span>
                    <span style={{ color: "#475467" }}>· {rec.compare.conf}</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#475467" }}>
                    <b style={{ color: "#101828" }}>Evidence:</b> {rec.compare.ev}
                  </div>
                </>
              ) : null}
              {rec.threeWay ? (
                <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", overflow: "hidden" }}>
                  <div style={{ padding: "9px 12px", background: "#FAFBFC", fontSize: "11px", fontWeight: 800, color: "#667085", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 70px", gap: "8px" }}>
                    <span>Three-way</span>
                    <span>PO</span>
                    <span>Receipt</span>
                    <span>Bill</span>
                    <span>Result</span>
                  </div>
                  {rec.threeWay.rows.map((w, i) => (
                    <div key={i} style={{ padding: "8px 12px", borderTop: "1px solid #F2F4F7", fontSize: "12px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 70px", gap: "8px" }}>
                      <span style={{ fontWeight: 700, color: "#101828" }}>{w.a}</span>
                      <span>{w.b}</span>
                      <span>{w.c}</span>
                      <span>{w.d}</span>
                      <span style={{ fontWeight: 800, color: w.fg }}>{w.e}</span>
                    </div>
                  ))}
                  <div style={{ padding: "8px 12px", borderTop: "1px solid #F2F4F7", fontSize: "11px", color: "#98A2B3" }}>{rec.threeWay.tol}</div>
                </div>
              ) : null}
              <div>
                {rec.kv.map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: "14px", padding: "8px 0", borderBottom: "1px solid #F2F4F7" }}>
                    <span style={{ fontSize: "12.5px", color: "#667085" }}>{k}</span>
                    <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#101828", textAlign: "right" }}>{v}</span>
                  </div>
                ))}
              </div>
              {adv && rec.adv.length ? (
                <div style={{ border: "1px dashed #D0D5DD", borderRadius: "12px", padding: "10px 12px", background: "#FAFBFC" }}>
                  <div style={{ fontSize: "10.5px", fontWeight: 800, color: "#667085", marginBottom: "4px" }}>ACCOUNTANT DETAIL</div>
                  {rec.adv.map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: "14px", padding: "5px 0", fontSize: "12px" }}>
                      <span style={{ color: "#667085" }}>{k}</span>
                      <span style={{ fontWeight: 700, color: "#101828", textAlign: "right", wordBreak: "break-all" }}>{v}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {!adv && rec.adv.length ? (
                <button type="button" onClick={() => set({ adv: true })} style={{ alignSelf: "flex-start", border: 0, background: "transparent", fontSize: "12px", fontWeight: 800, color: "#0E8442", cursor: "pointer", padding: "4px 0" }}>
                  Show accountant detail ›
                </button>
              ) : null}
            </div>
          ) : null}
          {rec && tab === "Accounting" ? (
            <>
              <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", overflow: "hidden" }}>
                <div role="row" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) 100px 100px", gap: "8px", padding: "9px 12px", background: "#FAFBFC", fontSize: "11px", fontWeight: 800, color: "#667085" }}>
                  <span>Account · description</span>
                  <span style={{ textAlign: "right" }}>Debit</span>
                  <span style={{ textAlign: "right" }}>Credit</span>
                </div>
                {rec.lines.map((l, i) => (
                  <div key={i} role="row" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) 100px 100px", gap: "8px", padding: "9px 12px", borderTop: "1px solid #F2F4F7", fontSize: "12.5px" }}>
                    <span>
                      <span style={{ display: "block", fontWeight: 700, color: "#101828" }}>{l.acct}</span>
                      <span style={{ fontSize: "11.5px", color: "#98A2B3" }}>{l.desc}</span>
                    </span>
                    <span style={{ textAlign: "right", fontWeight: 700 }}>{l.dr ? money(l.dr, rec.cur) : ""}</span>
                    <span style={{ textAlign: "right", fontWeight: 700 }}>{l.cr ? money(l.cr, rec.cur) : ""}</span>
                  </div>
                ))}
                {rec.lines.length ? (
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) 100px 100px", gap: "8px", padding: "10px 12px", borderTop: "2px solid #E6EAF0", fontSize: "12.5px", fontWeight: 800, color: "#101828" }}>
                    <span style={{ color: bal ? "#0E8442" : "#B42318" }}>{bal ? "✓ Balanced" : `✕ Out of balance by ${money(Math.abs(drT - crT), rec.cur)}`}</span>
                    <span style={{ textAlign: "right" }}>{money(drT, rec.cur)}</span>
                    <span style={{ textAlign: "right" }}>{money(crT, rec.cur)}</span>
                  </div>
                ) : null}
              </div>
              {!rec.lines.length ? <div style={{ fontSize: "12.5px", color: "#98A2B3" }}>No accounting lines yet.</div> : null}
            </>
          ) : null}
          {rec && tab === "Source" ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: "12px", color: "#667085", marginBottom: "10px" }}>Trace this amount back to where it started. Finance reads these records — it doesn’t edit them.</div>
              {rec.trace.map((t, i) => (
                <div key={i} style={{ display: "flex", gap: "12px" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "14px" }}>
                    <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#12A150", border: "3px solid #E8F7EE", flex: "0 0 12px", marginTop: "4px" }} />
                    <span style={{ flex: 1, width: "2px", background: "#E4E7EC", visibility: i === rec.trace.length - 1 ? "hidden" : "visible" }} />
                  </div>
                  <div style={{ flex: 1, display: "flex", gap: "10px", alignItems: "flex-start", paddingBottom: "14px" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "11px", fontWeight: 800, color: "#98A2B3", textTransform: "uppercase" }}>{t.mod}</div>
                      <div style={{ fontSize: "13px", fontWeight: 800, color: "#101828" }}>{t.ref}</div>
                      <div style={{ fontSize: "11.5px", color: "#667085" }}>{t.d}</div>
                    </div>
                    {t.href || t.open ? (
                      <button type="button" onClick={() => void fin.act(t.href ? `link:${t.href}` : t.open!)} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "8px", padding: "6px 10px", fontSize: "11.5px", fontWeight: 700, color: "#0E8442", cursor: "pointer", minHeight: "32px" }}>
                        Open
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
              {!rec.trace.length ? <div style={{ fontSize: "12.5px", color: "#98A2B3" }}>No source records.</div> : null}
            </div>
          ) : null}
          {rec && !["Overview", "Accounting", "Source"].includes(tab) ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {list.map((x, i) => (
                <div key={i} style={{ display: "flex", gap: "12px", padding: "10px 0", borderBottom: "1px solid #F2F4F7" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {x.k ? (
                      <button type="button" onClick={() => void openFile(x.k!)} style={{ border: 0, background: "transparent", padding: 0, fontSize: "12.5px", fontWeight: 700, color: "#0E8442", cursor: "pointer", textAlign: "left" }}>
                        {opening === x.k ? "Opening…" : x.t}
                      </button>
                    ) : (
                      <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>{x.t}</div>
                    )}
                    <div style={{ fontSize: "11.5px", color: "#98A2B3" }}>{x.s}</div>
                  </div>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#344054", textAlign: "right" }}>{x.v}</span>
                </div>
              ))}
              {!list.length ? <div style={{ padding: "18px 0", fontSize: "12.5px", color: "#98A2B3" }}>Nothing here yet.</div> : null}
              {(tab === "Evidence" || tab === "Documents") && rec.evidence ? (
                <button type="button" onClick={() => void fin.act(`attach:${rec.evidence!.type}:${rec.evidence!.id}`)} style={{ alignSelf: "flex-start", marginTop: "10px", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "8px 12px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "38px" }}>
                  Attach Evidence
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        {rec ? (
          <div style={{ padding: "13px 18px", borderTop: "1px solid #F0F2F5", display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
              {rec.actions.map((b, i) => {
                const k = b.kind;
                const dis = !!b.dis || !b.a;
                return (
                  <button key={i} type="button" onClick={() => !dis && void fin.act(b.a)} disabled={dis} title={b.why} style={{ border: `1px solid ${k === "p" ? "#12A150" : k === "d" ? "#FDA29B" : "#E6EAF0"}`, background: k === "p" ? "#12A150" : "#fff", color: k === "p" ? "#fff" : k === "d" ? "#B42318" : "#344054", borderRadius: "10px", padding: "10px 14px", fontSize: "12.5px", fontWeight: 800, cursor: dis ? "not-allowed" : "pointer", opacity: dis ? 0.5 : 1, minHeight: "44px" }}>
                    {b.l}
                  </button>
                );
              })}
            </div>
            {rec.actions.filter((a) => (a.dis || !a.a) && a.why).map((a, i) => (
              <div key={i} style={{ fontSize: "11px", color: "#98A2B3", textAlign: "right" }}>
                {a.l}: {a.why}
              </div>
            ))}
          </div>
        ) : null}
      </aside>
    </>
  );
}

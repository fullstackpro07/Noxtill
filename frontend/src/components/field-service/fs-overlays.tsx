"use client";

import { useRef, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
import { fsApi, type FsDrawer } from "@/lib/field-service-api";
import { BtnV } from "@/components/payments/pay-render";
import type { AValues } from "@/components/assets/am-store";
import { CameraScanner } from "@/components/assets/am-scanner";
import { fsScopeOf, useFs } from "./fs-store";

/** Record drawer (fs-ui.js vDrawer). Approval items carry Approve / Reject buttons. */
export function FsDrawerView({ onAct, onDecide }: { onAct: (k: string, kind: string, id: string, v?: FsDrawer) => void; onDecide: (id: string, approve: boolean) => void }) {
  const dr = useFs((s) => s.drawer);
  const set = useFs((s) => s.set);
  const scope = useFs(useShallow(fsScopeOf));
  const q = useQuery({ queryKey: ["fs", "drawer", dr?.kind, dr?.id, scope.zone], queryFn: () => fsApi.drawer(dr!.kind, dr!.id, scope), enabled: !!dr });
  if (!dr) return null;
  const v = q.data;
  return (
    <>
      <div onClick={() => set({ drawer: null })} style={{ position: "fixed", inset: 0, background: "rgba(10,27,42,.35)", zIndex: 160 }} />
      <aside data-drawer="1" role="dialog" aria-modal="true" aria-label={v?.title ?? "Details"} style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 500, maxWidth: "100%", background: "#fff", zIndex: 161, display: "flex", flexDirection: "column", boxShadow: "-20px 0 60px rgba(10,27,42,.18)", animation: "pyin .22s ease" }}>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid #F2F4F7", display: "flex", gap: 10, alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".5px", textTransform: "uppercase", color: "#0E8442" }}>{v?.kicker ?? "Loading…"}</div>
            <h2 style={{ margin: "5px 0 0", fontSize: 17, fontWeight: 800, color: "#0F172A", letterSpacing: "-.3px", lineHeight: 1.3 }}>{v?.title ?? (q.error ? "Couldn’t load" : "")}</h2>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {(v?.badges ?? []).map((b, i) => (
                <span key={i} style={{ fontSize: 10.5, fontWeight: 800, borderRadius: 6, padding: "3px 7px", background: b.bg, color: b.fg }}>{b.t}</span>
              ))}
            </div>
          </div>
          <button type="button" onClick={() => set({ drawer: null })} aria-label="Close" style={{ width: 38, height: 38, border: "1px solid #E6EAF0", background: "#fff", borderRadius: 9, cursor: "pointer", color: "#344054", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 18px 18px" }}>
          {q.error ? <p style={{ fontSize: 12.5, color: "#B42318", marginTop: 14 }}>{(q.error as Error).message}</p> : null}
          {(v?.sections ?? []).map((x, i) => (
            <section key={i} style={{ padding: "14px 0", borderBottom: "1px solid #F2F4F7" }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".5px", textTransform: "uppercase", color: "#667085", marginBottom: 8 }}>{x.h}</div>
              {x.warn ? <div style={{ background: "#FEF6E7", border: "1px solid #FDE3B3", borderRadius: 10, padding: "9px 11px", fontSize: 12, color: "#7A2E0B", lineHeight: 1.5, marginBottom: 8 }}>{x.warn}</div> : null}
              {x.text ? <p style={{ margin: 0, fontSize: 12.5, color: "#344054", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{x.text}</p> : null}
              {x.bullets ? (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: "#344054", lineHeight: 1.6 }}>
                  {x.bullets.map((b, j) => (
                    <li key={j}>{b}</li>
                  ))}
                </ul>
              ) : null}
              {x.kv ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {x.kv.map((p, j) => (
                    <div key={j} style={{ background: "#FAFBFC", borderRadius: 9, padding: "9px 10px", minWidth: 0 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: "#667085" }}>{p.k}</div>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: "#101828", marginTop: 2, lineHeight: 1.35, overflowWrap: "anywhere" }}>{p.v}</div>
                    </div>
                  ))}
                </div>
              ) : null}
              {x.items ? (
                <div style={{ border: "1px solid #F2F4F7", borderRadius: 10, overflow: "hidden" }}>
                  {x.items.map((it, j) => (
                    <div key={j} style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: 10, padding: "9px 11px", borderBottom: "1px solid #F2F4F7", alignItems: "center" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#101828", overflowWrap: "anywhere" }}>{it.a}</div>
                        <div style={{ fontSize: 10.5, color: "#667085", marginTop: 2, overflowWrap: "anywhere" }}>{it.c}</div>
                      </div>
                      <div style={{ textAlign: "right", minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#101828" }}>{it.b}</div>
                        <div style={{ fontSize: 10.5, color: "#0E8442", marginTop: 2 }}>{it.d}</div>
                        {v?.decidable && it.id ? (
                          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", marginTop: 4 }}>
                            <button type="button" onClick={() => onDecide(it.id!, true)} style={{ border: 0, background: "#12A150", borderRadius: 7, padding: "4px 9px", fontSize: 11, fontWeight: 800, color: "#fff", cursor: "pointer" }}>Approve</button>
                            <button type="button" onClick={() => onDecide(it.id!, false)} style={{ border: "1px solid #FDD9D6", background: "#fff", borderRadius: 7, padding: "4px 9px", fontSize: 11, fontWeight: 700, color: "#B42318", cursor: "pointer" }}>Reject</button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ))}
        </div>
        {v?.hasActs && v.acts.length ? (
          <div style={{ padding: "12px 18px", borderTop: "1px solid #F2F4F7", display: "flex", gap: 6, flexWrap: "wrap" }}>
            {v.acts.map((a) => (
              <BtnV key={a.k} b={a} onClick={() => onAct(a.k, dr.kind, dr.id, v)} style={{ fontWeight: 800, padding: "9px 12px", minHeight: 40 }} />
            ))}
          </div>
        ) : null}
      </aside>
    </>
  );
}

export function FsModalView() {
  const m = useFs((s) => s.modal);
  const err = useFs((s) => s.modalErr);
  const busy = useFs((s) => s.busy);
  const set = useFs((s) => s.set);
  const close = useFs((s) => s.closeModal);
  const formRef = useRef<HTMLFormElement>(null);
  if (!m) return null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const v: AValues = {};
    for (const f of m.fields) {
      if (f.type === "checks") v[f.name] = fd.getAll(f.name).map(String);
      else if (f.type === "file") {
        const file = fd.get(f.name);
        v[f.name] = file instanceof File && file.size ? file : null;
        if (f.req && !v[f.name]) return set({ modalErr: `${f.label} is required.` });
      } else if (f.type !== "read" && f.type !== "qr" && f.type !== "camera") v[f.name] = String(fd.get(f.name) ?? "").trim();
      if (f.req && f.type !== "checks" && f.type !== "file" && f.type !== "read" && f.type !== "camera" && !v[f.name]) return set({ modalErr: `${f.label} is required.` });
    }
    const cur = m;
    set({ busy: true, modalErr: null });
    try {
      const r = await m.onSubmit(v);
      if (typeof r === "string" && r !== "keep") set({ modalErr: r, busy: false });
      else if (r === "keep") set({ busy: false });
      else if (useFs.getState().modal === cur) close();
    } catch (x) {
      set({ modalErr: (x as Error).message, busy: false });
    }
  };
  const inp = { border: "1px solid #E6EAF0", borderRadius: 10, padding: 10, fontSize: 12.5, minHeight: 42 } as const;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,27,42,.45)", zIndex: 180, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <form ref={formRef} key={`${m.title}|${m.sub ?? ""}|${m.primaryT}|${m.fields.map((f) => f.name + (f.value ?? "")).join(",")}`} onSubmit={submit} role="dialog" aria-modal="true" aria-label={m.title} style={{ width: m.wide ? 680 : 540, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto", background: "#fff", borderRadius: 18, padding: 20, display: "flex", flexDirection: "column", gap: 13, boxShadow: "0 30px 80px rgba(10,27,42,.3)" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#0F172A", letterSpacing: "-.3px" }}>{m.title}</h2>
          {m.sub ? <p style={{ margin: "5px 0 0", fontSize: 12.5, color: "#475467", lineHeight: 1.55, overflowWrap: "anywhere" }}>{m.sub}</p> : null}
        </div>
        {m.fields.map((f) => {
          const id = `amf_${f.name}`;
          return (
            <div key={f.name} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor={id} style={{ fontSize: 12, fontWeight: 700, color: "#344054" }}>
                {f.label}
                {f.req ? <span style={{ color: "#B42318" }}> *</span> : null}
              </label>
              {f.type === "select" ? (
                <select id={id} name={f.name} defaultValue={f.value ?? ""} autoFocus={f.af} style={{ ...inp, background: "#fff" }}>
                  {(f.options ?? []).map((o) => (
                    <option key={o.v} value={o.v}>{o.t}</option>
                  ))}
                </select>
              ) : f.type === "area" ? (
                <textarea id={id} name={f.name} rows={f.rows ?? 3} defaultValue={f.value ?? ""} placeholder={f.ph} autoFocus={f.af} style={{ ...inp, resize: "vertical", lineHeight: 1.5 }} />
              ) : f.type === "read" ? (
                <div id={id} style={{ background: "#FAFBFC", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, color: "#101828", lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{f.value}</div>
              ) : f.type === "camera" ? (
                <CameraScanner
                  onCode={(code) => {
                    const el = formRef.current?.querySelector<HTMLInputElement>(`#amf_${f.target ?? "code"}`);
                    if (el) el.value = code;
                    formRef.current?.requestSubmit();
                  }}
                />
              ) : f.type === "file" ? (
                <input id={id} name={f.name} type="file" accept={f.accept} style={{ fontSize: 12 }} />
              ) : f.type === "checks" ? (
                <div id={id} role="group" style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto", border: "1px solid #F2F4F7", borderRadius: 10, padding: "6px 8px" }}>
                  {(f.options ?? []).length ? (
                    (f.options ?? []).map((o) => (
                      <label key={o.v} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: "#101828", minHeight: 32, cursor: "pointer" }}>
                        <input type="checkbox" name={f.name} value={o.v} defaultChecked={o.on} style={{ width: 16, height: 16, accentColor: "#12A150" }} />
                        {o.t}
                      </label>
                    ))
                  ) : (
                    <span style={{ fontSize: 12, color: "#667085", padding: "6px 0" }}>Nothing available.</span>
                  )}
                </div>
              ) : (
                <input id={id} name={f.name} type={f.type} step={f.type === "number" ? "any" : undefined} defaultValue={f.value ?? ""} placeholder={f.ph} autoFocus={f.af} style={inp} />
              )}
              {f.help ? <span style={{ fontSize: 11, color: "#667085", lineHeight: 1.45 }}>{f.help}</span> : null}
            </div>
          );
        })}
        {m.note ? <div style={{ background: "#FEF6E7", border: "1px solid #FDE3B3", borderRadius: 10, padding: "10px 12px", fontSize: 12, color: "#7A2E0B", lineHeight: 1.5 }}>{m.note}</div> : null}
        {err ? <div role="alert" style={{ background: "#FEF3F2", border: "1px solid #FDD9D6", borderRadius: 10, padding: "10px 12px", fontSize: 12, color: "#B42318", fontWeight: 700, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{err}</div> : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" onClick={() => (m.back ? m.back() : close())} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 10, padding: "10px 15px", fontSize: 12.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 42 }}>{m.cancel ?? "Cancel"}</button>
          <button type="submit" disabled={busy} style={{ border: 0, background: m.pBg ?? "#12A150", borderRadius: 10, padding: "10px 16px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 42 }}>{busy ? "Working…" : m.primaryT}</button>
        </div>
      </form>
    </div>
  );
}

export function FsToast() {
  const t = useFs((s) => s.toast);
  if (!t) return null;
  return (
    <div role="status" aria-live="polite" style={{ position: "fixed", left: "50%", bottom: 22, transform: "translateX(-50%)", background: "#0A1B2A", color: "#fff", borderRadius: 12, padding: "12px 16px", fontSize: 12.5, fontWeight: 600, zIndex: 190, boxShadow: "0 14px 40px rgba(10,27,42,.3)", maxWidth: "92vw", lineHeight: 1.45 }}>
      {t}
    </div>
  );
}

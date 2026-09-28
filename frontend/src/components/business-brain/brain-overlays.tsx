"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createWatch, dismissFinding, editAction, fetchWatchOptions, type FindingCard } from "@/lib/brain-api";
import { useBrainStore } from "./brain-store";
import { useFindingActions } from "./finding-actions";
import { Btn, CONF, PRIO, errorText, eyebrow, useBrainInvalidate } from "./brain-ui";

const closeIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

function Drawer({ prio, fg, bg, title, sub, children, footer }: { prio: string; fg: string; bg: string; title: string; sub: string; children: ReactNode; footer: ReactNode }) {
  const close = useBrainStore((s) => s.close);
  return (
    <div role="dialog" aria-label="Intelligence detail" data-drawer="1" style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "470px", maxWidth: "100vw", background: "#fff", borderLeft: "1px solid #E6EAF0", boxShadow: "-20px 0 50px rgba(16,24,40,.14)", zIndex: 95, display: "flex", flexDirection: "column", animation: "bbin .22s ease" }}>
      <div style={{ padding: "16px 18px", borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "flex-start", gap: "12px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "10px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: fg, background: bg, borderRadius: "5px", padding: "3px 7px", display: "inline-block" }}>{prio}</div>
          <h2 style={{ margin: "8px 0 0", fontSize: "16px", fontWeight: 800, color: "#0F172A", lineHeight: 1.35 }}>{title}</h2>
          <div style={{ fontSize: "11px", color: "#98A2B3", marginTop: "5px" }}>{sub}</div>
        </div>
        <button type="button" onClick={close} aria-label="Close" className="bb-soft" style={{ width: "34px", height: "34px", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", cursor: "pointer", color: "#475467", flex: "0 0 34px" }}>
          {closeIcon}
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "18px", display: "flex", flexDirection: "column", gap: "16px" }}>{children}</div>
      <div style={{ borderTop: "1px solid #F0F2F5", padding: "14px 18px", display: "flex", gap: "9px", flexWrap: "wrap" }}>{footer}</div>
    </div>
  );
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ ...eyebrow, marginBottom: "7px" }}>{label}</div>
      {children}
    </div>
  );
}

const bigBtn = (primary: boolean) =>
  ({
    flex: primary ? 1 : undefined,
    minWidth: primary ? "150px" : undefined,
    border: primary ? 0 : "1px solid #E6EAF0",
    background: primary ? "#12A150" : "#fff",
    borderRadius: "11px",
    padding: "12px 16px",
    fontSize: "12.5px",
    fontWeight: primary ? 800 : 700,
    color: primary ? "#fff" : "#344054",
    cursor: "pointer",
    minHeight: "46px",
  }) as const;

function FindingDrawer({ f }: { f: FindingCard }) {
  const router = useRouter();
  const close = useBrainStore((s) => s.close);
  const fa = useFindingActions();
  const p = PRIO[f.kind];
  const c = CONF[f.conf];
  const primaryLabel = f.action ? (f.action.prepared ? "Prepared — review it" : "Prepare this action") : f.link ? f.link.label : null;
  return (
    <Drawer
      prio={f.kind}
      fg={p.fg}
      bg={p.bg}
      title={f.t}
      sub={`${f.src} · ${f.urgency}`}
      footer={
        <>
          {primaryLabel && (
            <button
              type="button"
              className="bb-primary"
              disabled={fa.prepare.isPending}
              onClick={() => {
                if (f.action) {
                  close();
                  fa.primary(f);
                } else if (f.link) {
                  close();
                  router.push(f.link.href);
                }
              }}
              style={bigBtn(true)}
            >
              {primaryLabel}
            </button>
          )}
          {f.diagnose && (
            <button type="button" className="bb-soft" onClick={() => fa.diagnose(f)} style={bigBtn(false)}>
              Diagnose
            </button>
          )}
          <button type="button" className="bb-soft" onClick={close} style={{ ...bigBtn(false), color: "#475467" }}>
            Close
          </button>
        </>
      }
    >
      <Block label="What happened">
        <div style={{ fontSize: "12.5px", color: "#344054", lineHeight: 1.6 }}>{f.what}</div>
      </Block>
      <Block label="Why it matters">
        <div style={{ fontSize: "12.5px", color: "#344054", lineHeight: 1.6 }}>{f.why}</div>
      </Block>
      <Block label="Evidence">
        <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
          {f.evidence.map((e, i) => (
            <div key={i} style={{ border: "1px solid #E6EAF0", borderRadius: "11px", padding: "11px 12px", display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#101828" }}>{e.t}</span>
                <span style={{ display: "block", fontSize: "11px", color: "#667085", marginTop: "3px", lineHeight: 1.45 }}>{e.d}</span>
              </span>
              {e.link && (
                <button
                  type="button"
                  className="bb-soft"
                  title={e.link.label}
                  onClick={() => {
                    close();
                    router.push(e.link!.href);
                  }}
                  style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "8px", padding: "7px 10px", fontSize: "11px", fontWeight: 700, color: "#0E8442", cursor: "pointer", minHeight: "36px", flex: "0 0 auto" }}
                >
                  Source
                </button>
              )}
            </div>
          ))}
        </div>
      </Block>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "9px" }}>
        <div style={{ border: "1px solid #E6EAF0", borderRadius: "11px", padding: "11px" }}>
          <div style={{ fontSize: "10.5px", fontWeight: 700, color: "#667085" }}>Confidence</div>
          <div style={{ fontSize: "14px", fontWeight: 800, color: c.fg, marginTop: "3px" }}>{f.conf}</div>
          <div style={{ fontSize: "10.5px", color: "#98A2B3", marginTop: "4px", lineHeight: 1.45 }}>{f.confWhy}</div>
        </div>
        <div style={{ border: "1px solid #E6EAF0", borderRadius: "11px", padding: "11px" }}>
          <div style={{ fontSize: "10.5px", fontWeight: 700, color: "#667085" }}>Data freshness</div>
          <div style={{ fontSize: "14px", fontWeight: 800, color: "#0F172A", marginTop: "3px" }}>Live</div>
          <div style={{ fontSize: "10.5px", color: "#98A2B3", marginTop: "4px", lineHeight: 1.45 }}>Read from your records when this screen loaded. Nothing here is cached.</div>
        </div>
      </div>
      <Block label="Modules involved">
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {f.modules.map((m) => (
            <span key={m} style={{ fontSize: "11px", fontWeight: 700, color: "#475467", background: "#F2F4F7", borderRadius: "20px", padding: "5px 11px" }}>
              {m}
            </span>
          ))}
        </div>
      </Block>
      <div style={{ background: "#F7FCF9", border: "1px solid #D5EFE0", borderRadius: "13px", padding: "14px" }}>
        <div style={{ ...eyebrow, color: "#0E8442" }}>Recommended</div>
        <div style={{ fontSize: "13px", fontWeight: 800, color: "#101828", marginTop: "7px" }}>{f.rec}</div>
        <div style={{ fontSize: "11.5px", color: "#475467", marginTop: "5px", lineHeight: 1.55 }}>{f.recWhy}</div>
        {f.limit && <div style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: "9px", padding: "9px 11px", marginTop: "10px", fontSize: "11px", fontWeight: 700, color: "#93370D", lineHeight: 1.5 }}>{f.limit}</div>}
        {f.action?.blockedReason && <div style={{ background: "#FEF3F2", border: "1px solid #FDD9D6", borderRadius: "9px", padding: "9px 11px", marginTop: "10px", fontSize: "11px", fontWeight: 700, color: "#912018", lineHeight: 1.5 }}>{f.action.blockedReason}</div>}
        <div style={{ fontSize: "10.5px", color: "#98A2B3", marginTop: "9px" }}>Who acts: {f.who}</div>
      </div>
    </Drawer>
  );
}

function Modal({ title, sub, children, footer, width = 460 }: { title: string; sub?: string; children: ReactNode; footer: ReactNode; width?: number }) {
  const close = useBrainStore((s) => s.close);
  return (
    <div onClick={close} style={{ position: "fixed", inset: 0, background: "rgba(16,24,40,.42)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()} style={{ width: `${width}px`, maxWidth: "100%", maxHeight: "90vh", background: "#fff", borderRadius: "16px", boxShadow: "0 24px 60px rgba(16,24,40,.24)", display: "flex", flexDirection: "column", animation: "bbin .2s ease" }}>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "flex-start", gap: "12px" }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: "15.5px", fontWeight: 800, color: "#0F172A" }}>{title}</h2>
            {sub && <div style={{ fontSize: "11.5px", color: "#98A2B3", marginTop: "4px", lineHeight: 1.5 }}>{sub}</div>}
          </div>
          <button type="button" onClick={close} aria-label="Close" className="bb-soft" style={{ width: "34px", height: "34px", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", cursor: "pointer", color: "#475467" }}>
            {closeIcon}
          </button>
        </div>
        <div style={{ padding: "18px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "13px" }}>{children}</div>
        <div style={{ borderTop: "1px solid #F0F2F5", padding: "13px 18px", display: "flex", gap: "9px", justifyContent: "flex-end", flexWrap: "wrap" }}>{footer}</div>
      </div>
    </div>
  );
}

const input = { width: "100%", border: "1px solid #E6EAF0", borderRadius: "10px", padding: "10px 12px", fontSize: "12.5px", color: "#101828", minHeight: "42px", boxSizing: "border-box" } as const;
const lbl = { display: "block", fontSize: "11.5px", fontWeight: 700, color: "#344054", marginBottom: "6px" } as const;

function DismissModal({ k, title }: { k: string; title: string }) {
  const { close, flash } = useBrainStore();
  const invalidate = useBrainInvalidate();
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: () => dismissFinding(k, title, reason.trim() || undefined),
    onSuccess: () => {
      close();
      flash("Dismissed. It stays hidden until you restore it on Memory & Rules.");
      void invalidate();
    },
    onError: (e) => flash(errorText(e)),
  });
  return (
    <Modal title="Dismiss this finding" sub={title} footer={<><Btn onClick={close}>Keep it</Btn><Btn primary disabled={m.isPending} onClick={() => m.mutate()}>Dismiss</Btn></>}>
      <label>
        <span style={lbl}>Why? (kept in the decision log)</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} placeholder="e.g. Already handled by phone" style={{ ...input, resize: "vertical" }} />
      </label>
      <div style={{ fontSize: "11px", color: "#98A2B3" }}>It will not be raised again while dismissed. Restore it any time from Memory &amp; Rules.</div>
    </Modal>
  );
}

function WatchCreateModal() {
  const { close, flash } = useBrainStore();
  const invalidate = useBrainInvalidate();
  const [metric, setMetric] = useState("product_stock");
  const [q, setQ] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [op, setOp] = useState<"lt" | "gt" | "outside">("lt");
  const [t1, setT1] = useState("");
  const [t2, setT2] = useState("");
  const opts = useQuery({ queryKey: ["brain-watch-options", q], queryFn: () => fetchWatchOptions(q || undefined) });
  const def = opts.data?.metrics.find((m) => m.key === metric);
  const subjects = def?.needsSubject === "product" ? (opts.data?.products ?? []).map((p) => ({ id: p.id, name: `${p.name} (${p.stockQty} in stock)` })) : def?.needsSubject === "customer" ? (opts.data?.customers ?? []) : def?.needsSubject === "branch" ? (opts.data?.branches ?? []) : [];
  const valid = !!def && (!def.needsSubject || !!subjectId) && t1 !== "" && !Number.isNaN(Number(t1)) && (op !== "outside" || (t2 !== "" && Number(t2) > Number(t1)));
  const m = useMutation({
    mutationFn: () => createWatch({ metric, subjectId: def?.needsSubject ? subjectId : undefined, op, threshold: Number(t1), threshold2: op === "outside" ? Number(t2) : undefined }),
    onSuccess: () => {
      close();
      flash("Watching. It is checked every hour and you are told once when it moves.");
      void invalidate();
    },
    onError: (e) => flash(errorText(e)),
  });
  return (
    <Modal title="Watch something" sub="Pick a figure and a line. Business Brain checks it every hour and notifies owners and managers once when it crosses." footer={<><Btn onClick={close}>Cancel</Btn><Btn primary disabled={!valid || m.isPending} onClick={() => m.mutate()}>Start watching</Btn></>}>
      <label>
        <span style={lbl}>What to watch</span>
        <select value={metric} onChange={(e) => { setMetric(e.target.value); setSubjectId(""); setQ(""); }} style={input}>
          {(opts.data?.metrics ?? []).map((x) => (
            <option key={x.key} value={x.key}>
              {x.label}
            </option>
          ))}
        </select>
      </label>
      {def?.needsSubject && (
        <label>
          <span style={lbl}>Which {def.needsSubject}</span>
          {def.needsSubject !== "branch" && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${def.needsSubject}s`} style={{ ...input, marginBottom: "7px" }} />}
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} style={input}>
            <option value="">{opts.isLoading ? "Loading…" : subjects.length ? `Choose a ${def.needsSubject}` : `No ${def.needsSubject}s found`}</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div style={{ display: "grid", gridTemplateColumns: op === "outside" ? "1fr 1fr 1fr" : "1fr 1fr", gap: "9px" }}>
        <label>
          <span style={lbl}>Tell me when it</span>
          <select value={op} onChange={(e) => setOp(e.target.value as "lt" | "gt" | "outside")} style={input}>
            <option value="lt">falls below</option>
            <option value="gt">goes above</option>
            <option value="outside">leaves a range</option>
          </select>
        </label>
        <label>
          <span style={lbl}>{op === "outside" ? "Low" : "Value"} ({def?.unit ?? ""})</span>
          <input type="number" value={t1} onChange={(e) => setT1(e.target.value)} style={input} />
        </label>
        {op === "outside" && (
          <label>
            <span style={lbl}>High ({def?.unit ?? ""})</span>
            <input type="number" value={t2} onChange={(e) => setT2(e.target.value)} style={input} />
          </label>
        )}
      </div>
    </Modal>
  );
}

function AnswerModal() {
  const modal = useBrainStore((s) => s.modal);
  const close = useBrainStore((s) => s.close);
  if (modal?.type !== "answer") return null;
  const a = modal.answer;
  return (
    <Modal width={620} title={a.question} sub={`Answered from ${a.source} · ${new Date(a.askedAt).toLocaleString()}`} footer={<Btn primary onClick={close}>Done</Btn>}>
      <div style={{ fontSize: "12.5px", color: "#344054", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{a.answer}</div>
      {a.note && <div style={{ background: "#FAFBFC", border: "1px solid #F0F2F5", borderRadius: "10px", padding: "10px 12px", fontSize: "11px", color: "#667085", lineHeight: 1.5 }}>{a.note}</div>}
      <div style={{ fontSize: "11px", color: "#98A2B3" }}>Saved to History.</div>
    </Modal>
  );
}

function EditActionModal({ id, initial, title }: { id: string; initial: string; title: string }) {
  const { close, flash } = useBrainStore();
  const invalidate = useBrainInvalidate();
  const [body, setBody] = useState(initial);
  const m = useMutation({
    mutationFn: () => editAction(id, body),
    onSuccess: () => {
      close();
      flash("Saved. It still needs approval before anything is sent.");
      void invalidate();
    },
    onError: (e) => flash(errorText(e)),
  });
  return (
    <Modal width={560} title="Edit the message" sub={title} footer={<><Btn onClick={close}>Cancel</Btn><Btn primary disabled={!body.trim() || body === initial || m.isPending} onClick={() => m.mutate()}>Save</Btn></>}>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7} maxLength={1000} style={{ ...input, resize: "vertical", lineHeight: 1.55 }} />
      <div style={{ fontSize: "11px", color: "#98A2B3" }}>{body.length} / 1000 characters</div>
    </Modal>
  );
}

function CustomRangeModal() {
  const { close, setCompare, from, to } = useBrainStore();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const valid = !!f && !!t && f <= t;
  return (
    <Modal title="Compare a custom range" sub="The range you pick is compared with the same number of days just before it." footer={<><Btn onClick={close}>Cancel</Btn><Btn primary disabled={!valid} onClick={() => { setCompare("custom", f, t); close(); }}>Apply</Btn></>}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "9px" }}>
        <label>
          <span style={lbl}>From</span>
          <input type="date" value={f} onChange={(e) => setF(e.target.value)} style={input} />
        </label>
        <label>
          <span style={lbl}>To</span>
          <input type="date" value={t} onChange={(e) => setT(e.target.value)} style={input} />
        </label>
      </div>
    </Modal>
  );
}

export function BrainOverlays() {
  const router = useRouter();
  const drawer = useBrainStore((s) => s.drawer);
  const modal = useBrainStore((s) => s.modal);
  const toast = useBrainStore((s) => s.toast);
  const close = useBrainStore((s) => s.close);

  useEffect(() => {
    if (!drawer && !modal) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer, modal, close]);

  return (
    <>
      {drawer?.type === "finding" && <FindingDrawer key={drawer.card.key} f={drawer.card} />}
      {drawer?.type === "signal" && (
        <Drawer prio="Signal" fg={drawer.signal.tone === "bad" ? "#B42318" : drawer.signal.tone === "good" ? "#0E8442" : "#475467"} bg={drawer.signal.tone === "bad" ? "#FEF3F2" : drawer.signal.tone === "good" ? "#E8F7EE" : "#F2F4F7"} title={`${drawer.signal.n}: ${drawer.signal.v}`} sub={drawer.signal.ch} footer={<button type="button" className="bb-soft" onClick={close} style={{ ...bigBtn(false), flex: 1 }}>Close</button>}>
          <Block label="Why it moved">
            <div style={{ fontSize: "12.5px", color: "#344054", lineHeight: 1.6 }}>{drawer.signal.why}</div>
          </Block>
          {drawer.signal.rows.length > 0 && (
            <Block label="The figures">
              <div style={{ border: "1px solid #E6EAF0", borderRadius: "11px", overflow: "hidden" }}>
                {drawer.signal.rows.map((r, i) => (
                  <div key={i} style={{ display: "flex", gap: "10px", padding: "10px 12px", borderTop: i ? "1px solid #F2F4F7" : 0, fontSize: "12px" }}>
                    <span style={{ flex: 1, color: "#475467" }}>{r.l}</span>
                    <span style={{ fontWeight: 800, color: "#101828" }}>{r.v}</span>
                  </div>
                ))}
              </div>
            </Block>
          )}
          <Block label="How it is worked out">
            <div style={{ fontSize: "12px", color: "#667085", lineHeight: 1.6 }}>{drawer.signal.definition}</div>
          </Block>
        </Drawer>
      )}
      {drawer?.type === "event" && (
        <Drawer
          prio={drawer.event.sev}
          fg={drawer.event.sev === "Critical" ? "#B42318" : drawer.event.sev === "Important" ? "#B54708" : "#0E8442"}
          bg={drawer.event.sev === "Critical" ? "#FEF3F2" : drawer.event.sev === "Important" ? "#FEF6E7" : "#E8F7EE"}
          title={drawer.event.title}
          sub={`${drawer.event.src} · ${drawer.event.t}`}
          footer={
            <>
              {drawer.event.link && (
                <button type="button" className="bb-primary" onClick={() => { const href = drawer.event.link!.href; close(); router.push(href); }} style={bigBtn(true)}>
                  {drawer.event.link.label}
                </button>
              )}
              <button type="button" className="bb-soft" onClick={close} style={bigBtn(false)}>
                Close
              </button>
            </>
          }
        >
          <Block label="What happened">
            <div style={{ fontSize: "12.5px", color: "#344054", lineHeight: 1.6 }}>{drawer.event.d}</div>
          </Block>
          <Block label="How it relates">
            <div style={{ fontSize: "12.5px", color: "#344054", lineHeight: 1.6 }}>{drawer.event.rel}</div>
          </Block>
          <Block label="Source">
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#475467", background: "#F2F4F7", borderRadius: "20px", padding: "5px 11px" }}>{drawer.event.src}</span>
          </Block>
        </Drawer>
      )}

      {modal?.type === "dismiss" && <DismissModal key={modal.key} k={modal.key} title={modal.title} />}
      {modal?.type === "watch-create" && <WatchCreateModal />}
      {modal?.type === "answer" && <AnswerModal />}
      {modal?.type === "edit-action" && <EditActionModal key={modal.action.id} id={modal.action.id} initial={modal.action.body ?? ""} title={modal.action.title} />}
      {modal?.type === "custom-range" && <CustomRangeModal />}

      {toast && (
        <div role="status" style={{ position: "fixed", bottom: "22px", left: "50%", transform: "translateX(-50%)", background: "#0A1B2A", color: "#fff", padding: "11px 18px", borderRadius: "11px", fontSize: "12.5px", fontWeight: 600, boxShadow: "0 14px 30px rgba(10,27,42,.3)", zIndex: 120, maxWidth: "calc(100vw - 32px)" }}>
          {toast}
        </div>
      )}
    </>
  );
}

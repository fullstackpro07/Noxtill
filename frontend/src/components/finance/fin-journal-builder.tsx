"use client";

import { useMemo, type CSSProperties } from "react";
import { ApiError } from "@/lib/api-client";
import { finApi, type Boot } from "@/lib/finance-api";
import { chip, errText, money, num, r2, todayIso } from "./fin-core";
import { useFin, type JbLine, type JbState } from "./fin-store";
import { acctOptions, type FinAct } from "./fin-actions";

const blank = (): JbLine => ({ acct: "", desc: "", dr: "", cr: "", dim: "" });
const lab: CSSProperties = { display: "flex", flexDirection: "column", gap: "5px", fontSize: "11px", fontWeight: 800, color: "#667085" };
const inp: CSSProperties = { border: "1px solid #E6EAF0", borderRadius: "10px", padding: "10px", fontSize: "13px", minHeight: "42px", background: "#fff" };
const cellIn: CSSProperties = { border: "1px solid #E6EAF0", borderRadius: "9px", padding: "8px", fontSize: "12.5px", minHeight: "40px", minWidth: 0, background: "#fff" };

const TYPES = ["Adjustment", "Accrual", "Prepayment", "Reclass"];

function calc(jb: JbState, boot: Boot | undefined) {
  const dr = r2(jb.lines.reduce((a, l) => a + num(l.dr), 0));
  const cr = r2(jb.lines.reduce((a, l) => a + num(l.cr), 0));
  const diff = r2(dr - cr);
  const empty = dr === 0 && cr === 0;
  const key = jb.date.slice(0, 7);
  const ps = boot?.periodStatus?.[key];
  const locked = ps === "locked";
  const soft = ps === "soft" && !boot?.actor.admin;
  const future = key > todayIso().slice(0, 7);
  const missing = jb.lines.findIndex((l) => (num(l.dr) || num(l.cr)) && !l.acct);
  const both = jb.lines.findIndex((l) => num(l.dr) && num(l.cr));
  const errors: { t: string; locked?: boolean }[] = [];
  if (diff !== 0) errors.push({ t: `This journal cannot be posted because debit and credit totals differ by ${money(Math.abs(diff), jb.currency)}.` });
  if (locked) errors.push({ t: `${key} is locked. This entry must be dated in an open period, or the period must be reopened by an Owner / Controller.`, locked: true });
  if (soft) errors.push({ t: `${key} is soft-closed — only an Owner / Controller can post to it.`, locked: true });
  if (future) errors.push({ t: "That date is in a future period. Choose a date in the current period, or save a draft." });
  if (missing >= 0) errors.push({ t: `Line ${missing + 1} has an amount but no account.` });
  if (both >= 0) errors.push({ t: `Line ${both + 1} has both a debit and a credit. Use one side per line.` });
  const valid = !empty && errors.length === 0;
  const touchesControl = jb.lines.some((l) => boot?.accounts.find((a) => a.id === l.acct)?.control);
  const th = boot?.thresholds ?? { journalDirect: 1000, journalOwner: 10000, billOwner: 5000 };
  const needsAppr = touchesControl || dr >= th.journalDirect;
  return { dr, cr, diff, empty, errors, valid, needsAppr, touchesControl, th, canPost: valid && !needsAppr, canSubmit: valid };
}

/** The 1060px journal builder: header fields, line grid, live validation, save / submit / post. */
export function JournalBuilder({ boot, fin }: { boot: Boot | undefined; fin: FinAct }) {
  const jb = useFin((s) => s.jb);
  const busy = useFin((s) => s.jbBusy);
  const set = useFin((s) => s.set);
  const opts = useMemo(() => acctOptions(boot), [boot]);
  if (!jb) return null;
  const c = calc(jb, boot);
  const statusL = c.empty ? "Draft" : c.errors.length ? "Cannot Post" : c.needsAppr ? "Approval Required" : "Ready to Post";
  const ch = chip(statusL === "Cannot Post" ? "Failed" : statusL);
  const upd = (p: Partial<JbState>) => set((s) => ({ jb: s.jb ? { ...s.jb, ...p } : s.jb }));
  const updLine = (i: number, p: Partial<JbLine>) => set((s) => ({ jb: s.jb ? { ...s.jb, lines: s.jb.lines.map((l, j) => (j === i ? { ...l, ...p } : l)) } : s.jb }));
  const body = () => ({
    date: jb.date,
    type: jb.type,
    reference: jb.ref || undefined,
    memo: jb.memo || undefined,
    currency: jb.currency,
    branchId: jb.branch || null,
    lines: jb.lines.filter((l) => l.acct || num(l.dr) || num(l.cr)).map((l) => ({ accountId: l.acct || null, description: l.desc || undefined, debit: num(l.dr) || undefined, credit: num(l.cr) || undefined, department: l.dim || null })),
  });

  /** Save the draft (create or version-checked update). Returns the journal id, or null on conflict. */
  const save = async (): Promise<string | null> => {
    if (jb.id) {
      try {
        const r = await finApi.updateJournal(jb.id, { ...body(), version: jb.v });
        upd({ v: r.version, number: r.number });
        return jb.id;
      } catch (e) {
        if (e instanceof ApiError && e.code === "FINANCE_VERSION_CONFLICT") {
          conflict(e.message);
          return null;
        }
        throw e;
      }
    }
    const r = await finApi.createJournal(body());
    upd({ id: r.id, number: r.number, v: r.version });
    return r.id;
  };

  const conflict = (msg: string) => {
    useFin.getState().openModal({
      title: "This journal changed since you opened it",
      intro: `${msg} Nothing has been overwritten.`,
      introTone: "warn",
      buttons: [
        {
          l: "Review Changes",
          kind: "s",
          run: async () => {
            const rec = await finApi.record("journals", jb.id!, {});
            useFin.getState().openModal({
              title: `Latest version of ${rec.title}`,
              intro: `${rec.kv.find((k) => k[0] === "Version")?.[1] ?? ""} — saved by someone else. Your edits are still open in the builder.`,
              lines: rec.lines.map((l) => ({ acct: `${l.acct} · ${l.desc}`, dr: l.dr ? money(l.dr, rec.cur) : "", cr: l.cr ? money(l.cr, rec.cur) : "" })),
              buttons: [{ l: "Back", kind: "s", run: "close" }],
            });
          },
        },
        {
          l: "Save as New Draft",
          kind: "s",
          run: async () => {
            const r = await finApi.createJournal(body());
            useFin.getState().closeModal();
            upd({ id: r.id, number: r.number, v: r.version });
            useFin.getState().flash(`Saved as new draft ${r.number}. The other version is untouched.`);
            await fin.invalidate();
          },
        },
        {
          l: "Reload Latest",
          kind: "p",
          run: async () => {
            useFin.getState().closeModal();
            await fin.act(`editJournal:${jb.id}`);
          },
        },
      ],
    });
  };

  const guard = async (fn: () => Promise<void>) => {
    set({ jbBusy: true });
    try {
      await fn();
    } catch (e) {
      useFin.getState().flash(errText(e));
    } finally {
      set({ jbBusy: false });
    }
  };

  const onSave = () =>
    guard(async () => {
      const id = await save();
      if (!id) return;
      const n = useFin.getState().jb?.number ?? "Journal";
      set({ jb: null });
      useFin.getState().flash(`${n} saved as Draft. Drafts don’t affect balances.`);
      await fin.invalidate();
    });
  const onSubmit = () =>
    guard(async () => {
      if (!c.canSubmit) return;
      const id = await save();
      if (id) await fin.act(`submitJournal:${id}`);
    });
  const onPost = () =>
    guard(async () => {
      if (!c.canPost) return;
      const id = await save();
      if (!id) return;
      const lineId = jb.reconLineId;
      await fin.act(`postJournal:${id}`);
      if (lineId) {
        // A reconciliation adjustment: link the statement line to the bank side of this journal.
        const j = await finApi.record("journals", id, {});
        if (j.status === "Posted") {
          const cand = await finApi.candidates(lineId);
          const hit = cand.ledger.find((g) => g.journal === j.title);
          if (hit) await finApi.match(lineId, { lineIds: [hit.id] }).catch((e) => useFin.getState().flash(errText(e)));
          await fin.invalidate();
        }
      }
    });

  const subWhy = !c.valid ? "" : !c.needsAppr ? `Under ${money(c.th.journalDirect, jb.currency, 0)} — you can post directly, or submit for review` : "";
  const postWhy = c.needsAppr ? (c.touchesControl ? "Touches a control account — needs Owner / Controller approval" : `Journals of ${money(c.th.journalDirect, jb.currency, 0)}+ need approval`) : "";
  const hint = c.valid
    ? c.needsAppr
      ? c.touchesControl
        ? "This journal touches a control account, so it needs Owner / Controller approval before posting."
        : `Journals of ${money(c.th.journalDirect, jb.currency, 0)} or more need Finance Manager approval; above ${money(c.th.journalOwner, jb.currency, 0)} Owner / Controller.`
      : `Under ${money(c.th.journalDirect, jb.currency, 0)} — you can post directly. Posting is atomic: all lines commit or none do.`
    : "Fix the issues above to submit or post. You can always save a draft.";
  const currencies = [boot?.base ?? "USD", ...new Set((boot?.bankAccounts ?? []).map((b) => b.currency).filter((x) => x !== boot?.base))];
  const depts = boot?.departments ?? [];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,27,42,.45)", zIndex: 170, display: "flex", alignItems: "center", justifyContent: "center", padding: "18px" }}>
      <div role="dialog" aria-modal="true" aria-label="Journal builder" style={{ background: "#fff", borderRadius: "18px", width: "1060px", maxWidth: "100%", maxHeight: "94vh", display: "flex", flexDirection: "column", boxShadow: "0 30px 80px rgba(10,27,42,.3)", animation: "nxin .18s ease" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #F0F2F5", display: "flex", gap: "12px", alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 800, color: "#0F172A" }}>{jb.id ? `Edit draft ${jb.number ?? ""} · v${jb.v}` : jb.reconLineId ? "Adjustment journal — reconciliation" : "New journal"}</h3>
            <div style={{ fontSize: "12px", color: "#667085", marginTop: "2px" }}>{jb.id ? `Saving creates v${jb.v + 1}. Other people’s changes are never overwritten.` : "Every journal must balance before it can be submitted or posted."}</div>
          </div>
          <button type="button" onClick={() => set({ jb: null })} aria-label="Close" style={{ width: "36px", height: "36px", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", color: "#475467", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "10px" }}>
            <label style={lab}>
              JOURNAL DATE
              <input type="date" value={jb.date} onChange={(e) => upd({ date: e.target.value })} style={inp} />
            </label>
            <label style={lab}>
              REFERENCE
              <input value={jb.ref} onChange={(e) => upd({ ref: e.target.value })} placeholder="e.g. ACC-UTIL-09" style={inp} />
            </label>
            <label style={lab}>
              JOURNAL TYPE
              <select value={jb.type} onChange={(e) => upd({ type: e.target.value })} style={inp}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    Manual · {t}
                  </option>
                ))}
              </select>
            </label>
            <label style={lab}>
              ENTITY
              <select style={inp} disabled>
                <option>{boot?.entity}</option>
              </select>
            </label>
            <label style={lab}>
              BRANCH
              <select value={jb.branch} onChange={(e) => upd({ branch: e.target.value })} style={inp}>
                <option value="">{(boot?.branches.length ?? 0) > 1 ? "Not branch-specific" : boot?.entity}</option>
                {(boot?.branches ?? []).length > 1 ? (boot?.branches ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>) : null}
              </select>
            </label>
            <label style={lab}>
              CURRENCY
              <select value={jb.currency} onChange={(e) => upd({ currency: e.target.value })} style={inp}>
                {currencies.map((cu) => (
                  <option key={cu} value={cu}>
                    {cu === boot?.base ? `${cu} (base)` : cu}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label style={lab}>
            MEMO
            <input value={jb.memo} onChange={(e) => upd({ memo: e.target.value })} placeholder="What is this journal for?" style={inp} />
          </label>
          <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", overflowX: "auto", flexShrink: 0 }}>
            <div style={{ minWidth: "860px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "34px minmax(200px,1.4fr) minmax(160px,1.2fr) 120px 120px 130px 36px", gap: "8px", padding: "9px 12px", background: "#FAFBFC", fontSize: "11px", fontWeight: 800, color: "#667085", textTransform: "uppercase" }}>
                <span>#</span>
                <span>Account</span>
                <span>Description</span>
                <span style={{ textAlign: "right" }}>Debit</span>
                <span style={{ textAlign: "right" }}>Credit</span>
                <span>Department</span>
                <span />
              </div>
              {jb.lines.map((l, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "34px minmax(200px,1.4fr) minmax(160px,1.2fr) 120px 120px 130px 36px", gap: "8px", padding: "8px 12px", borderTop: "1px solid #F2F4F7", alignItems: "center" }}>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#98A2B3" }}>{i + 1}</span>
                  <select value={l.acct} onChange={(e) => updLine(i, { acct: e.target.value })} aria-label={`Account line ${i + 1}`} style={{ ...cellIn, border: `1px solid ${(num(l.dr) || num(l.cr)) && !l.acct ? "#FDA29B" : "#E6EAF0"}` }}>
                    <option value="">Choose account…</option>
                    {opts.map((o) => (
                      <option key={o.v} value={o.v}>
                        {o.l}
                      </option>
                    ))}
                  </select>
                  <input value={l.desc} onChange={(e) => updLine(i, { desc: e.target.value })} aria-label={`Description line ${i + 1}`} style={cellIn} />
                  <input value={l.dr} onChange={(e) => updLine(i, { dr: e.target.value })} inputMode="decimal" aria-label={`Debit line ${i + 1}`} placeholder="0.00" style={{ ...cellIn, textAlign: "right" }} />
                  <input value={l.cr} onChange={(e) => updLine(i, { cr: e.target.value })} inputMode="decimal" aria-label={`Credit line ${i + 1}`} placeholder="0.00" style={{ ...cellIn, textAlign: "right" }} />
                  <select value={l.dim} onChange={(e) => updLine(i, { dim: e.target.value })} aria-label={`Department line ${i + 1}`} style={cellIn}>
                    <option value="">{depts.length ? "—" : "None defined"}</option>
                    {depts.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => jb.lines.length > 2 && upd({ lines: jb.lines.filter((_, j) => j !== i) })} aria-label={`Remove line ${i + 1}`} style={{ width: "32px", height: "32px", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "8px", color: "#98A2B3", cursor: jb.lines.length > 2 ? "pointer" : "not-allowed" }}>
                    ×
                  </button>
                </div>
              ))}
              <div style={{ padding: "9px 12px", borderTop: "1px solid #F2F4F7" }}>
                <button type="button" onClick={() => upd({ lines: [...jb.lines, blank()] })} style={{ border: "1px dashed #D0D5DD", background: "#fff", borderRadius: "9px", padding: "8px 12px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "36px" }}>
                  + Add line
                </button>
              </div>
            </div>
          </div>
          {!c.empty
            ? c.errors.map((e, i) => (
                <div key={i} role="alert" style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", fontSize: "12.5px", fontWeight: 700, color: "#B42318", background: "#FEF3F2", border: "1px solid #FDA29B", borderRadius: "10px", padding: "10px 12px" }}>
                  <span style={{ flex: 1, minWidth: "240px" }}>{e.t}</span>
                  {e.locked ? (
                    <span style={{ display: "flex", gap: "6px" }}>
                      <button type="button" onClick={() => upd({ date: todayIso() })} style={{ border: "1px solid #FDA29B", background: "#fff", borderRadius: "8px", padding: "6px 10px", fontSize: "12px", fontWeight: 700, color: "#B42318", cursor: "pointer", minHeight: "34px" }}>
                        Choose Period
                      </button>
                      <button type="button" onClick={() => void fin.act(`reopenPeriod:${jb.date.slice(0, 7)}`)} style={{ border: 0, background: "#B42318", borderRadius: "8px", padding: "6px 10px", fontSize: "12px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "34px" }}>
                        Request Reopen
                      </button>
                    </span>
                  ) : null}
                </div>
              ))
            : null}
        </div>
        <div style={{ padding: "13px 20px", borderTop: "1px solid #F0F2F5", display: "flex", gap: "14px", alignItems: "center", flexWrap: "wrap", background: "#FAFBFC", borderRadius: "0 0 18px 18px" }}>
          <div style={{ display: "flex", gap: "18px", flexWrap: "wrap" }} aria-live="polite">
            <div>
              <div style={{ fontSize: "10.5px", fontWeight: 800, color: "#98A2B3" }}>TOTAL DEBIT</div>
              <div style={{ fontSize: "17px", fontWeight: 800, color: "#101828" }}>{money(c.dr, jb.currency)}</div>
            </div>
            <div>
              <div style={{ fontSize: "10.5px", fontWeight: 800, color: "#98A2B3" }}>TOTAL CREDIT</div>
              <div style={{ fontSize: "17px", fontWeight: 800, color: "#101828" }}>{money(c.cr, jb.currency)}</div>
            </div>
            <div>
              <div style={{ fontSize: "10.5px", fontWeight: 800, color: "#98A2B3" }}>DIFFERENCE</div>
              <div style={{ fontSize: "17px", fontWeight: 800, color: c.diff === 0 ? "#0E8442" : "#B42318" }}>{money(c.diff, jb.currency)}</div>
            </div>
            <div>
              <div style={{ fontSize: "10.5px", fontWeight: 800, color: "#98A2B3" }}>STATUS</div>
              <span style={{ display: "inline-block", marginTop: "3px", fontSize: "11px", fontWeight: 800, padding: "3px 9px", borderRadius: "20px", background: ch.bg, color: ch.fg }}>{statusL}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", marginLeft: "auto", flexWrap: "wrap" }}>
            <button type="button" onClick={() => void onSave()} disabled={busy} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "10px 14px", fontSize: "12.5px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "44px" }}>
              Save Draft
            </button>
            <button type="button" onClick={() => void onSubmit()} disabled={!c.canSubmit || busy} title={subWhy} style={{ border: `1px solid ${c.canSubmit ? "#12A150" : "#E6EAF0"}`, background: "#fff", borderRadius: "10px", padding: "10px 14px", fontSize: "12.5px", fontWeight: 800, color: c.canSubmit ? "#0E8442" : "#98A2B3", cursor: c.canSubmit ? "pointer" : "not-allowed", minHeight: "44px" }}>
              {c.needsAppr ? "Submit for Approval" : "Submit for Review"}
            </button>
            <button type="button" onClick={() => void onPost()} disabled={!c.canPost || busy} title={postWhy} style={{ border: 0, background: c.canPost ? "#12A150" : "#D0D5DD", borderRadius: "10px", padding: "10px 16px", fontSize: "12.5px", fontWeight: 800, color: "#fff", cursor: c.canPost ? "pointer" : "not-allowed", minHeight: "44px" }}>
              {busy ? "Working…" : "Post Journal"}
            </button>
          </div>
          <div style={{ width: "100%", fontSize: "11.5px", color: "#667085", textAlign: "right" }}>{hint}</div>
        </div>
      </div>
    </div>
  );
}

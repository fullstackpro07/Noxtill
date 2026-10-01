"use client";

import { useQuery } from "@tanstack/react-query";
import { finApi } from "@/lib/finance-api";
import { chip, errText, mdy, money } from "./fin-core";
import { useFin } from "./fin-store";
import { card } from "./fin-render";
import type { FinAct } from "./fin-actions";

/** Reconciliation workspace: statement lines against ledger records, difference, timing items, finalize. */
export function ReconWorkspace({ id, fin }: { id: string; fin: FinAct }) {
  const set = useFin((s) => s.set);
  const q = useQuery({ queryKey: ["fin", "recon", id], queryFn: () => finApi.workspace(id) });
  if (q.isLoading) return <div style={{ ...card, padding: "40px", textAlign: "center", color: "#667085", fontSize: "13px" }}>Loading reconciliation…</div>;
  if (!q.data) return <div style={{ ...card, padding: "24px", color: "#B42318", fontSize: "13px" }}>{errText(q.error)}</div>;
  const w = q.data;
  const cur = w.account.currency;
  const status = w.recon.status === "Review Required" ? "Approval Required" : w.recon.status;
  const sc = chip(status);
  const ok = w.diff === 0;
  const locked = w.recon.status === "Locked";
  const editable = !locked && w.recon.status !== "Review Required";
  const unexplained = w.rows.filter((r) => !r.matched && !r.timing);
  const first = unexplained[0];
  const timing = (lineId: string, on: boolean) =>
    fin.run(on ? "Marking timing difference" : "Clearing timing difference", ["Record reason", "Update reconciling items"], async () => {
      await finApi.timing(id, lineId, on, on ? "Timing difference" : undefined);
      return on ? "Marked as a timing difference — an independent reviewer must accept it." : "Timing difference cleared.";
    }, { closeDrawer: false });
  const metrics: [string, string][] = [
    ["Account", `${w.account.name}${w.account.mask ? ` ••${w.account.mask}` : ""}`],
    ["Opening balance", money(w.opening, cur)],
    ["Closing statement", money(w.statement, cur)],
    ["Book balance", money(w.book, cur)],
    ["Matched", String(w.matchedCount)],
    ["Outstanding", String(w.openCount)],
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <button type="button" onClick={() => set({ reconId: null })} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "8px 12px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "38px" }}>
          ‹ All reconciliations
        </button>
        <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 800, color: "#0F172A" }}>
          {w.account.name}
          {w.account.mask ? ` ••${w.account.mask}` : ""} · to {mdy(w.recon.periodEnd)}
        </h2>
        <span style={{ fontSize: "11px", fontWeight: 800, padding: "3px 9px", borderRadius: "20px", background: sc.bg, color: sc.fg }}>{status}</span>
        <span style={{ fontSize: "11.5px", color: "#98A2B3", marginLeft: "auto" }}>
          Preparer: {w.preparer} · Approver: {w.approver ?? (w.sodOn ? "independent" : "any Finance Manager")}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: "10px" }}>
        {metrics.map(([l, v]) => (
          <div key={l} style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: "12px", padding: "11px 13px" }}>
            <div style={{ fontSize: "10.5px", fontWeight: 700, color: "#98A2B3", textTransform: "uppercase" }}>{l}</div>
            <div style={{ fontSize: "15px", fontWeight: 800, color: "#101828", marginTop: "3px" }}>{v}</div>
          </div>
        ))}
        <div style={{ background: ok ? "#F7FCF9" : "#FEF3F2", border: `2px solid ${ok ? "#12A150" : "#B42318"}`, borderRadius: "12px", padding: "10px 13px", gridColumn: "span 2" }}>
          <div style={{ fontSize: "10.5px", fontWeight: 800, color: ok ? "#0E8442" : "#B42318", textTransform: "uppercase" }}>Difference</div>
          <div style={{ fontSize: "24px", fontWeight: 800, color: ok ? "#0E8442" : "#B42318", letterSpacing: "-.6px" }}>{money(w.diff, cur)}</div>
          <div style={{ fontSize: "11.5px", fontWeight: 700, color: ok ? "#0E8442" : "#B42318" }}>{ok ? "Reconciles — statement agrees to cleared book balance" : "Not Reconciled"}</div>
        </div>
      </div>
      <section style={{ ...card, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: "860px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "70px minmax(170px,1fr) 110px 40px minmax(200px,1.2fr) 130px 130px", gap: "10px", padding: "10px 18px", background: "#FAFBFC", fontSize: "11px", fontWeight: 800, color: "#667085", textTransform: "uppercase", letterSpacing: ".3px" }}>
              <span>Date</span>
              <span>Bank statement line</span>
              <span style={{ textAlign: "right" }}>Amount</span>
              <span />
              <span>Ledger record</span>
              <span>Journal</span>
              <span style={{ textAlign: "right" }}>Action</span>
            </div>
            {w.rows.map((l) => {
              const good = l.matched || l.timing;
              return (
                <div key={l.id} style={{ display: "grid", gridTemplateColumns: "70px minmax(170px,1fr) 110px 40px minmax(200px,1.2fr) 130px 130px", gap: "10px", padding: "11px 18px", borderTop: "1px solid #F2F4F7", alignItems: "center", background: good ? "#fff" : "#FFFBFA" }}>
                  <span style={{ fontSize: "12.5px", color: "#475467" }}>{new Date(l.date).toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" })}</span>
                  <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>{l.desc}</span>
                  <span style={{ fontSize: "12.5px", fontWeight: 700, textAlign: "right", color: l.amt > 0 ? "#0E8442" : "#101828" }}>
                    {l.amt > 0 ? "+" : ""}
                    {money(l.amt, cur)}
                  </span>
                  <span aria-label={good ? "Matched" : "Unmatched"} style={{ width: "24px", height: "24px", borderRadius: "50%", background: good ? "#E8F7EE" : "#FEF3F2", color: good ? "#0E8442" : "#B42318", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 800 }}>
                    {good ? "✓" : "!"}
                  </span>
                  <span style={{ fontSize: "12.5px", color: good ? "#344054" : "#B42318", fontWeight: 600 }}>{l.matched ? l.led : l.timing ? "Timing difference (reason recorded)" : l.suggestion ? `${l.suggestion} — not matched` : "No ledger record"}</span>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#0E8442" }}>{l.je ?? ""}</span>
                  <span style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
                    {editable ? (
                      l.matched ? (
                        <button type="button" onClick={() => void fin.act(`unmatchFeed:${l.id}`)} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "8px", padding: "6px 10px", fontSize: "11.5px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "34px" }}>
                          Unmatch
                        </button>
                      ) : l.timing ? (
                        <button type="button" onClick={() => void timing(l.id, false)} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "8px", padding: "6px 10px", fontSize: "11.5px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "34px" }}>
                          Clear timing
                        </button>
                      ) : (
                        <button type="button" onClick={() => void fin.act(l.suggestion ? `matchFeed:${l.id}` : `chooseDiff:${l.id}`)} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "8px", padding: "6px 10px", fontSize: "11.5px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "34px" }}>
                          Match
                        </button>
                      )
                    ) : null}
                  </span>
                </div>
              );
            })}
            {!w.rows.length ? <div style={{ padding: "22px 18px", fontSize: "12.5px", color: "#98A2B3", borderTop: "1px solid #F2F4F7" }}>No statement lines up to this date. Import the statement first (Bank & Cash Accounts › Import Statement).</div> : null}
          </div>
        </div>
        {editable && first ? (
          <div style={{ borderTop: "1px solid #FEE4E2", background: "#FFFBFA", padding: "14px 18px", display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: "260px" }}>
              <div style={{ fontSize: "13px", fontWeight: 800, color: "#B42318" }}>
                {new Date(first.date).toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" })} · {first.desc} {first.amt > 0 ? "+" : ""}
                {money(first.amt, cur)} has no ledger record
                {unexplained.length > 1 ? ` (+${unexplained.length - 1} more)` : ""}
              </div>
              <div style={{ fontSize: "12px", color: "#475467", marginTop: "2px" }}>Record it with an adjustment journal (posted through the normal approval rules and matched to this line), or mark it as a timing difference with a reason.</div>
            </div>
            <button type="button" onClick={() => void timing(first.id, true)} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "9px 13px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "40px" }}>
              Mark Timing Difference
            </button>
            <button
              type="button"
              className="fx-dark"
              onClick={() => {
                useFin.getState().set({
                  jb: {
                    id: null,
                    v: 1,
                    date: first.date.slice(0, 10),
                    ref: "REC-ADJ",
                    memo: `${first.desc} — reconciliation adjustment`,
                    type: "Reclass",
                    branch: "",
                    currency: cur,
                    reconLineId: first.id,
                    lines: [
                      { acct: "", desc: first.desc, dr: first.amt > 0 ? String(first.amt) : "", cr: first.amt < 0 ? String(-first.amt) : "", dim: "" },
                      { acct: "", desc: first.desc, dr: first.amt < 0 ? String(-first.amt) : "", cr: first.amt > 0 ? String(first.amt) : "", dim: "" },
                    ],
                  },
                });
              }}
              style={{ border: 0, background: "#0A1B2A", borderRadius: "10px", padding: "9px 14px", fontSize: "12px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "40px" }}
            >
              Create Adjustment Journal
            </button>
          </div>
        ) : null}
      </section>
      {w.outstanding.length ? (
        <section style={{ ...card, overflow: "hidden" }}>
          <div style={{ padding: "12px 18px", borderBottom: "1px solid #F0F2F5", fontSize: "13px", fontWeight: 800, color: "#101828" }}>
            Book entries not yet on a statement <span style={{ fontWeight: 600, color: "#98A2B3", fontSize: "11.5px" }}>· deposits in transit, uncleared payments</span>
          </div>
          {w.outstanding.slice(0, 12).map((o) => (
            <div key={o.id} style={{ display: "flex", gap: "12px", padding: "9px 18px", borderTop: "1px solid #F2F4F7", fontSize: "12.5px" }}>
              <span style={{ color: "#475467", width: "70px" }}>{new Date(o.date).toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" })}</span>
              <span style={{ flex: 1, color: "#101828", fontWeight: 600 }}>
                {o.je} · {o.desc}
              </span>
              <span style={{ fontWeight: 700 }}>{money(o.amt, cur)}</span>
            </div>
          ))}
        </section>
      ) : null}
      <section style={{ ...card, padding: "15px 18px", display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: "260px" }}>
          <div style={{ fontSize: "14px", fontWeight: 800, color: "#101828" }}>Finalize</div>
          <div style={{ fontSize: "12px", color: "#667085", marginTop: "3px", textWrap: "pretty" }}>
            {locked
              ? "Reconciled and locked. Reopening needs an Owner / Controller and a reason."
              : w.recon.status === "Review Required"
                ? w.canApprove
                  ? `Submitted by ${w.preparer}. You can approve — you are not the preparer.`
                  : w.sodOn && w.me === w.recon.preparedById
                    ? "You prepared this reconciliation — an independent approver must sign off."
                    : "Waiting for a Finance Manager to approve."
                : ok
                  ? `Difference is ${money(0, cur)}. Review outstanding items and evidence, then submit for independent approval.`
                  : `You can’t finalize until the difference is ${money(0, cur)}. Resolve the unmatched lines above.`}
          </div>
        </div>
        <button type="button" onClick={() => void fin.act(`attach:recon:${id}`)} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "10px 14px", fontSize: "12.5px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "44px" }}>
          Attach Statement
        </button>
        {editable ? (
          <button type="button" disabled={!ok} onClick={() => void fin.run("Submitting reconciliation", ["Difference is zero", "Snapshot book balance", "Create reconciliation approval"], async () => { await finApi.reconAction(id, "submit"); return "Submitted for independent approval."; }, { closeDrawer: false })} style={{ border: 0, background: ok ? "#12A150" : "#D0D5DD", borderRadius: "10px", padding: "10px 16px", fontSize: "12.5px", fontWeight: 800, color: "#fff", cursor: ok ? "pointer" : "not-allowed", minHeight: "44px" }}>
            Submit for Approval
          </button>
        ) : null}
        {w.recon.status === "Review Required" ? (
          <button type="button" disabled={!w.canApprove} onClick={() => void fin.run("Approving reconciliation", ["Approver ≠ preparer", "Re-check difference", "Lock reconciliation"], async () => { await finApi.reconAction(id, "approve"); return `${w.account.name} reconciled and locked.`; }, { closeDrawer: false })} style={{ border: 0, background: w.canApprove ? "#12A150" : "#D0D5DD", borderRadius: "10px", padding: "10px 16px", fontSize: "12.5px", fontWeight: 800, color: "#fff", cursor: w.canApprove ? "pointer" : "not-allowed", minHeight: "44px" }}>
            Approve &amp; Reconcile
          </button>
        ) : null}
        {locked || w.recon.status === "Review Required" ? (
          <button type="button" onClick={() => void fin.act(`reopenRecon:${id}`)} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "10px 14px", fontSize: "12.5px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "44px" }}>
            {locked ? "Request Reopen" : "Withdraw"}
          </button>
        ) : null}
      </section>
    </div>
  );
}

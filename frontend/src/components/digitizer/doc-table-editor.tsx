"use client";

import { useState, type CSSProperties } from "react";
import { useMutation } from "@tanstack/react-query";
import { updateDigitizerTable, type DocumentDetail } from "@/lib/digitizer-api";
import { DigitizerIcon } from "./digitizer-icon";
import { Btn, Chip, Empty, formatMoney, monoStyle, plural } from "./digitizer-ui";
import { useDigitizerStore } from "./digitizer-store";

const input: CSSProperties = {
  height: "30px",
  width: "100%",
  minWidth: 0,
  padding: "0 8px",
  border: "1px solid #D5DAE2",
  borderRadius: "7px",
  fontSize: "12px",
  background: "#fff",
  color: "#0F172A",
};

const numText = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
const toNum = (s: string): number | null => {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

interface LineDraft {
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}
interface EntryDraft {
  description: string;
  amount: string;
  kind: "charge" | "payment";
}

/**
 * The figures behind a reconciliation, editable cell by cell. Saving re-runs the arithmetic on the
 * server; nothing here (or there) ever fills a blank cell in for you.
 */
export function DocTableEditor({ doc, onSaved }: { doc: DocumentDetail; onSaved: (d: DocumentDetail) => void }) {
  const notify = useDigitizerStore((s) => s.notify);
  const notifyError = useDigitizerStore((s) => s.notifyError);
  const { table } = doc;

  // Drafts start from what the server has stored; the parent re-mounts this editor (via `key`) when that changes.
  const [lines, setLines] = useState<LineDraft[]>(() =>
    table.lineItems.map((l) => ({ description: l.description ?? "", quantity: numText(l.quantity), unitPrice: numText(l.unitPrice), lineTotal: numText(l.lineTotal) })),
  );
  const [totals, setTotals] = useState(() => ({ subtotal: numText(table.totals?.subtotal), tax: numText(table.totals?.tax), discount: numText(table.totals?.discount), printedTotal: numText(table.totals?.printedTotal) }));
  const [ledger, setLedger] = useState(() => ({
    openingBalance: numText(table.ledger?.openingBalance),
    statedClosingBalance: numText(table.ledger?.statedClosingBalance),
    entries: (table.ledger?.entries ?? []).map((e): EntryDraft => ({ description: e.description ?? "", amount: numText(e.amount), kind: e.kind })),
  }));
  const [dirty, setDirty] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      updateDigitizerTable(doc.id, {
        ...(lines.length || table.lineItems.length
          ? { lineItems: lines.map((l) => ({ description: l.description.trim() || null, quantity: toNum(l.quantity), unitPrice: toNum(l.unitPrice), lineTotal: toNum(l.lineTotal) })) }
          : {}),
        ...(table.totals || lines.length ? { totals: { subtotal: toNum(totals.subtotal), tax: toNum(totals.tax), discount: toNum(totals.discount), printedTotal: toNum(totals.printedTotal) } } : {}),
        ...(table.ledger
          ? {
              ledger: {
                openingBalance: toNum(ledger.openingBalance),
                statedClosingBalance: toNum(ledger.statedClosingBalance),
                entries: ledger.entries.map((e) => ({ description: e.description.trim() || null, amount: toNum(e.amount), kind: e.kind })),
              },
            }
          : {}),
      }),
    onSuccess: (d) => {
      setDirty(false);
      onSaved(d);
      notify("Figures saved", d.reconciliation ? (d.reconciliation.ok ? "The arithmetic now reconciles." : "The arithmetic still does not reconcile.") : "Reconciliation re-run.");
    },
    onError: (e: unknown) => notifyError("Could not save", e instanceof Error ? e.message : "Please try again."),
  });

  const hasInvoice = table.lineItems.length > 0 || table.totals !== null;
  const hasLedger = table.ledger !== null;
  if (!hasInvoice && !hasLedger) {
    return <Empty title="No table was extracted" icon="table-2">This document has no line items or ledger entries, so there is nothing to reconcile.</Empty>;
  }

  const rec = doc.reconciliation;
  const touch = <T,>(set: (fn: (p: T) => T) => void, fn: (p: T) => T) => {
    setDirty(true);
    set(fn);
  };
  const th: CSSProperties = { textAlign: "left", padding: "7px 6px", fontSize: "10px", fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "#94A3B8" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {rec && (
        <div style={{ border: `1px solid ${rec.ok ? "#BBF0CB" : "#FBD5D2"}`, background: rec.ok ? "#F6FEF9" : "#FEF3F2", borderRadius: "11px", padding: "11px 13px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <Chip tone={rec.ok ? "green" : "red"}>{rec.ok ? "Reconciles" : "Does not reconcile"}</Chip>
            <span style={{ fontSize: "12px", color: "#45505F" }}>{rec.message}</span>
          </div>
          {rec.unreadableLines.length > 0 && (
            <div style={{ fontSize: "11.5px", color: "#B45309", marginTop: "6px" }}>
              {rec.unreadableLines.map((u) => `#${u.index}: ${u.missing.join(" / ")} not readable`).join(" · ")} — left blank, not guessed.
            </div>
          )}
        </div>
      )}

      {hasInvoice && (
        <div style={{ border: "1px solid #E6E8EC", borderRadius: "12px", overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }} className="nx-scroll">
            <table style={{ width: "100%", minWidth: "520px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#FAFBFC" }}>
                  <th style={{ ...th, width: "34px" }}>#</th>
                  <th style={th}>Item</th>
                  <th style={{ ...th, width: "76px" }}>Qty</th>
                  <th style={{ ...th, width: "96px" }}>Unit price</th>
                  <th style={{ ...th, width: "104px" }}>Line total</th>
                  <th style={{ ...th, width: "34px" }} />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const a = table.lineItems[i];
                  const unread = a && a.effectiveTotal === null;
                  return (
                    <tr key={i} style={{ borderTop: "1px solid #F3F4F7", background: unread ? "#FFFBEB" : "#fff" }}>
                      <td style={{ padding: "5px 6px", fontSize: "11px", color: "#94A3B8", ...monoStyle }}>{i + 1}</td>
                      <td style={{ padding: "5px 4px" }}>
                        <input disabled={!table.editable} style={input} value={l.description} onChange={(e) => touch(setLines, (p) => p.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                      </td>
                      {(["quantity", "unitPrice", "lineTotal"] as const).map((k) => (
                        <td key={k} style={{ padding: "5px 4px" }}>
                          <input disabled={!table.editable} inputMode="decimal" style={{ ...input, borderColor: l[k] === "" ? "#FDE49B" : "#D5DAE2", background: l[k] === "" ? "#FFFBEB" : "#fff" }} placeholder="not read" value={l[k]} onChange={(e) => touch(setLines, (p) => p.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} />
                        </td>
                      ))}
                      <td style={{ padding: "5px 4px", textAlign: "center" }}>
                        {table.editable && (
                          <span style={{ cursor: "pointer", color: "#94A3B8" }} onClick={() => touch(setLines, (p) => p.filter((_, j) => j !== i))} title="Remove this line">
                            <DigitizerIcon name="trash-2" size={13} />
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "10px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "8px", borderTop: "1px solid #EEF0F3", background: "#FCFCFD" }}>
            {(
              [
                ["subtotal", "Printed subtotal"],
                ["tax", "Tax"],
                ["discount", "Discount"],
                ["printedTotal", "Printed total"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} style={{ fontSize: "10.5px", fontWeight: 700, color: "#5B6675", display: "flex", flexDirection: "column", gap: "4px" }}>
                {label}
                <input disabled={!table.editable} inputMode="decimal" style={input} placeholder="not read" value={totals[k]} onChange={(e) => touch(setTotals, (p) => ({ ...p, [k]: e.target.value }))} />
              </label>
            ))}
          </div>
          {table.editable && (
            <div style={{ padding: "8px 10px", borderTop: "1px solid #EEF0F3" }}>
              <Btn small icon="plus" onClick={() => touch(setLines, (p) => [...p, { description: "", quantity: "", unitPrice: "", lineTotal: "" }])}>Add a line</Btn>
            </div>
          )}
        </div>
      )}

      {hasLedger && (
        <div style={{ border: "1px solid #E6E8EC", borderRadius: "12px", overflow: "hidden" }}>
          <div style={{ padding: "10px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px", background: "#FCFCFD", borderBottom: "1px solid #EEF0F3" }}>
            <label style={{ fontSize: "10.5px", fontWeight: 700, color: "#5B6675", display: "flex", flexDirection: "column", gap: "4px" }}>
              Opening balance
              <input disabled={!table.editable} inputMode="decimal" style={input} placeholder="not read" value={ledger.openingBalance} onChange={(e) => touch(setLedger, (p) => ({ ...p, openingBalance: e.target.value }))} />
            </label>
            <label style={{ fontSize: "10.5px", fontWeight: 700, color: "#5B6675", display: "flex", flexDirection: "column", gap: "4px" }}>
              Written closing balance
              <input disabled={!table.editable} inputMode="decimal" style={input} placeholder="not read" value={ledger.statedClosingBalance} onChange={(e) => touch(setLedger, (p) => ({ ...p, statedClosingBalance: e.target.value }))} />
            </label>
          </div>
          {ledger.entries.map((e, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 26px", gap: "6px", padding: "5px 10px", borderTop: i ? "1px solid #F3F4F7" : "none", alignItems: "center", background: e.amount === "" ? "#FFFBEB" : "#fff" }}>
              <input disabled={!table.editable} style={input} value={e.description} placeholder="Entry" onChange={(ev) => touch(setLedger, (p) => ({ ...p, entries: p.entries.map((x, j) => (j === i ? { ...x, description: ev.target.value } : x)) }))} />
              <input disabled={!table.editable} inputMode="decimal" style={input} value={e.amount} placeholder="not read" onChange={(ev) => touch(setLedger, (p) => ({ ...p, entries: p.entries.map((x, j) => (j === i ? { ...x, amount: ev.target.value } : x)) }))} />
              <select disabled={!table.editable} style={input} value={e.kind} onChange={(ev) => touch(setLedger, (p) => ({ ...p, entries: p.entries.map((x, j) => (j === i ? { ...x, kind: ev.target.value as "charge" | "payment" } : x)) }))}>
                <option value="charge">Charge</option>
                <option value="payment">Payment</option>
              </select>
              {table.editable && (
                <span style={{ cursor: "pointer", color: "#94A3B8" }} onClick={() => touch(setLedger, (p) => ({ ...p, entries: p.entries.filter((_, j) => j !== i) }))} title="Remove this entry">
                  <DigitizerIcon name="trash-2" size={13} />
                </span>
              )}
            </div>
          ))}
          {table.editable && (
            <div style={{ padding: "8px 10px", borderTop: "1px solid #EEF0F3" }}>
              <Btn small icon="plus" onClick={() => touch(setLedger, (p) => ({ ...p, entries: [...p.entries, { description: "", amount: "", kind: "charge" as const }] }))}>Add an entry</Btn>
            </div>
          )}
        </div>
      )}

      {table.editable ? (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <Btn primary disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save figures"}</Btn>
          {dirty && <Btn onClick={() => setDirty(false)}>Discard changes</Btn>}
          <span style={{ fontSize: "11px", color: "#94A3B8" }}>
            {rec ? `Calculated ${formatMoney(rec.calculated, table.currency)}${rec.stated !== null ? ` · printed ${formatMoney(rec.stated, table.currency)}` : ""}` : plural(lines.length, "line")}
          </span>
        </div>
      ) : (
        <div style={{ fontSize: "11.5px", color: "#94A3B8" }}>This document has been imported, so its figures can no longer be changed.</div>
      )}
    </div>
  );
}

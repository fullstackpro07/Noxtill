"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { finApi, type Boot } from "@/lib/finance-api";
import { errText, money, num, r2 } from "./fin-core";
import { useFin, type BillState } from "./fin-store";
import { acctOptions, type FinAct } from "./fin-actions";

const METHODS: BillState["method"][] = ["Manual", "Upload", "Photo Digitizer", "Email import"];
const inp: CSSProperties = { border: "1px solid #E6EAF0", borderRadius: "10px", padding: "10px 12px", fontSize: "13px", minHeight: "42px", background: "#fff", width: "100%" };
const lab: CSSProperties = { display: "flex", flexDirection: "column", gap: "5px" };
const labT: CSSProperties = { display: "flex", gap: "6px", alignItems: "center", fontSize: "11px", fontWeight: 800, color: "#667085", textTransform: "uppercase" };

/** Add / edit a vendor bill. Nothing posts from here — bills are saved as drafts for review and approval. */
export function BillModal({ boot, fin }: { boot: Boot | undefined; fin: FinAct }) {
  const bill = useFin((s) => s.bill);
  const set = useFin((s) => s.set);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const meta = useQuery({ queryKey: ["fin", "billmeta"], queryFn: finApi.billMeta, enabled: !!bill, staleTime: 60_000 });
  const opts = useMemo(() => acctOptions(boot), [boot]);
  const dup = useQuery({
    queryKey: ["fin", "billdup", bill?.vendor, bill?.supplierId, bill?.vinv, bill?.id],
    queryFn: () => finApi.billDuplicates({ vendor: bill!.vendor, supplierId: bill!.supplierId || undefined, invoice: bill!.vinv, exclude: bill!.id ?? undefined }),
    enabled: !!bill && !!bill.vinv.trim() && !!bill.vendor.trim(),
  });
  if (!bill) return null;
  const upd = (p: Partial<BillState>) => set((s) => ({ bill: s.bill ? { ...s.bill, ...p } : s.bill }));
  const updLine = (i: number, p: Partial<BillState["lines"][number]>) => set((s) => ({ bill: s.bill ? { ...s.bill, lines: s.bill.lines.map((l, j) => (j === i ? { ...l, ...p } : l)) } : s.bill }));
  const codes = boot?.taxCodes.filter((t) => t.kind === "input") ?? [];
  const lineAmt = (l: BillState["lines"][number]) => (l.amt ? num(l.amt) : r2(num(l.qty || "1") * num(l.unit)));
  const lineTax = (l: BillState["lines"][number]) => {
    const tc = codes.find((t) => t.code === l.tax);
    return tc ? r2((lineAmt(l) * Number(tc.rate)) / 100) : 0;
  };
  const sub = r2(bill.lines.reduce((a, l) => a + lineAmt(l), 0));
  const tax = r2(bill.lines.reduce((a, l) => a + lineTax(l), 0));
  const ocr = bill.method === "Photo Digitizer" && !!bill.conf;
  const confOf = (k: string) => (ocr ? bill.conf?.[k] ?? 0 : null);
  const confChip = (k: string) => {
    const cv = confOf(k);
    if (cv == null) return null;
    const low = cv < 90;
    return <span style={{ fontSize: "10px", fontWeight: 800, padding: "1px 6px", borderRadius: "10px", background: low ? "#FEF6E7" : "#E8F7EE", color: low ? "#B54708" : "#0E8442", textTransform: "none" }}>{cv ? `${cv}%` : "not read"}</span>;
  };
  const hi = (k: string): CSSProperties => {
    const cv = confOf(k);
    return cv != null && cv < 90 ? { border: "1px solid #FEC84B", background: "#FFFCF5" } : {};
  };
  const po = meta.data?.purchaseOrders.find((p) => p.id === bill.po);

  const scan = async (file: File) => {
    upd({ scanning: true, scanErr: "" });
    try {
      const r = await finApi.scanBill(file);
      const sup = r.supplierId ? r.supplierId : "";
      upd({
        scanning: false,
        attachment: r.attachment,
        vendor: r.supplierName ?? r.vendor ?? "",
        supplierId: sup,
        vinv: r.invoiceNo ?? "",
        date: r.billDate && /^\d{4}-\d{2}-\d{2}/.test(r.billDate) ? r.billDate.slice(0, 10) : bill.date,
        currency: r.currency && r.currency.length === 3 ? r.currency.toUpperCase() : bill.currency,
        conf: r.confidence,
        basis: r.basis,
        ocr: { vendor: r.vendor, invoiceNo: r.invoiceNo, billDate: r.billDate, total: r.total, tax: r.tax, basis: r.basis },
        lines: r.lines.length
          ? r.lines.map((l) => ({ desc: l.description ?? "Line", acct: bill.lines[0]?.acct ?? "", qty: String(l.qty ?? 1), unit: l.unitPrice != null ? String(l.unitPrice) : "", amt: l.total != null ? String(l.total) : "", tax: "", poItemId: "" }))
          : [{ desc: "Bill total", acct: bill.lines[0]?.acct ?? "", qty: "1", unit: "", amt: r.total != null ? String(r2((r.total ?? 0) - (r.tax ?? 0))) : "", tax: "", poItemId: "" }],
      });
    } catch (e) {
      upd({ scanning: false, scanErr: errText(e) });
    }
  };

  const upload = async (file: File) => {
    upd({ scanning: true, scanErr: "" });
    try {
      upd({ attachment: await finApi.uploadBillDoc(file), scanning: false });
    } catch (e) {
      upd({ scanning: false, scanErr: errText(e) });
    }
  };

  const fromPo = (id: string) => {
    const p = meta.data?.purchaseOrders.find((x) => x.id === id);
    if (!p) return upd({ po: "" });
    const grni = boot?.accounts.find((a) => a.systemKey === "grni")?.id ?? "";
    upd({
      po: id,
      vendor: p.supplier.name,
      supplierId: p.supplier.id,
      lines: p.items.filter((i) => i.qtyReceived > 0).map((i) => ({ desc: i.name, acct: grni, qty: String(i.qtyReceived), unit: String(i.unitCost), amt: "", tax: "", poItemId: i.id })),
    });
  };

  const save = async () => {
    setErr("");
    if (!bill.vendor.trim()) return setErr("Vendor is required.");
    const lines = bill.lines.filter((l) => l.desc || lineAmt(l));
    if (!lines.length || lines.some((l) => !l.acct)) return setErr("Every line needs an account.");
    if (!sub) return setErr("Enter the bill amount.");
    setBusy(true);
    try {
      const body = {
        vendorName: bill.vendor.trim(),
        supplierId: bill.supplierId || null,
        vendorInvoiceNo: bill.vinv.trim() || null,
        billDate: bill.date,
        dueDate: bill.due || bill.date,
        purchaseOrderId: bill.po || null,
        branchId: bill.branch || null,
        currency: bill.currency,
        notes: bill.notes || undefined,
        intake: bill.method === "Email import" ? "Manual" : bill.method,
        ocr: bill.ocr ?? undefined,
        attachment: bill.attachment,
        lines: lines.map((l) => ({ description: l.desc || "Bill line", accountId: l.acct, qty: num(l.qty || "1"), unitCost: l.unit ? num(l.unit) : undefined, amount: l.amt ? num(l.amt) : undefined, taxCode: l.tax || null, poItemId: l.poItemId || null })),
      };
      const r = bill.id ? await finApi.updateBill(bill.id, body) : await finApi.createBill(body);
      set({ bill: null });
      useFin.getState().flash(r.status === "Review Required" ? `${r.number} saved and flagged for review (possible duplicate or match exception).` : `${r.number} saved as draft. Submit it for approval when ready.`);
      await fin.invalidate();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,27,42,.45)", zIndex: 170, display: "flex", alignItems: "center", justifyContent: "center", padding: "18px" }}>
      <div role="dialog" aria-modal="true" aria-label="Add bill" style={{ background: "#fff", borderRadius: "18px", width: "760px", maxWidth: "100%", maxHeight: "94vh", display: "flex", flexDirection: "column", boxShadow: "0 30px 80px rgba(10,27,42,.3)", animation: "nxin .18s ease" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #F0F2F5", display: "flex", gap: "12px", alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 800, color: "#0F172A" }}>{bill.id ? "Edit bill" : "Add bill"}</h3>
            <div style={{ fontSize: "12px", color: "#667085", marginTop: "2px" }}>Saved as a draft. Nothing posts until it’s reviewed and approved.</div>
          </div>
          <button type="button" onClick={() => set({ bill: null })} aria-label="Close" style={{ width: "36px", height: "36px", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", color: "#475467", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "13px" }}>
          {!bill.id ? (
            <div role="tablist" aria-label="Intake method" style={{ display: "flex", gap: "3px", background: "#F2F4F7", padding: "3px", borderRadius: "10px", flexWrap: "wrap" }}>
              {METHODS.map((m) => {
                const on = m === bill.method;
                return (
                  <button key={m} type="button" role="tab" aria-selected={on} onClick={() => { setErr(""); upd({ method: m, conf: null }); }} style={{ flex: 1, border: 0, borderRadius: "8px", padding: "8px 12px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer", background: on ? "#fff" : "transparent", color: on ? "#0F172A" : "#475467", boxShadow: on ? "0 1px 3px rgba(16,24,40,.12)" : "none", minHeight: "38px", whiteSpace: "nowrap" }}>
                    {m === "Photo Digitizer" ? "AI Photo Digitizer" : m}
                  </button>
                );
              })}
            </div>
          ) : null}
          {bill.method === "Photo Digitizer" && !bill.id ? (
            ocr ? (
              <div style={{ fontSize: "12.5px", color: "#175CD3", background: "#EFF8FF", border: "1px solid #B2DDFF", borderRadius: "10px", padding: "10px 12px", fontWeight: 600 }}>
                Extracted from {bill.attachment?.name} by the Photo Digitizer ({bill.basis.toLowerCase()}). Fields under 90% — or not read — are highlighted; check them before saving.
              </div>
            ) : (
              <label style={{ border: "1.5px dashed #D0D5DD", borderRadius: "12px", padding: "20px", textAlign: "center", fontSize: "12.5px", color: "#667085", cursor: "pointer" }}>
                {bill.scanning ? "Reading the bill…" : "Choose a photo or PDF of the bill — the Photo Digitizer reads vendor, invoice number, date, lines and totals."}
                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={bill.scanning} onChange={(e) => e.target.files?.[0] && void scan(e.target.files[0])} style={{ display: "block", margin: "10px auto 0" }} />
              </label>
            )
          ) : null}
          {bill.method === "Upload" && !bill.id ? (
            <label style={{ border: "1.5px dashed #D0D5DD", borderRadius: "12px", padding: "20px", textAlign: "center", fontSize: "12.5px", color: "#667085", cursor: "pointer" }}>
              {bill.attachment ? `Attached: ${bill.attachment.name}` : bill.scanning ? "Uploading…" : "Choose a PDF or image — it’s stored with the bill as its document."}
              <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" disabled={bill.scanning} onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} style={{ display: "block", margin: "10px auto 0" }} />
            </label>
          ) : null}
          {bill.method === "Email import" ? (
            <div style={{ fontSize: "12.5px", color: "#475467", background: "#F9FAFB", borderRadius: "10px", padding: "10px 12px" }}>
              Email import isn’t available — Noxtill can’t receive bills by email yet. Save the attachment from your inbox and use <b>Upload</b> or <b>AI Photo Digitizer</b>, or enter it manually below.
            </div>
          ) : null}
          {bill.scanErr ? <div role="alert" style={{ fontSize: "12.5px", fontWeight: 700, color: "#B42318", background: "#FEF3F2", border: "1px solid #FDA29B", borderRadius: "10px", padding: "10px 12px" }}>{bill.scanErr}</div> : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "10px" }}>
            <label style={lab}>
              <span style={labT}>Vendor {confChip("vendor")}</span>
              <input list="fin-suppliers" value={bill.vendor} onChange={(e) => { const s = meta.data?.suppliers.find((x) => x.name === e.target.value); upd({ vendor: e.target.value, supplierId: s?.id ?? "" }); }} style={{ ...inp, ...hi("vendor") }} />
              <datalist id="fin-suppliers">{meta.data?.suppliers.map((s) => <option key={s.id} value={s.name} />)}</datalist>
            </label>
            <label style={lab}>
              <span style={labT}>Vendor invoice # {confChip("vinv")}</span>
              <input value={bill.vinv} onChange={(e) => upd({ vinv: e.target.value })} style={{ ...inp, ...hi("vinv") }} />
            </label>
            <label style={lab}>
              <span style={labT}>Bill date {confChip("date")}</span>
              <input type="date" value={bill.date} onChange={(e) => upd({ date: e.target.value })} style={{ ...inp, ...hi("date") }} />
            </label>
            <label style={lab}>
              <span style={labT}>Due date {confChip("due")}</span>
              <input type="date" value={bill.due} onChange={(e) => upd({ due: e.target.value })} style={{ ...inp, ...hi("due") }} />
            </label>
            <label style={lab}>
              <span style={labT}>PO reference (optional)</span>
              <select value={bill.po} onChange={(e) => fromPo(e.target.value)} style={inp}>
                <option value="">No PO</option>
                {meta.data?.purchaseOrders.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.ref} · {p.supplier.name} · {p.status.replace("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label style={lab}>
              <span style={labT}>Currency</span>
              <input value={bill.currency} maxLength={3} onChange={(e) => upd({ currency: e.target.value.toUpperCase() })} style={inp} />
            </label>
          </div>
          <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", overflowX: "auto" }}>
            <div style={{ minWidth: "660px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(140px,1.3fr) minmax(150px,1.2fr) 60px 90px 100px 110px 30px", gap: "8px", padding: "8px 12px", background: "#FAFBFC", fontSize: "11px", fontWeight: 800, color: "#667085", textTransform: "uppercase" }}>
                <span>Description</span>
                <span>Account</span>
                <span>Qty</span>
                <span>Unit</span>
                <span style={{ display: "flex", gap: "4px", alignItems: "center" }}>Amount {confChip("amt")}</span>
                <span style={{ display: "flex", gap: "4px", alignItems: "center" }}>Tax {confChip("tax")}</span>
                <span />
              </div>
              {bill.lines.map((l, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(140px,1.3fr) minmax(150px,1.2fr) 60px 90px 100px 110px 30px", gap: "8px", padding: "8px 12px", borderTop: "1px solid #F2F4F7", alignItems: "center" }}>
                  <input value={l.desc} onChange={(e) => updLine(i, { desc: e.target.value })} style={{ ...inp, minHeight: "38px", padding: "8px" }} aria-label={`Description ${i + 1}`} />
                  <select value={l.acct} onChange={(e) => updLine(i, { acct: e.target.value })} style={{ ...inp, minHeight: "38px", padding: "8px", ...(ocr && !l.acct ? hi("acct") : {}) }} aria-label={`Account ${i + 1}`}>
                    <option value="">Choose…</option>
                    {opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                  <input value={l.qty} inputMode="decimal" onChange={(e) => updLine(i, { qty: e.target.value, amt: "" })} style={{ ...inp, minHeight: "38px", padding: "8px" }} aria-label={`Quantity ${i + 1}`} />
                  <input value={l.unit} inputMode="decimal" onChange={(e) => updLine(i, { unit: e.target.value, amt: "" })} style={{ ...inp, minHeight: "38px", padding: "8px" }} aria-label={`Unit cost ${i + 1}`} />
                  <input value={l.amt || (l.unit ? String(lineAmt(l)) : "")} inputMode="decimal" onChange={(e) => updLine(i, { amt: e.target.value })} style={{ ...inp, minHeight: "38px", padding: "8px", ...hi("amt") }} aria-label={`Amount ${i + 1}`} />
                  <select value={l.tax} onChange={(e) => updLine(i, { tax: e.target.value })} style={{ ...inp, minHeight: "38px", padding: "8px" }} aria-label={`Tax ${i + 1}`}>
                    <option value="">No tax</option>
                    {codes.map((t) => <option key={t.code} value={t.code}>{t.code} {Number(t.rate)}%</option>)}
                  </select>
                  <button type="button" aria-label={`Remove line ${i + 1}`} onClick={() => bill.lines.length > 1 && upd({ lines: bill.lines.filter((_, j) => j !== i) })} style={{ width: "28px", height: "28px", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "7px", color: "#98A2B3", cursor: "pointer" }}>
                    ×
                  </button>
                </div>
              ))}
              <div style={{ padding: "9px 12px", borderTop: "1px solid #F2F4F7", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <button type="button" onClick={() => upd({ lines: [...bill.lines, { desc: "", acct: bill.lines[0]?.acct ?? "", qty: "1", unit: "", amt: "", tax: "", poItemId: "" }] })} style={{ border: "1px dashed #D0D5DD", background: "#fff", borderRadius: "9px", padding: "7px 12px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer" }}>
                  + Add line
                </button>
                <span style={{ marginLeft: "auto", fontSize: "12.5px", color: "#475467" }}>
                  Subtotal <b style={{ color: "#101828" }}>{money(sub, bill.currency)}</b> · Tax <b style={{ color: "#101828" }}>{money(tax, bill.currency)}</b> · Total <b style={{ color: "#101828" }}>{money(r2(sub + tax), bill.currency)}</b>
                </span>
              </div>
            </div>
          </div>
          {ocr && bill.ocr && typeof bill.ocr.total === "number" && Math.abs(Number(bill.ocr.total) - r2(sub + tax)) > 0.01 ? (
            <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#B54708", background: "#FFFCF5", border: "1px solid #FEDF89", borderRadius: "10px", padding: "10px 12px" }}>
              The printed total on the bill is {money(Number(bill.ocr.total), bill.currency)}; the lines add up to {money(r2(sub + tax), bill.currency)}. Check the lines and tax before saving.
            </div>
          ) : null}
          {po ? (
            <div style={{ fontSize: "12px", color: "#475467", background: "#F9FAFB", borderRadius: "10px", padding: "10px 12px" }}>
              Lines prefilled from {po.ref} at the quantities received; they post against Goods Received Not Invoiced. Quantity or price differences beyond tolerance are flagged for review.
            </div>
          ) : null}
          {dup.data?.length ? (
            <div role="alert" style={{ fontSize: "12.5px", fontWeight: 700, color: "#B42318", background: "#FEF3F2", border: "1px solid #FDA29B", borderRadius: "10px", padding: "10px 12px" }}>
              Possible duplicate — vendor invoice {bill.vinv} from {bill.vendor} already exists on {dup.data.map((d) => `${d.number} (${money(Number(d.total), bill.currency)})`).join(", ")}.
            </div>
          ) : null}
          <label style={lab}>
            <span style={labT}>Notes</span>
            <textarea value={bill.notes} onChange={(e) => upd({ notes: e.target.value })} rows={2} style={{ ...inp, resize: "vertical" }} />
          </label>
          {err ? <div role="alert" style={{ fontSize: "12.5px", fontWeight: 700, color: "#B42318", background: "#FEF3F2", border: "1px solid #FDA29B", borderRadius: "10px", padding: "10px 12px" }}>{err}</div> : null}
          <div style={{ fontSize: "11.5px", color: "#98A2B3" }}>Vendors come from your supplier list (type a new name for a one-off vendor). PO and receipt quantities are read from Inventory › Purchases.</div>
        </div>
        <div style={{ padding: "13px 20px", borderTop: "1px solid #F0F2F5", display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button type="button" onClick={() => set({ bill: null })} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "10px 14px", fontSize: "12.5px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "44px" }}>
            Cancel
          </button>
          <button type="button" onClick={() => void save()} disabled={busy || bill.scanning} style={{ border: 0, background: "#12A150", borderRadius: "10px", padding: "10px 16px", fontSize: "12.5px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "44px" }}>
            {busy ? "Saving…" : "Save Draft Bill"}
          </button>
        </div>
      </div>
    </div>
  );
}

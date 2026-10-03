"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { payPublicApi, type PublicPay } from "@/lib/payments-api";

const money = (v: number | null, c: string) => {
  if (v == null) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: c, maximumFractionDigits: 2 }).format(v);
  } catch {
    return `${c} ${v.toFixed(2)}`;
  }
};

/**
 * The customer-facing payment page. Shows only what the customer needs: amount, description, due
 * date and how to pay — no internal IDs, notes or provider details. Paying opens Stripe Checkout
 * on the business's own account; the request becomes Paid only when Stripe confirms it.
 */
export function PayPage({ token }: { token: string }) {
  const [d, setD] = useState<PublicPay | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [amt, setAmt] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (token === "updated") return;
    payPublicApi
      .view(token)
      .then((x) => {
        setDone(new URLSearchParams(window.location.search).get("done") === "1");
        setD(x);
        if (x.amountDue != null) setAmt(String(x.amountDue));
        void payPublicApi.viewed(token).catch(() => null);
      })
      .catch((e) => setErr(e instanceof ApiError ? e.message : "This payment link couldn’t be loaded."));
  }, [token]);

  const pay = async () => {
    if (!d) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await payPublicApi.checkout(token, d.amountType === "Flexible" || d.allowPartial ? Number(amt) : undefined);
      window.location.assign(r.url);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Couldn’t start the payment.");
      setBusy(false);
    }
  };

  const shell = (inner: React.ReactNode) => (
    <main style={{ minHeight: "100vh", background: "#F4F6F8", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 16px", fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", color: "#101828" }}>
      <div style={{ width: 460, maxWidth: "100%", background: "#fff", border: "1px solid #E6EAF0", borderRadius: 18, overflow: "hidden", boxShadow: "0 14px 40px rgba(10,27,42,.08)" }}>{inner}</div>
    </main>
  );

  if (token === "updated")
    return shell(
      <div style={{ padding: 28, textAlign: "center" }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Thank you</div>
        <p style={{ fontSize: 13, color: "#475467", lineHeight: 1.6 }}>Your payment method was submitted securely to the payment provider. You can close this page.</p>
      </div>,
    );
  if (err && !d)
    return shell(
      <div style={{ padding: 28, textAlign: "center" }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Payment link unavailable</div>
        <p style={{ fontSize: 13, color: "#475467", lineHeight: 1.6 }}>{err}</p>
      </div>,
    );
  if (!d) return shell(<div style={{ padding: 28, fontSize: 13, color: "#667085" }}>Loading…</div>);

  const open = ["Open", "Sent", "Viewed", "Partially Paid"].includes(d.status);
  return shell(
    <>
      {d.test ? <div style={{ background: "repeating-linear-gradient(135deg,#FEF6E7 0 14px,#FDE3B3 14px 28px)", padding: "6px 16px", fontSize: 11.5, fontWeight: 800, color: "#7A2E0B", textAlign: "center" }}>TEST MODE · no real money moves</div> : null}
      <div style={{ padding: "18px 22px", background: "#0A1B2A", color: "#fff", display: "flex", alignItems: "center", gap: 12 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- business logo from its own branding URL */}
        {d.business.logo ? <img src={d.business.logo} alt="" style={{ width: 36, height: 36, borderRadius: 9, objectFit: "cover", background: "#fff" }} /> : null}
        <span style={{ fontSize: 16, fontWeight: 800 }}>{d.business.name}</span>
      </div>
      <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#667085" }}>{d.description}</div>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-.8px", marginTop: 4 }}>{d.amountType === "Flexible" ? "Enter any amount" : money(d.amountDue, d.currency)}</div>
          {d.paid > 0 ? <div style={{ fontSize: 12, color: "#0E8442", fontWeight: 700, marginTop: 4 }}>{money(d.paid, d.currency)} already paid</div> : null}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[["Reference", d.reference ?? "—"], ["Due", d.dueOn ?? "—"], ["Pay with", d.methods.join(" · ") || "—"], ["Link expires", new Date(d.expiresAt).toLocaleDateString()]].map(([k, v]) => (
            <div key={k} style={{ background: "#FAFBFC", borderRadius: 9, padding: "9px 10px" }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "#667085" }}>{k}</div>
              <div style={{ fontSize: 12.5, fontWeight: 800, marginTop: 2, overflowWrap: "anywhere" }}>{v}</div>
            </div>
          ))}
        </div>
        {d.note ? <div style={{ fontSize: 12.5, color: "#344054", background: "#FAFBFC", borderRadius: 10, padding: "10px 12px", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{d.note}</div> : null}
        {done && open ? <div role="status" style={{ background: "#EFF8FF", border: "1px solid #D1E9FF", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, color: "#175CD3", lineHeight: 1.5 }}>Payment processing — this page updates once the payment provider confirms it.</div> : null}
        {d.status === "Paid" ? <div role="status" style={{ background: "#ECFDF3", border: "1px solid #D1F2DF", borderRadius: 10, padding: 14, fontSize: 14, fontWeight: 800, color: "#0E8442", textAlign: "center" }}>Paid — thank you</div> : null}
        {d.status === "Expired" || d.status === "Cancelled" ? <div role="status" style={{ background: "#F2F4F7", borderRadius: 10, padding: 14, fontSize: 13, fontWeight: 700, color: "#475467", textAlign: "center" }}>This link has {d.status === "Expired" ? "expired" : "been cancelled"}. Contact {d.business.name} for a new one.</div> : null}
        {open && d.canPayOnline ? (
          <>
            {d.amountType === "Flexible" || d.allowPartial ? (
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: "#344054" }}>
                Amount to pay ({d.currency})
                <input type="number" min={d.minAmount} step="any" value={amt} onChange={(e) => setAmt(e.target.value)} style={{ border: "1px solid #E6EAF0", borderRadius: 10, padding: 10, fontSize: 14, minHeight: 44 }} />
              </label>
            ) : null}
            <button type="button" disabled={busy} onClick={() => void pay()} style={{ border: 0, background: "#12A150", color: "#fff", borderRadius: 11, padding: "13px 16px", fontSize: 14, fontWeight: 800, cursor: "pointer", minHeight: 48 }}>
              {busy ? "Opening secure checkout…" : "Pay securely"}
            </button>
            <div style={{ fontSize: 11, color: "#667085", textAlign: "center" }}>Card details are entered on the payment provider’s secure page, never here.</div>
          </>
        ) : null}
        {open && d.manualMethods.length ? (
          <div style={{ border: "1px solid #E6EAF0", borderRadius: 10, padding: "12px 14px", fontSize: 12.5, color: "#344054", lineHeight: 1.6 }}>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>{d.canPayOnline ? "Or pay another way" : "How to pay"}</div>
            Pay by {d.manualMethods.join(" or ").toLowerCase()} and quote the reference above{d.business.phone ? `. Questions: ${d.business.phone}` : ""}{d.business.address ? ` · ${d.business.address}` : ""}. {d.business.name} marks this request paid once the money arrives.
          </div>
        ) : null}
        {err ? <div role="alert" style={{ background: "#FEF3F2", border: "1px solid #FDD9D6", borderRadius: 10, padding: "10px 12px", fontSize: 12, color: "#B42318", fontWeight: 700 }}>{err}</div> : null}
      </div>
    </>,
  );
}

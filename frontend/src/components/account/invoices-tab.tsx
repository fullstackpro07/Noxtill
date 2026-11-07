"use client";

import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { fetchBillingInvoices } from "@/lib/billing-api";
import { fetchEntitlements, fetchPaymentMethods } from "@/lib/usage-api";
import { ErrorState, Skeleton, U, dateUtc, h2, money2, section, sub, th, theadRow, tr } from "@/components/usage/usage-ui";

const STATUS: Record<string, [string, string, string]> = {
  paid: ["Paid", U.greenSoft, "var(--app-primary-hover)"],
  open: ["Due", U.warnBg, U.warnText],
  uncollectible: ["Unpaid", U.dangerBg, U.danger],
  void: ["Void", U.line, U.text3],
  draft: ["Draft", U.line, U.text3],
};

export function InvoicesTab() {
  const q = useQuery({ queryKey: ["billing-invoices"], queryFn: fetchBillingInvoices, retry: (n, e) => !(e instanceof ApiError && e.status === 403) && n < 2 });
  const ent = useQuery({ queryKey: ["usage", "entitlements"], queryFn: fetchEntitlements });
  const cards = useQuery({ queryKey: ["usage", "payment-methods"], queryFn: fetchPaymentMethods, retry: false });
  if (q.isLoading) return <Skeleton />;
  if (q.isError) return <ErrorState title="We couldn't load billing history" body="The billing service didn't respond. Nothing was changed." onRetry={() => q.refetch()} />;
  const invoices = q.data ?? [];
  const trial = ent.data?.status === "trialing";
  const def = cards.data?.methods.find((c) => c.isDefault);
  const subLine = trial && invoices.length === 0 ? "Nothing billed during your free trial." : def ? `Charged to ${def.brand} •••• ${def.last4}. Invoices and receipts come from Stripe.` : "Invoices and receipts come from Stripe.";

  return (
    <section style={{ ...section, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 20px", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={h2}>Billing history</h2>
          <p style={sub}>{subLine}</p>
        </div>
      </div>
      {invoices.length === 0 ? (
        <div style={{ padding: "30px 20px", borderTop: `1px solid ${U.line}`, textAlign: "center", fontSize: 12.5, color: U.muted }}>
          {trial ? `No invoices yet. Your first invoice will appear here when your trial ends on ${dateUtc(ent.data?.trialEndsAt)}.` : "No invoices yet."}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={theadRow}>
                <th style={{ ...th, padding: "10px 20px" }}>Date</th>
                <th style={th}>Invoice</th>
                <th style={{ ...th, textAlign: "right" }}>Amount</th>
                <th style={th}>Status</th>
                <th style={{ ...th, padding: "10px 20px", textAlign: "right" }}>
                  <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Download</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((v) => {
                const [label, bg, fg] = STATUS[v.status ?? ""] ?? [v.status ?? "—", U.line, U.text3];
                const link = v.invoicePdf ?? v.hostedInvoiceUrl;
                return (
                  <tr key={v.id} style={tr}>
                    <td style={{ padding: "12px 20px", color: U.text2, fontWeight: 600, whiteSpace: "nowrap" }}>{dateUtc(v.createdAt)}</td>
                    <td style={{ padding: 12, color: U.muted, whiteSpace: "nowrap" }}>{v.number ?? v.id}</td>
                    <td style={{ padding: 12, textAlign: "right", fontWeight: 700, color: U.text, whiteSpace: "nowrap" }}>
                      {money2(v.status === "paid" ? v.amountPaid : v.amountDue)} {v.currency.toUpperCase() !== "USD" ? v.currency.toUpperCase() : ""}
                    </td>
                    <td style={{ padding: 12 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, borderRadius: 20, padding: "3px 9px", background: bg, color: fg }}>{label}</span>
                    </td>
                    <td style={{ padding: "12px 20px", textAlign: "right" }}>
                      {link ? (
                        <a href={link} target="_blank" rel="noreferrer" aria-label={`Download ${v.number ?? v.id}`} style={{ border: `1px solid ${U.border}`, background: "#fff", borderRadius: 8, padding: "6px 10px", fontSize: 11.5, fontWeight: 700, color: U.text2, minHeight: 34, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
                          PDF
                        </a>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

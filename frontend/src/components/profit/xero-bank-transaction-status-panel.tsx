"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/session";
import { ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import { fetchXeroBankTransactionStatus } from "@/lib/profit-api";

export function XeroBankTransactionStatusPanel({
  branchId,
}: {
  branchId: string;
}) {
  const session = useSession();
  const query = useQuery({
    queryKey: ["finance-xero-bank-transaction-status", session.business.id, branchId],
    queryFn: () => fetchXeroBankTransactionStatus(branchId),
    enabled: false,
  });
  const review = query.data;

  return (
    <section
      className="rounded-[16px]"
      style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 17 }}
      aria-label="Xero bank transaction status"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>
            Xero bank transaction status
          </h2>
          <p className="mb-0 mt-1 text-[12px]" style={{ color: "var(--app-text-faint)" }}>
            Read Xero&rsquo;s reconciliation flags for the last 30 UTC dates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/integrations"
            className="rounded-[9px] px-3 py-2 text-[11px] font-bold"
            style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}
          >
            Integrations
          </Link>
          <button
            type="button"
            onClick={() => { void query.refetch(); }}
            disabled={query.isFetching}
            className="rounded-[11px] px-4 py-2.5 text-[12px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--app-primary)" }}
          >
            {query.isFetching ? "Checking…" : review ? "Refresh Xero" : "Check Xero"}
          </button>
        </div>
      </div>

      {query.isError ? (
        <p role="alert" className="mb-0 mt-3 text-[12px]" style={{ color: "var(--app-text-muted)" }}>
          {query.error instanceof ApiError ? query.error.message : "Xero bank transaction status could not be checked."}
        </p>
      ) : !review ? (
        <p className="mb-0 mt-3 text-[12px]" style={{ color: "var(--app-text-disabled)" }}>
          Check Xero when you want. A connection with bank transaction read access is required.
        </p>
      ) : review.status !== "available" ? (
        <p role="status" className="mb-0 mt-3 text-[12px]" style={{ color: "var(--app-text-muted)" }}>
          {review.unavailableReason || "Xero bank transaction status is not available for this business."}
        </p>
      ) : (
        <div className="mt-3">
          <p className="mb-0 text-[10.5px]" style={{ color: "var(--app-text-faint)" }}>
            {review.fromDate} to {review.toDate} · checked {review.observedAt ? new Date(review.observedAt).toLocaleString() : "time unavailable"}.
            {review.partial ? " The page limit was reached, so this result is partial." : ""}
          </p>
          {review.currencies.length === 0 ? (
            <p role="status" className="mb-0 mt-2 text-[12px]" style={{ color: "var(--app-text-muted)" }}>
              Xero returned no authorized bank transactions in this date range.
            </p>
          ) : (
            <div className="mt-2 grid gap-2 lg:grid-cols-2">
              {review.currencies.map((currency) => (
                <div key={currency.currencyCode} className="rounded-[10px] p-3" style={{ background: "var(--app-surface-2)" }}>
                  <div className="mb-2 text-[11px] font-extrabold" style={{ color: "var(--app-text)" }}>
                    {currency.currencyCode}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {([ ["Xero marked reconciled", currency.reconciled], ["Xero marked unreconciled", currency.unreconciled] ] as const).map(([label, side]) => (
                      <div key={label} className="rounded-[8px] p-2" style={{ border: "1px solid var(--app-border)" }}>
                        <div className="text-[10px] font-semibold" style={{ color: "var(--app-text-faint)" }}>
                          {label} · {side.transactionCount} transactions
                        </div>
                        <div className="mt-0.5 text-[13px] font-extrabold" style={{ color: "var(--app-text)" }}>
                          {formatCurrency(Number(side.amount), currency.currencyCode)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mb-0 mt-2 text-[10px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
            This is Xero&rsquo;s IsReconciled state for authorized transactions. No bank statement lines are read, and these transactions are not matched to Noxtill ledger entries; this is not a Noxtill reconciliation.
          </p>
        </div>
      )}
    </section>
  );
}

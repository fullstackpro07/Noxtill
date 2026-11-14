"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpRight, CircleHelp, ClipboardCheck, FileText, RefreshCw } from "lucide-react";
import { fetchBranches } from "@/lib/branches-api";
import { ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import { useSession } from "@/lib/session";
import { fetchFinancePeriodCloseReadiness } from "@/lib/profit-api";
import { FinancialAgentQuickReview } from "@/components/profit/financial-agent-quick-review";

function currentMonth() {
  const today = new Date();
  return `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
}

const cardStyle: React.CSSProperties = {
  border: "1px solid var(--app-border)",
  background: "var(--app-surface)",
  borderRadius: 15,
  padding: 18,
};

function money(amount: string, currency: string) {
  return formatCurrency(Number(amount), currency);
}

export function PeriodCloseReadinessView() {
  const session = useSession();
  const [month, setMonth] = useState(currentMonth);
  const [branchId, setBranchId] = useState("all");
  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });
  const readinessQuery = useQuery({
    queryKey: ["finance-period-close", session.business.id, month, branchId],
    queryFn: () => fetchFinancePeriodCloseReadiness(month, branchId),
  });
  const scopeLabel = useMemo(() => branchId === "all" ? "All branches" : branchesQuery.data?.find((item) => item.id === branchId)?.name ?? "Selected branch", [branchId, branchesQuery.data]);

  return (
    <main className="flex flex-col gap-4 px-[22px] pb-8 pt-5">
      <section style={cardStyle}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="rounded-xl p-2.5" style={{ background: "var(--app-primary-soft)", color: "var(--app-primary)" }}><ClipboardCheck size={21} aria-hidden /></span>
            <div>
              <h1 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)" }}>Period Close Readiness</h1>
              <p className="mb-0 mt-1 max-w-[760px] text-[13px]" style={{ color: "var(--app-text-muted)" }}>Review real sales, expenses, pending returns, manual Noxtill journals and Xero sync activity for a month. This is a preparation checklist, not a reconciled statement or certified accounting close.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="close-month">Month</label>
            <input id="close-month" aria-label="Month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="h-10 rounded-[10px] px-3 text-[13px]" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text)" }} />
            <label className="sr-only" htmlFor="close-branch">Business scope</label>
            <select id="close-branch" aria-label="Business scope" value={branchId} onChange={(event) => setBranchId(event.target.value)} className="h-10 rounded-[10px] px-3 text-[13px]" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text)" }}>
              <option value="all">All branches</option>
              {(branchesQuery.data ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl px-4 py-3 text-[12px]" style={{ background: "var(--app-surface-2)", color: "var(--app-text-muted)" }}>
          <span><strong style={{ color: "var(--app-text)" }}>Period:</strong> {month || "Choose a month"}</span>
          <span><strong style={{ color: "var(--app-text)" }}>Scope:</strong> {scopeLabel}</span>
          <span><strong style={{ color: "var(--app-text)" }}>Currency:</strong> each branch is shown separately in its current business currency</span>
        </div>
      </section>

      {readinessQuery.isPending && <section className="grid gap-3 md:grid-cols-2">{[0, 1, 2, 3].map((item) => <div key={item} className="h-36 animate-pulse rounded-[15px]" style={{ background: "var(--app-surface-2)" }} />)}</section>}

      {readinessQuery.isError && (
        <section role="alert" style={cardStyle}>
          <div className="flex items-start gap-3"><AlertTriangle size={19} color="#B54708" aria-hidden /><div><h2 className="m-0 text-sm font-bold" style={{ color: "var(--app-text)" }}>Readiness data could not be loaded</h2><p className="mb-3 mt-1 text-[13px]" style={{ color: "var(--app-text-muted)" }}>{readinessQuery.error instanceof ApiError ? readinessQuery.error.message : "No partial totals are shown because the source records could not be checked."}</p><button type="button" onClick={() => void readinessQuery.refetch()} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: "var(--app-primary)" }}><RefreshCw size={14} aria-hidden />Try again</button></div></div>
        </section>
      )}

      {readinessQuery.data && (
        <>
          <section className="rounded-[15px] border px-4 py-3" style={{ borderColor: "#F5D78E", background: "#FFFAEB", color: "#7A4B00" }}>
            <div className="flex items-start gap-2.5"><CircleHelp size={17} className="mt-0.5 shrink-0" aria-hidden /><p className="m-0 text-[13px] leading-5"><strong>Partial coverage.</strong> {readinessQuery.data.note}</p></div>
          </section>

          {readinessQuery.data.businesses.length === 0 && <section className="text-center" style={cardStyle}><p className="m-0 text-sm" style={{ color: "var(--app-text-muted)" }}>No businesses were found in this scope.</p></section>}

          <section className="grid gap-3 xl:grid-cols-2">
            {readinessQuery.data.businesses.map((business) => (
              <article key={business.businessId} style={cardStyle}>
                <div className="flex items-start justify-between gap-3 border-b pb-3" style={{ borderColor: "var(--app-border)" }}>
                  <div><h2 className="m-0 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>{business.businessName}</h2><p className="m-0 mt-1 text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Amounts use {business.currency}, the current currency configured for this business.</p></div>
                  <span className="rounded-full px-2.5 py-1 text-[10.5px] font-bold" style={{ background: "#FFF4E5", color: "#9A4D00" }}>Preparation only</span>
                </div>

                <div className="grid gap-2.5 pt-3 sm:grid-cols-2">
                  <div className="rounded-xl p-3" style={{ background: "var(--app-surface-2)" }}>
                    <p className="m-0 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--app-text-muted)" }}>Sales activity</p>
                    <p className="mb-0 mt-1 text-xl font-extrabold" style={{ color: "var(--app-text)" }}>{money(business.sales.completedOrderTotal, business.currency)}</p>
                    <p className="mb-0 mt-1 text-[11.5px]" style={{ color: "var(--app-text-muted)" }}>{business.sales.completedOrderCount} completed of {business.sales.orderCount} non-quotation orders · {business.sales.openOrderCount} open · {business.sales.cancelledOrderCount} cancelled</p>
                    <p className="mb-0 mt-1 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>Order value is not proof of payment settlement.</p>
                    <Link href="/orders" className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-bold" style={{ color: "var(--app-primary)" }}>Review orders <ArrowUpRight size={13} aria-hidden /></Link>
                  </div>

                  <div className="rounded-xl p-3" style={{ background: "var(--app-surface-2)" }}>
                    <p className="m-0 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--app-text-muted)" }}>Recorded expenses</p>
                    <p className="mb-0 mt-1 text-xl font-extrabold" style={{ color: "var(--app-text)" }}>{money(business.expenses.recordedTotal, business.currency)}</p>
                    <p className="mb-0 mt-1 text-[11.5px]" style={{ color: "var(--app-text-muted)" }}>{business.expenses.count} rows · {business.expenses.withoutAttachedReceiptCount} without attached receipt evidence ({money(business.expenses.withoutAttachedReceiptTotal, business.currency)})</p>
                    <p className="mb-0 mt-1 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>Missing receipt evidence is a review signal, not proof an expense is invalid.</p>
                    <Link href="/expenses" className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-bold" style={{ color: "var(--app-primary)" }}>Review expenses <ArrowUpRight size={13} aria-hidden /></Link>
                  </div>

                  <div className="rounded-xl p-3" style={{ background: business.pendingReturns.count ? "#FFF7ED" : "var(--app-surface-2)" }}>
                    <p className="m-0 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--app-text-muted)" }}>Pending return requests</p>
                    <p className="mb-0 mt-1 text-xl font-extrabold" style={{ color: "var(--app-text)" }}>{money(business.pendingReturns.refundAmount, business.currency)}</p>
                    <p className="mb-0 mt-1 text-[11.5px]" style={{ color: "var(--app-text-muted)" }}>{business.pendingReturns.count} request{business.pendingReturns.count === 1 ? "" : "s"} created in this period</p>
                    <Link href="/orders" className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-bold" style={{ color: "var(--app-primary)" }}>Review returns in Orders <ArrowUpRight size={13} aria-hidden /></Link>
                  </div>

                  <div className="rounded-xl p-3" style={{ background: "var(--app-surface-2)" }}>
                    <p className="m-0 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--app-text-muted)" }}>Xero accounting sync</p>
                    {business.xeroSync.status === "connected" ? <><p className="mb-0 mt-1 text-xl font-extrabold" style={{ color: "var(--app-text)" }}>{business.xeroSync.unsyncedOrderCount} unsynced orders</p><p className="mb-0 mt-1 text-[11.5px]" style={{ color: "var(--app-text-muted)" }}>{business.xeroSync.lastSyncAt ? `Last integration sync ${new Date(business.xeroSync.lastSyncAt).toLocaleString()}` : "No completed sync time is recorded."}</p></> : business.xeroSync.status === "not_evaluated" ? <><p className="mb-0 mt-1 text-base font-bold" style={{ color: "var(--app-text)" }}>Not evaluated</p><p className="mb-0 mt-1 text-[11.5px]" style={{ color: "var(--app-text-muted)" }}>{business.xeroSync.unavailableReason ?? "Xero was not evaluated for this review."}</p></> : <><p className="mb-0 mt-1 text-base font-bold" style={{ color: "var(--app-text)" }}>Not connected</p><p className="mb-0 mt-1 text-[11.5px]" style={{ color: "var(--app-text-muted)" }}>No sync backlog is inferred while Xero is disconnected.</p></>}
                    {business.xeroSync.status !== "not_evaluated" && <Link href="/integrations" className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-bold" style={{ color: "var(--app-primary)" }}>Open integrations <ArrowUpRight size={13} aria-hidden /></Link>}
                  </div>

                  <div className="rounded-xl p-3" style={{ background: business.statementReview.unmatchedCount ? "#FFF7ED" : "var(--app-surface-2)" }}>
                    <p className="m-0 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--app-text-muted)" }}>Imported statement review</p>
                    <p className="mb-0 mt-1 text-xl font-extrabold" style={{ color: "var(--app-text)" }}>{business.statementReview.lineCount} statement lines</p>
                    <p className="mb-0 mt-1 text-[11.5px]" style={{ color: "var(--app-text-muted)" }}>{business.statementReview.importCount} import{business.statementReview.importCount === 1 ? "" : "s"} overlap this month · {business.statementReview.matchedCount} human matched · {business.statementReview.unmatchedCount} awaiting review · {business.statementReview.noMatchCount} marked no match</p>
                    <p className="mb-0 mt-1 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>Imported CSV evidence only; not a bank feed or proof of settlement.</p>
                    <Link href="/profit/reconciliation" className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-bold" style={{ color: "var(--app-primary)" }}>Review statements <ArrowUpRight size={13} aria-hidden /></Link>
                  </div>

                  <div className="rounded-xl p-3" style={{ background: business.manualJournals.unbalancedPostedCount ? "#FFF7ED" : "var(--app-surface-2)" }}>
                    <p className="m-0 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--app-text-muted)" }}>Noxtill manual journal checks</p>
                    <p className="mb-0 mt-1 text-xl font-extrabold" style={{ color: "var(--app-text)" }}>{business.manualJournals.balancedPostedCount} balanced of {business.manualJournals.postedCount} posted</p>
                    <p className="mb-0 mt-1 text-[11.5px]" style={{ color: "var(--app-text-muted)" }}>{business.manualJournals.unbalancedPostedCount} unbalanced · {business.manualJournals.unresolvedCount} draft or awaiting decision</p>
                    <p className="mb-0 mt-1 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>{business.manualJournals.postingLocked ? `Noxtill journal posting locked${business.manualJournals.lockReason ? `: ${business.manualJournals.lockReason}` : ""}` : "Noxtill journal posting is open for this month"}. These checks cover manually entered Noxtill rows only.</p>
                    <Link href={`/profit/journals?month=${encodeURIComponent(month)}`} className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-bold" style={{ color: "var(--app-primary)" }}>Review journals <ArrowUpRight size={13} aria-hidden /></Link>
                  </div>
                </div>
              </article>
            ))}
          </section>

          <section style={cardStyle}>
            <div className="flex items-center gap-2"><FileText size={17} style={{ color: "var(--app-primary)" }} aria-hidden /><h2 className="m-0 text-[14px] font-extrabold" style={{ color: "var(--app-text)" }}>Accounting checks not available</h2></div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">{readinessQuery.data.unavailable.map((item) => <div key={item.key} className="rounded-xl p-3" style={{ background: "var(--app-surface-2)" }}><div className="flex items-center gap-2"><CircleHelp size={14} style={{ color: "var(--app-text-disabled)" }} aria-hidden /><p className="m-0 text-[12px] font-bold" style={{ color: "var(--app-text)" }}>{item.label}</p></div><p className="mb-0 mt-1 text-[11px]" style={{ color: "var(--app-text-disabled)" }}>Not available</p></div>)}</div>
            <p className="mb-0 mt-3 text-[11.5px]" style={{ color: "var(--app-text-muted)" }}>To review source-based financial insights, go to <Link href="/profit" className="font-bold" style={{ color: "var(--app-primary)" }}>Profit Overview</Link>.</p>
          </section>
        </>
      )}

      <FinancialAgentQuickReview month={month} branchId={branchId} />
    </main>
  );
}

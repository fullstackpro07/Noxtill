"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { AlertTriangle, Boxes, ClipboardCheck, ShieldAlert, ShoppingBag, Truck, type LucideIcon } from "lucide-react";
import { AUTONOMOUS_COMMERCE_SUMMARY_KEY, fetchAutonomousCommerceSummary, type CommerceOperations } from "@/lib/autonomous-commerce-api";
import { formatCurrency, formatDate } from "@/lib/format";

export function AutonomousCommerceCard() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: AUTONOMOUS_COMMERCE_SUMMARY_KEY,
    queryFn: fetchAutonomousCommerceSummary,
    staleTime: 60_000,
  });

  return (
    <section className="rounded-[14px] p-[18px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-bold" style={{ color: "var(--app-text)" }}>
            Autonomous Commerce
            {data?.operations.paused && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: "var(--app-danger-strong)" }}>Actions paused</span>
            )}
          </h2>
          <p className="mt-1 text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Live summary from canonical orders inventory delivery and supplier-claim records</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/autonomous-commerce/product-radar" className="text-[11px] font-bold" style={{ color: "var(--app-primary)" }}>Open Product Radar</Link>
          <Link href="/autonomous-commerce/product-validation" className="text-[11px] font-bold" style={{ color: "var(--app-primary)" }}>Validation queue</Link>
          <Link href="/autonomous-commerce/supplier-claims" className="text-[11px] font-bold" style={{ color: "var(--app-primary)" }}>Supplier Claims</Link>
          {data && <span className="text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>Captured {formatDate(data.capturedAt)}</span>}
        </div>
      </div>

      {isPending ? (
        <div className="mt-4 h-28 animate-pulse rounded-[12px]" style={{ background: "var(--app-surface-2)" }} />
      ) : isError || !data ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-[10px] p-3 text-[12px]" style={{ background: "var(--app-surface-2)", color: "var(--app-text-muted)" }}>
          <span>Commerce summary is unavailable right now</span>
          <button type="button" onClick={() => void refetch()} className="font-bold" style={{ color: "var(--app-primary)" }}>Retry</button>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
            <Metric icon={ShoppingBag} label="Recorded sales · 30 days" value={formatCurrency(data.sales.recordedOrderTotal, data.sales.currency)} detail={`${data.sales.completedOrders} completed orders`} />
            <Metric icon={ShoppingBag} label="Average order value" value={data.sales.averageOrderValue === null ? "—" : formatCurrency(data.sales.averageOrderValue, data.sales.currency)} detail={data.sales.averageOrderValue === null ? "No completed orders in this period" : "From completed orders"} />
            <Metric icon={Boxes} label="Low-stock products" value={String(data.inventory.lowStockProducts)} detail={`of ${data.inventory.activeProducts} active products`} tone={data.inventory.lowStockProducts > 0 ? "warning" : "default"} />
            <Metric icon={ClipboardCheck} label="Commerce items waiting" value={String(data.approvals.commerceItemsWaiting)} detail="In the Action Center" tone={data.approvals.commerceItemsWaiting > 0 ? "warning" : "default"} />
            <Metric icon={ClipboardCheck} label="Pending return approvals" value={String(data.approvals.pendingReturns)} detail={data.approvals.pendingRefundAmount > 0 ? `${formatCurrency(data.approvals.pendingRefundAmount, data.sales.currency)} awaiting review` : "No refund amount awaiting review"} tone={data.approvals.pendingReturns > 0 ? "warning" : "default"} />
            <Metric icon={Truck} label="On-time delivery" value={data.fulfillment.onTimeRate === null ? "—" : `${data.fulfillment.onTimeRate.toFixed(1)}%`} detail={data.fulfillment.status === "unavailable" ? "No delivered orders with a promise time" : `${data.fulfillment.onTimeOrders} of ${data.fulfillment.eligibleDeliveredOrders} eligible deliveries`} tone={data.fulfillment.status === "partial" ? "warning" : "default"} />
          </div>

          <div className="mt-3 rounded-[11px] border p-3" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
            <div className="mb-2 flex items-center justify-between gap-2"><h3 className="flex items-center gap-1.5 text-[11.5px] font-bold" style={{ color: "var(--app-text)" }}><ShieldAlert className="h-3.5 w-3.5" aria-hidden />Supplier recovery</h3><span className="text-[10px]" style={{ color: "var(--app-text-disabled)" }}>Recorded claims · not accounting postings</span></div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric icon={ShieldAlert} label="Open claims" value={String(data.supplierClaims.openClaims)} detail={`${data.supplierClaims.agingClaims} aging 30+ days`} tone={data.supplierClaims.openClaims > 0 ? "warning" : "default"} />
              <Metric icon={ClipboardCheck} label="Recoverable" value={formatCurrency(data.supplierClaims.recoverableValue, data.sales.currency)} detail="Less recorded settlements" tone={data.supplierClaims.recoverableValue > 0 ? "warning" : "default"} />
              <Metric icon={ShoppingBag} label="Recovered this month" value={formatCurrency(data.supplierClaims.recoveredThisMonth, data.sales.currency)} detail="Recorded settlement value" />
              <Link href="/autonomous-commerce/supplier-claims" className="flex min-h-[90px] items-center justify-center gap-1.5 rounded-[11px] p-3 text-center text-[11px] font-bold" style={{ background: "var(--app-success-bg)", color: "var(--app-success-text)" }}>Review supplier claims <ClipboardCheck className="h-3.5 w-3.5" aria-hidden /></Link>
            </div>
          </div>

          <div className="mt-3 rounded-[11px] border p-3" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-[11.5px] font-bold" style={{ color: "var(--app-text)" }}>Net sales &amp; contribution · 30 days</h3>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "var(--app-surface-2)", color: "var(--app-warning-text)" }}>Contribution incomplete</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric icon={ShoppingBag} label="Net sales" value={formatCurrency(data.profitability.netSales, data.profitability.currency)} detail={`${formatCurrency(data.profitability.refunds, data.profitability.currency)} refunded`} />
              <Metric icon={Boxes} label="Goods + delivery cost" value={formatCurrency(data.profitability.costOfGoods + data.profitability.deliveryCost, data.profitability.currency)} detail={`${formatCurrency(data.profitability.deliveryCost, data.profitability.currency)} delivery on ${data.profitability.deliveries} deliveries`} tone={data.profitability.linesWithoutCost > 0 ? "warning" : "default"} />
              <Metric icon={ClipboardCheck} label="Contribution (partial)" value={formatCurrency(data.profitability.contributionBeforeOtherCosts, data.profitability.currency)} detail={data.profitability.contributionMarginPct === null ? "No net sales" : `${data.profitability.contributionMarginPct}% of net sales`} />
              <Metric icon={AlertTriangle} label="Not included" value={String(data.profitability.missingComponents.length)} detail="Cost types not recorded" tone="warning" />
            </div>
            <p className="mt-2 text-[10.5px]" style={{ color: "var(--app-text-faint)" }}>Not included: {data.profitability.missingComponents.join(" · ")}</p>
          </div>

          <WorkQueues ops={data.operations} />

          {data.fulfillment.missingPromiseTime > 0 && (
            <p className="mt-3 flex items-start gap-1.5 text-[10.5px]" style={{ color: "var(--app-text-faint)" }}>
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              {data.fulfillment.missingPromiseTime} delivered order(s) had no stored promise time and are excluded from the rate
            </p>
          )}

          <details className="mt-3 border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
            <summary className="cursor-pointer text-[11.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>Data coverage and definitions</summary>
            <p className="mt-2 text-[10.5px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>{data.sales.definition}</p>
            <p className="mt-1 text-[10.5px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>{data.fulfillment.definition}</p>
            <p className="mt-1 text-[10.5px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>{data.supplierClaims.definition}</p>
            <p className="mt-1 text-[10.5px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>{data.profitability.definition}</p>
            <ul className="mt-2 list-disc space-y-1 ps-4 text-[10.5px]" style={{ color: "var(--app-text-faint)" }}>
              {data.unavailableMetrics.map((metric) => (
                <li key={metric.key}><span className="font-semibold">{metric.key.replaceAll("_", " ")}:</span> {metric.reason}</li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "warning";
}) {
  return (
    <div className="min-w-0 rounded-[11px] p-3" style={{ background: "var(--app-surface-2)" }}>
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold" style={{ color: "var(--app-text-faint)" }}>
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-2 truncate text-[19px] font-extrabold tabular-nums" style={{ color: tone === "warning" ? "var(--app-warning-text)" : "var(--app-text)" }}>{value}</div>
      <div className="mt-1 truncate text-[10px]" style={{ color: "var(--app-text-disabled)" }}>{detail}</div>
    </div>
  );
}

/** Open work on each Commerce screen, linking straight to where it is handled. */
function WorkQueues({ ops }: { ops: CommerceOperations }) {
  const rows: { label: string; value: number; detail: string; href: string; warn?: boolean }[] = [
    { label: "Open RFQs", value: ops.sourcing.openRfqs, detail: "Waiting on supplier quotes", href: "/autonomous-commerce/rfqs" },
    { label: "Listings to approve", value: ops.listings.listingsAwaitingApproval, detail: `${ops.listings.approvedDrafts} approved drafts`, href: "/autonomous-commerce/listing-builder", warn: ops.listings.listingsAwaitingApproval > 0 },
    { label: "Open work orders", value: ops.production.openWorkOrders, detail: `${ops.production.qualityHolds} on quality hold`, href: "/autonomous-commerce/production", warn: ops.production.qualityHolds > 0 },
    { label: "Open risk cases", value: ops.risk.openRiskCases, detail: `${ops.risk.highRiskCases} high severity`, href: "/autonomous-commerce/risk-compliance", warn: ops.risk.highRiskCases > 0 },
    { label: "Active B2B accounts", value: ops.b2b.activeB2bAccounts, detail: "Wholesale customers", href: "/autonomous-commerce/b2b" },
    { label: "Renewals due", value: ops.subscriptions.dueRenewals, detail: `${ops.subscriptions.activeSubscriptions} active · ${ops.subscriptions.reservedPreorders} pre-orders reserved`, href: "/autonomous-commerce/subscriptions-preorders", warn: ops.subscriptions.dueRenewals > 0 },
    { label: "Store fixes open", value: ops.growth.openStoreOpportunities, detail: `${ops.growth.highImpactStoreOpportunities} high impact`, href: "/autonomous-commerce/store-optimizer", warn: ops.growth.highImpactStoreOpportunities > 0 },
    { label: "Experiments running", value: ops.growth.runningExperiments, detail: `${ops.growth.experimentsAwaitingDecision} awaiting a decision`, href: "/autonomous-commerce/experiment-lab", warn: ops.growth.experimentsAwaitingDecision > 0 },
  ];
  return (
    <div className="mt-3 rounded-[11px] border p-3" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[11.5px] font-bold" style={{ color: "var(--app-text)" }}>Work queues</h3>
        <span className="text-[10px]" style={{ color: "var(--app-text-disabled)" }}>Live counts · click to open</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {rows.map((row) => (
          <Link key={row.label} href={row.href} className="min-w-0 rounded-[11px] p-3" style={{ background: "var(--app-surface-2)" }}>
            <div className="truncate text-[10.5px] font-semibold" style={{ color: "var(--app-text-faint)" }}>{row.label}</div>
            <div className="mt-1.5 text-[19px] font-extrabold tabular-nums" style={{ color: row.warn ? "var(--app-warning-text)" : "var(--app-text)" }}>{row.value}</div>
            <div className="mt-1 truncate text-[10px]" style={{ color: "var(--app-text-disabled)" }}>{row.detail}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

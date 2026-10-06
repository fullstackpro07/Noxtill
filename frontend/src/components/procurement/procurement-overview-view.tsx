"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, CircleHelp, RefreshCw } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import {
  fetchProcurementOverview,
  type ProcurementMetric,
} from "@/lib/procurement-api";
import { useSession } from "@/lib/session";
import { useModuleHeader } from "@/components/layout/module-header-context";

function displayMetric(metric: ProcurementMetric): string {
  if (metric.value === null) {
    if (metric.availability === "not_tracked") return "Not tracked";
    if (metric.availability === "not_available") return "Not available";
    return "No data";
  }
  return String(metric.value);
}

export function ProcurementOverviewView() {
  const session = useSession();
  const query = useQuery({
    queryKey: ["procurement", "overview"],
    queryFn: fetchProcurementOverview,
    staleTime: 30_000,
  });
  const currency = query.data?.currency ?? session.business.currency;

  useModuleHeader({
    title: "Procurement",
    subtitle: "Demand, supplier commitments and receiving status",
    actions: (
      <button
        type="button"
        aria-label="Refresh procurement overview"
        onClick={() => void query.refetch()}
        disabled={query.isFetching}
        className="rounded-lg border border-[var(--app-border)] p-2 text-[var(--app-text)] hover:bg-[var(--app-surface-muted)] disabled:opacity-50"
      >
        <RefreshCw
          className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`}
          aria-hidden
        />
      </button>
    ),
  });

  const metricCards = query.data
    ? [
        {
          label: "Open requests",
          metric: query.data.metrics.openRequests,
          format: "count",
        },
        {
          label: "Pending approval value",
          metric: query.data.metrics.pendingApprovalValue,
          format: "money",
        },
        {
          label: "Open RFQs",
          metric: query.data.metrics.openRfqs,
          format: "count",
        },
        {
          label: "Committed PO value",
          metric: query.data.metrics.committedPoValue,
          format: "money",
        },
        {
          label: "Receipts pending",
          metric: query.data.metrics.receiptsPending,
          format: "count",
        },
        {
          label: "3-way match exceptions",
          metric: query.data.metrics.matchExceptions,
          format: "count",
        },
        {
          label: "Spend vs budget",
          metric: query.data.metrics.spendVsBudget,
          format: "money",
        },
        {
          label: "Top supplier share",
          metric: query.data.metrics.supplierConcentration,
          format: "percent",
        },
      ]
    : [];

  function formatCardMetric(metric: ProcurementMetric, format: string) {
    if (metric.value === null) return displayMetric(metric);
    if (format === "money") return formatCurrency(metric.value, currency);
    if (format === "percent") return `${metric.value.toFixed(1)}%`;
    return new Intl.NumberFormat().format(metric.value);
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-5 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--app-primary)]">
            Procurement
          </p>
          <h1 className="mt-2 text-2xl font-bold text-[var(--app-text)] md:text-3xl">
            Procurement overview
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--app-text-muted)]">
            A view of recorded purchase-order commitments and receiving. Requests,
            budgets, generic sourcing RFQs and invoice matching are shown only when
            this system has a source for them.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/procurement/requests"
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--app-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Purchase requests <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link
            href="/inventory/purchases"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--app-border)] px-4 py-2 text-sm font-semibold text-[var(--app-text)] hover:bg-[var(--app-surface-muted)]"
          >
            Purchase orders <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </header>

      {query.isPending ? (
        <section
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          aria-label="Loading procurement metrics"
        >
          {Array.from({ length: 8 }, (_, index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-xl bg-[var(--app-surface-muted)]"
            />
          ))}
        </section>
      ) : query.isError ? (
        <section
          role="alert"
          className="rounded-xl border border-[var(--app-danger-border)] bg-[var(--app-danger-bg)] p-5 text-sm text-[var(--app-danger)]"
        >
          Could not load Procurement overview. {query.error.message}
        </section>
      ) : query.data ? (
        <>
          <section
            aria-label="Procurement metrics"
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          >
            {metricCards.map(({ label, metric, format }) => (
              <article
                key={label}
                title={metric.detail}
                className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 shadow-sm"
              >
                <p className="text-sm text-[var(--app-text-muted)]">{label}</p>
                <p className="mt-3 text-2xl font-semibold tabular-nums text-[var(--app-text)]">
                  {formatCardMetric(metric, format)}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-[var(--app-text-faint)]">
                  {metric.detail}
                </p>
              </article>
            ))}
          </section>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]">
              <div className="flex items-center justify-between border-b border-[var(--app-border)] p-5">
                <div>
                  <h2 className="font-semibold text-[var(--app-text)]">
                    Supplier commitments
                  </h2>
                  <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                    Open purchase orders only · {currency}
                  </p>
                </div>
                <Link
                  href="/products/suppliers"
                  className="text-sm font-medium text-[var(--app-primary)] hover:underline"
                >
                  Suppliers
                </Link>
              </div>
              {query.data.supplierCommitments.length === 0 ? (
                <p className="p-5 text-sm text-[var(--app-text-muted)]">
                  No open purchase-order commitments are recorded.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--app-border)]">
                  {query.data.supplierCommitments.map((item) => (
                    <li
                      key={item.supplierId}
                      className="flex items-center justify-between gap-4 px-5 py-3"
                    >
                      <span className="truncate text-sm font-medium text-[var(--app-text)]">
                        {item.supplierName}
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-[var(--app-text)]">
                        {formatCurrency(item.committedValue, currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]">
              <div className="flex items-center justify-between border-b border-[var(--app-border)] p-5">
                <div>
                  <h2 className="font-semibold text-[var(--app-text)]">
                    Commitment by product category
                  </h2>
                  <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                    Category comes from the linked product record
                  </p>
                </div>
                <Link
                  href="/inventory/purchases"
                  className="text-sm font-medium text-[var(--app-primary)] hover:underline"
                >
                  Purchases
                </Link>
              </div>
              {query.data.topCategories.length === 0 ? (
                <p className="p-5 text-sm text-[var(--app-text-muted)]">
                  No open purchase-order line items are recorded.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--app-border)]">
                  {query.data.topCategories.map((item) => (
                    <li
                      key={item.category}
                      className="flex items-center justify-between gap-4 px-5 py-3"
                    >
                      <span className="truncate text-sm font-medium text-[var(--app-text)]">
                        {item.category}
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-[var(--app-text)]">
                        {formatCurrency(item.committedValue, currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]">
            <div className="border-b border-[var(--app-border)] p-5">
              <h2 className="font-semibold text-[var(--app-text)]">
                Recent purchase orders
              </h2>
              <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                These are the canonical records maintained in Inventory → Purchases.
              </p>
            </div>
            {query.data.recentPurchaseOrders.length === 0 ? (
              <div className="flex items-start gap-3 p-5 text-sm text-[var(--app-text-muted)]">
                <CircleHelp className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                No purchase orders are recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="bg-[var(--app-surface-muted)] text-xs uppercase text-[var(--app-text-muted)]">
                    <tr>
                      <th className="px-5 py-3 font-medium">Reference</th>
                      <th className="px-5 py-3 font-medium">Supplier</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--app-border)]">
                    {query.data.recentPurchaseOrders.map((order) => (
                      <tr key={order.id}>
                        <td className="px-5 py-3 font-medium text-[var(--app-text)]">
                          {order.reference}
                        </td>
                        <td className="px-5 py-3 text-[var(--app-text)]">
                          {order.supplier}
                        </td>
                        <td className="px-5 py-3 capitalize text-[var(--app-text-muted)]">
                          {order.status.replaceAll("_", " ")}
                        </td>
                        <td className="px-5 py-3 text-[var(--app-text-muted)]">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <aside className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-4 text-xs leading-5 text-[var(--app-text-muted)]">
            Procurement currently reads supplier, product and purchase-order records only. Generic
            RFQs, budget tracking, request approval values and 3-way invoice matching are not
            tracked here. Commerce RFQs remain in Autonomous Commerce. This overview does not
            create or alter supplier, purchase-order, inventory or payment records.
          </aside>
        </>
      ) : null}
    </main>
  );
}

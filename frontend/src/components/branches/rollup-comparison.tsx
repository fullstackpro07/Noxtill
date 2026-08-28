"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchRollupDashboard } from "@/lib/branches-api";
import { formatCurrency } from "@/lib/format";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonCard } from "@/components/shared/skeleton";

const BRANCH_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <span className="text-xs font-medium text-fg-faint">{label}</span>
      <p className="mt-1 font-display text-xl font-bold text-fg">{value}</p>
    </div>
  );
}

export function RollupComparison({ currency }: { currency: string }) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["rollup-dashboard"],
    queryFn: () => fetchRollupDashboard(),
  });

  if (isError) {
    return <ErrorBanner title="Couldn't load branch data" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  if (isPending) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  const { totals, branches } = data;
  const totalAvgTicket = totals.ordersCount > 0 ? totals.revenue / totals.ordersCount : 0;
  const maxRevenue = Math.max(...branches.map((b) => b.revenue), 1);
  const reviewAvgs = branches.map((b) => b.reviewAvg).filter((r): r is number => r != null);
  const combinedReviewAvg = reviewAvgs.length ? reviewAvgs.reduce((s, r) => s + r, 0) / reviewAvgs.length : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Combined sales" value={formatCurrency(totals.revenue, currency)} />
        <StatCard label="Combined profit" value={formatCurrency(totals.grossProfit, currency)} />
        <StatCard label="Total customers" value={String(totals.customerCount)} />
        <StatCard label="Average rating" value={combinedReviewAvg != null ? `${combinedReviewAvg.toFixed(1)} ★` : "—"} />
        <StatCard label="Credit outstanding" value={formatCurrency(totals.creditOutstanding, currency)} />
      </div>

      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <p className="mb-4 text-sm font-medium text-fg">Revenue by branch</p>
        <div className="flex flex-col gap-3">
          {branches.map((b, i) => (
            <div key={b.businessId} className="flex items-center gap-3">
              <span className="w-28 shrink-0 truncate text-sm text-fg-muted">{b.name}</span>
              <div className="h-6 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="flex h-full items-center rounded-full px-2 text-xs font-medium text-white"
                  style={{ width: `${(b.revenue / maxRevenue) * 100}%`, backgroundColor: BRANCH_COLORS[i % BRANCH_COLORS.length] }}
                >
                  {formatCurrency(b.revenue, currency)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
              <th className="px-4 py-3 text-start">Branch</th>
              <th className="px-4 py-3 text-start">Revenue</th>
              <th className="px-4 py-3 text-start">Orders</th>
              <th className="px-4 py-3 text-start">Avg ticket</th>
              <th className="px-4 py-3 text-start">Customers</th>
              <th className="px-4 py-3 text-start">Credit outstanding</th>
              <th className="px-4 py-3 text-start">Review avg</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b.businessId} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                <td className="px-4 py-3 font-medium text-fg">{b.name}</td>
                <td className="px-4 py-3 text-fg-muted">{formatCurrency(b.revenue, currency)}</td>
                <td className="px-4 py-3 text-fg-muted">{b.ordersCount}</td>
                <td className="px-4 py-3 text-fg-muted">{formatCurrency(b.avgTicket, currency)}</td>
                <td className="px-4 py-3 text-fg-muted">{b.customerCount}</td>
                <td className="px-4 py-3 text-fg-muted">{formatCurrency(b.creditOutstanding, currency)}</td>
                <td className="px-4 py-3 text-fg-muted">{b.reviewAvg != null ? `${b.reviewAvg.toFixed(1)} ★` : "—"}</td>
              </tr>
            ))}
            <tr className="bg-surface-2/50">
              <td className="px-4 py-3 font-semibold text-fg">All branches</td>
              <td className="px-4 py-3 font-semibold text-fg">{formatCurrency(totals.revenue, currency)}</td>
              <td className="px-4 py-3 font-semibold text-fg">{totals.ordersCount}</td>
              <td className="px-4 py-3 font-semibold text-fg">{formatCurrency(totalAvgTicket, currency)}</td>
              <td className="px-4 py-3 font-semibold text-fg">{totals.customerCount}</td>
              <td className="px-4 py-3 font-semibold text-fg">{formatCurrency(totals.creditOutstanding, currency)}</td>
              <td className="px-4 py-3 font-semibold text-fg">—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

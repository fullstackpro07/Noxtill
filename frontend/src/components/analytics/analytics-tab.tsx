"use client";

import { useQuery } from "@tanstack/react-query";
import { KpiCard } from "./kpi-card";
import { RevenueLineChart } from "./revenue-line-chart";
import { CohortGrid } from "./cohort-grid";
import { StaffLeaderboard } from "./staff-leaderboard";
import { ChannelStats } from "./channel-stats";
import { fetchKpis, fetchRevenueSeries, fetchAnalyticsCampaigns } from "@/lib/analytics-api";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonCard } from "@/components/shared/skeleton";
import { formatCurrency } from "@/lib/format";

export function AnalyticsTab({ currency }: { currency: string }) {
  const { data: kpis, isPending: kpisPending, isError: kpisError, refetch: refetchKpis } = useQuery({
    queryKey: ["analytics-kpis"],
    queryFn: fetchKpis,
  });
  const { data: revenueSeries = [] } = useQuery({
    queryKey: ["analytics-revenue-series"],
    queryFn: () => fetchRevenueSeries(),
  });
  const { data: campaigns = [] } = useQuery({
    queryKey: ["analytics-campaigns"],
    queryFn: fetchAnalyticsCampaigns,
  });

  const kpiCards = kpis
    ? [
        { key: "revenue", label: "Revenue (30d)", value: formatCurrency(kpis.revenueThisMonth, currency), href: "/profit" },
        { key: "orders", label: "Orders (30d)", value: String(kpis.ordersThisMonth), href: "/orders" },
        { key: "customers", label: "New customers", value: String(kpis.newCustomersThisMonth), href: "/customers" },
        { key: "rating", label: "Average rating", value: kpis.reviewsAverage != null ? kpis.reviewsAverage.toFixed(1) : "—", href: "/reviews" },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      {kpisError ? (
        <ErrorBanner title="Couldn't load KPIs" description="Check your connection and try again." onRetry={() => refetchKpis()} />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpisPending
            ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
            : kpiCards.map((kpi) => <KpiCard key={kpi.key} kpi={kpi} />)}
        </div>
      )}

      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
        <p className="mb-3 text-sm font-medium text-fg">Revenue, last 30 days</p>
        {revenueSeries.length > 0 ? (
          <RevenueLineChart data={revenueSeries.map((d) => d.revenue)} currency={currency} />
        ) : (
          <p className="py-8 text-center text-sm text-fg-faint">No revenue data yet.</p>
        )}
      </div>

      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
        <p className="mb-3 text-sm font-medium text-fg">Customer retention by cohort</p>
        <CohortGrid />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StaffLeaderboard currency={currency} />
        <ChannelStats />
      </div>

      <div>
        <p className="mb-3 text-sm font-medium text-fg">Recent campaigns</p>
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                <th className="px-4 py-3 text-start">Audience</th>
                <th className="px-4 py-3 text-start">Sent</th>
                <th className="px-4 py-3 text-start">Delivered</th>
                <th className="px-4 py-3 text-start">Read</th>
                <th className="px-4 py-3 text-start">Failed</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-fg-faint">
                    No campaigns sent yet.
                  </td>
                </tr>
              ) : (
                campaigns.map((c) => (
                  <tr key={c.campaignId} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                    <td className="px-4 py-3 font-medium text-fg">{c.segment}</td>
                    <td className="px-4 py-3 text-fg-muted">{c.sent}</td>
                    <td className="px-4 py-3 text-fg-muted">{c.delivered}</td>
                    <td className="px-4 py-3 text-fg-muted">{c.read}</td>
                    <td className="px-4 py-3 text-fg-muted">{c.failed}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

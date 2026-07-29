"use client";

import { KpiCard } from "./kpi-card";
import { RevenueLineChart } from "./revenue-line-chart";
import { CohortGrid } from "./cohort-grid";
import { StaffLeaderboard } from "./staff-leaderboard";
import { ChannelStats } from "./channel-stats";
import { KPI_CARDS, REVENUE_SERIES } from "@/lib/analytics";
import { CAMPAIGNS } from "@/lib/campaigns";
import { formatDate } from "@/lib/format";

export function AnalyticsTab({ currency }: { currency: string }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {KPI_CARDS.map((kpi) => (
          <KpiCard key={kpi.key} kpi={kpi} />
        ))}
      </div>

      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
        <p className="mb-3 text-sm font-medium text-fg">Revenue, last 30 days</p>
        <RevenueLineChart data={REVENUE_SERIES} currency={currency} />
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
                <th className="px-4 py-3 text-start">Campaign</th>
                <th className="px-4 py-3 text-start">Sent</th>
                <th className="px-4 py-3 text-start">Replied</th>
                <th className="px-4 py-3 text-start">Date</th>
              </tr>
            </thead>
            <tbody>
              {CAMPAIGNS.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                  <td className="px-4 py-3 font-medium text-fg">{c.name}</td>
                  <td className="px-4 py-3 text-fg-muted">{c.sentCount}</td>
                  <td className="px-4 py-3 text-fg-muted">{c.repliedCount}</td>
                  <td className="px-4 py-3 text-fg-muted">{formatDate(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

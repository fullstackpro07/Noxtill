"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, UserX, MessageSquareQuote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonCard, SkeletonRow } from "@/components/shared/skeleton";
import { fetchStaffAnalytics, type StaffAnalyticsRow } from "@/lib/analytics-api";
import { formatCurrency } from "@/lib/format";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <span className="text-xs font-medium text-fg-faint">{label}</span>
      <p className="mt-1 font-display text-xl font-bold text-fg">{value}</p>
    </div>
  );
}

export function StaffAnalyticsView({ currency }: { currency: string }) {
  const [selected, setSelected] = useState<StaffAnalyticsRow | null>(null);
  const { data: rows = [], isPending, isError, refetch } = useQuery({
    queryKey: ["analytics-staff"],
    queryFn: fetchStaffAnalytics,
  });

  if (isError) {
    return <ErrorBanner title="Couldn't load staff analytics" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  const topPerformer = rows.length ? rows.reduce((top, r) => (r.totalSales > top.totalSales ? r : top)) : null;
  const totalSales = rows.reduce((sum, r) => sum + r.totalSales, 0);
  const avgTicket = rows.length ? rows.reduce((sum, r) => sum + r.avgTicketSize, 0) / rows.length : 0;
  const totalNoShows = rows.reduce((sum, r) => sum + r.noShowCount, 0);
  const maxSales = Math.max(1, ...rows.map((r) => r.totalSales));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {isPending ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard label="Top performer" value={topPerformer ? topPerformer.name : "—"} />
            <StatCard label="Total sales this month" value={formatCurrency(totalSales, currency)} />
            <StatCard label="Avg ticket size" value={formatCurrency(avgTicket, currency)} />
            <StatCard label="No-shows" value={String(totalNoShows)} />
          </>
        )}
      </div>

      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <p className="mb-4 text-sm font-medium text-fg">Sales per staff member — this month</p>
        {isPending ? (
          <div className="flex flex-col gap-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Trophy} title="No completed sales yet" description="Once staff make sales this month, they'll show up here." />
        ) : (
          <div className="flex flex-col gap-2.5">
            {[...rows]
              .sort((a, b) => b.totalSales - a.totalSales)
              .map((r) => (
                <div key={r.staffUserId} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-sm text-fg">{r.name}</span>
                  <div className="h-6 flex-1 overflow-hidden rounded-[4px] bg-surface-2">
                    <div className="h-full rounded-[4px] bg-chart-1" style={{ width: `${(r.totalSales / maxSales) * 100}%` }} />
                  </div>
                  <span className="w-20 shrink-0 text-end text-xs tabular-nums text-fg-muted">{formatCurrency(r.totalSales, currency)}</span>
                </div>
              ))}
          </div>
        )}
      </div>

      {!isPending && rows.length > 0 && (
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                <th className="px-4 py-3 text-start">Staff</th>
                <th className="px-4 py-3 text-start">Sales</th>
                <th className="px-4 py-3 text-start">Orders</th>
                <th className="px-4 py-3 text-start">Avg ticket</th>
                <th className="px-4 py-3 text-start">No-shows</th>
                <th className="px-4 py-3 text-start">Review mentions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.staffUserId}
                  onClick={() => setSelected(r)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2/50"
                >
                  <td className="px-4 py-3 font-medium text-fg">{r.name}</td>
                  <td className="px-4 py-3 text-fg-muted">{formatCurrency(r.totalSales, currency)}</td>
                  <td className="px-4 py-3 text-fg-muted">{r.orders}</td>
                  <td className="px-4 py-3 text-fg-muted">{formatCurrency(r.avgTicketSize, currency)}</td>
                  <td className="px-4 py-3">
                    {r.noShowCount > 0 ? (
                      <Badge tone="danger">
                        <UserX className="h-3 w-3" aria-hidden />
                        {r.noShowCount}
                      </Badge>
                    ) : (
                      <span className="text-fg-muted">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{r.reviewMentionCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Dialog open onClose={() => setSelected(null)} title={selected.name}>
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between">
              <span className="text-fg-muted">Total sales</span>
              <span className="font-medium text-fg">{formatCurrency(selected.totalSales, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-muted">Orders</span>
              <span className="font-medium text-fg">{selected.orders}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-muted">Avg ticket size</span>
              <span className="font-medium text-fg">{formatCurrency(selected.avgTicketSize, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-muted">No-shows this month</span>
              <span className="font-medium text-fg">{selected.noShowCount}</span>
            </div>
            <div className="flex items-start justify-between gap-3 border-t border-border pt-3">
              <span className="flex items-center gap-1.5 text-fg-muted">
                <MessageSquareQuote className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Review mentions
              </span>
              <div className="text-end">
                <span className="font-medium text-fg">{selected.reviewMentionCount}</span>
                <p className="mt-0.5 max-w-40 text-xs text-fg-faint">Approximate — name mentioned in review text, not a tagged review.</p>
              </div>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

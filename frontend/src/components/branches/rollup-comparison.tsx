"use client";

import { BRANCH_METRICS, totalAcrossBranches } from "@/lib/branches";
import { formatCurrency } from "@/lib/format";

const BRANCH_COLORS = ["var(--chart-1)", "var(--chart-2)"];

export function RollupComparison({ currency }: { currency: string }) {
  const total = totalAcrossBranches(BRANCH_METRICS);
  const maxRevenue = Math.max(...BRANCH_METRICS.map((b) => b.revenue));

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <p className="mb-4 text-sm font-medium text-fg">Revenue by branch</p>
        <div className="flex flex-col gap-3">
          {BRANCH_METRICS.map((b, i) => (
            <div key={b.branchId} className="flex items-center gap-3">
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
              <th className="px-4 py-3 text-start">Review avg</th>
            </tr>
          </thead>
          <tbody>
            {BRANCH_METRICS.map((b) => (
              <tr key={b.branchId} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                <td className="px-4 py-3 font-medium text-fg">{b.name}</td>
                <td className="px-4 py-3 text-fg-muted">{formatCurrency(b.revenue, currency)}</td>
                <td className="px-4 py-3 text-fg-muted">{b.orders}</td>
                <td className="px-4 py-3 text-fg-muted">{formatCurrency(b.avgTicket, currency)}</td>
                <td className="px-4 py-3 text-fg-muted">{b.reviewAvg.toFixed(1)} ★</td>
              </tr>
            ))}
            <tr className="bg-surface-2/50">
              <td className="px-4 py-3 font-semibold text-fg">All branches</td>
              <td className="px-4 py-3 font-semibold text-fg">{formatCurrency(total.revenue, currency)}</td>
              <td className="px-4 py-3 font-semibold text-fg">{total.orders}</td>
              <td className="px-4 py-3 font-semibold text-fg">{formatCurrency(total.avgTicket, currency)}</td>
              <td className="px-4 py-3 font-semibold text-fg">{total.reviewAvg.toFixed(1)} ★</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

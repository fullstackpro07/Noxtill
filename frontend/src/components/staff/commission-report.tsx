"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Select } from "@/components/ui/select";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { fetchCommissions } from "@/lib/staff-api";
import { formatCurrency } from "@/lib/format";

function recentMonths(count = 6): { value: string; label: string }[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
    return { value, label };
  });
}

export function CommissionReport({ currency }: { currency: string }) {
  const months = useMemo(() => recentMonths(), []);
  const [month, setMonth] = useState(months[0].value);

  const { data: entries = [], isPending, isError, refetch } = useQuery({
    queryKey: ["commissions", month],
    queryFn: () => fetchCommissions(month),
  });

  const totalEarned = entries.reduce((sum, e) => sum + e.commission, 0);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Select value={month} onChange={(e) => setMonth(e.target.value)} className="w-40">
          {months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
        <p className="text-sm font-medium text-fg">Total: {formatCurrency(totalEarned, currency)}</p>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load commissions" description="Check your connection and try again." onRetry={() => refetch()} />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                <th className="px-4 py-3 text-start">Staff</th>
                <th className="px-4 py-3 text-start">Sales</th>
                <th className="px-4 py-3 text-start">Earned</th>
              </tr>
            </thead>
            <tbody>
              {isPending ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td colSpan={3} className="px-4 py-3">
                      <SkeletonRow />
                    </td>
                  </tr>
                ))
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-sm text-fg-faint">
                    No staff earn commission yet.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.businessUserId} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                    <td className="px-4 py-3 font-medium text-fg">{entry.name}</td>
                    <td className="px-4 py-3 text-fg-muted">{formatCurrency(entry.totalSales, currency)}</td>
                    <td className="px-4 py-3 font-medium text-fg">{formatCurrency(entry.commission, currency)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { fetchCohorts, fetchCohortCustomers } from "@/lib/analytics-api";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { Skeleton } from "@/components/shared/skeleton";
import { formatCurrency, formatDate } from "@/lib/format";

const MONTH_LABELS = ["Month 0", "Month 1", "Month 2", "Month 3", "Month 4", "Month 5"];

/** Same retention-grid visual as Marketing's CohortGrid, plus a click-through to the real customers behind each cohort month (UPD-FE-098). */
export function CohortRetentionTable({ currency }: { currency: string }) {
  const [drillDown, setDrillDown] = useState<string | null>(null);

  const { data: cohorts = [], isPending, isError, refetch } = useQuery({
    queryKey: ["analytics-cohorts"],
    queryFn: fetchCohorts,
  });

  if (isError) {
    return <ErrorBanner title="Couldn't load cohorts" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  if (isPending) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs font-medium uppercase tracking-wide text-fg-faint">
              <th className="px-2 py-2 text-start">Cohort</th>
              {MONTH_LABELS.map((label) => (
                <th key={label} className="px-2 py-2 text-center">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((row) => (
              <tr key={row.cohortMonth}>
                <td className="px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => row.size > 0 && setDrillDown(row.cohortMonth)}
                    disabled={row.size === 0}
                    className="text-start text-fg-muted underline-offset-2 hover:text-primary hover:underline disabled:no-underline disabled:hover:text-fg-muted"
                  >
                    {row.cohortMonth} <span className="text-xs text-fg-faint">({row.size})</span>
                  </button>
                </td>
                {row.retention.map((value, i) => (
                  <td key={i} className="px-2 py-1.5">
                    {value > 0 ? (
                      <div
                        className="mx-auto flex h-9 w-full max-w-16 items-center justify-center rounded-[6px] text-xs font-medium text-fg"
                        style={{ backgroundColor: `color-mix(in srgb, var(--chart-1) ${value}%, var(--surface-2))` }}
                      >
                        {value}%
                      </div>
                    ) : (
                      <div className="mx-auto h-9 w-full max-w-16 rounded-[6px] bg-surface-2/40" />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {drillDown && <CohortDrillDownDialog cohortMonth={drillDown} currency={currency} onClose={() => setDrillDown(null)} />}
    </>
  );
}

function CohortDrillDownDialog({ cohortMonth, currency, onClose }: { cohortMonth: string; currency: string; onClose: () => void }) {
  const { data: customers = [], isPending } = useQuery({
    queryKey: ["cohort-customers", cohortMonth],
    queryFn: () => fetchCohortCustomers(cohortMonth),
  });

  return (
    <Dialog open onClose={onClose} title={`Cohort ${cohortMonth}`} description="Customers who first signed up this month, by lifetime spend." className="max-w-lg">
      {isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : customers.length === 0 ? (
        <EmptyState icon={Users} title="No customers found" />
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-fg-faint">
                <th className="py-2 text-start">Name</th>
                <th className="py-2 text-start">Visits</th>
                <th className="py-2 text-start">LTV</th>
                <th className="py-2 text-start">Last visit</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="py-2 font-medium text-fg">{c.name}</td>
                  <td className="py-2 text-fg-muted">{c.visitCount}</td>
                  <td className="py-2 text-fg-muted">{formatCurrency(Number(c.lifetimeSpend), currency)}</td>
                  <td className="py-2 text-fg-muted">{c.lastVisitAt ? formatDate(c.lastVisitAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}

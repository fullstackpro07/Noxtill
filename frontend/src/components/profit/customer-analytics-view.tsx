"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, MessageCircleWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonCard, Skeleton } from "@/components/shared/skeleton";
import { CohortRetentionTable } from "./cohort-retention-table";
import { MessageAtRiskDialog } from "./message-at-risk-dialog";
import { fetchCustomerSummary } from "@/lib/analytics-api";
import { formatCurrency, formatPercent } from "@/lib/format";

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <span className="text-xs font-medium text-fg-faint">{label}</span>
      <p className={`mt-1 font-display text-xl font-bold ${tone === "danger" ? "text-destructive" : "text-fg"}`}>{value}</p>
    </div>
  );
}

export function CustomerAnalyticsView({ currency }: { currency: string }) {
  const [messageOpen, setMessageOpen] = useState(false);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["analytics-customer-summary"],
    queryFn: fetchCustomerSummary,
  });

  if (isError) {
    return <ErrorBanner title="Couldn't load customer analytics" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  const maxBucket = data ? Math.max(1, ...data.ltvDistribution.map((b) => b.count)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {isPending || !data ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard label="Total customers" value={String(data.totalCustomers)} />
            <StatCard label="New this window" value={String(data.newCount)} />
            <StatCard label="Returning" value={String(data.returningCount)} />
            <StatCard label="Retention rate" value={formatPercent(data.retentionRate)} />
            <StatCard label="Avg LTV" value={formatCurrency(data.avgLTV, currency)} />
            <StatCard label="At-risk" value={String(data.atRiskCount)} tone={data.atRiskCount > 0 ? "danger" : undefined} />
          </>
        )}
      </div>

      {!isPending && data && data.atRiskCount > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-noxtill)] border border-destructive/25 bg-destructive/6 p-4">
          <div className="flex items-center gap-2.5">
            <MessageCircleWarning className="h-5 w-5 shrink-0 text-destructive" aria-hidden />
            <p className="text-sm text-fg">
              <span className="font-medium">{data.atRiskCount}</span> customer{data.atRiskCount === 1 ? " is" : "s are"} at risk of lapsing.
            </p>
          </div>
          <Button size="sm" variant="destructive" onClick={() => setMessageOpen(true)}>
            Message them
          </Button>
        </div>
      )}

      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <p className="mb-4 text-sm font-medium text-fg">Lifetime value distribution</p>
        {isPending || !data ? (
          <Skeleton className="h-32 w-full" />
        ) : data.ltvDistribution.length === 0 ? (
          <p className="text-sm text-fg-muted">Not enough customer data yet.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {data.ltvDistribution.map((bucket) => (
              <div key={bucket.label} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-xs text-fg-faint">{bucket.label}</span>
                <div className="h-6 flex-1 overflow-hidden rounded-[4px] bg-surface-2">
                  <div
                    className="h-full rounded-[4px] bg-chart-1"
                    style={{ width: `${(bucket.count / maxBucket) * 100}%` }}
                  />
                </div>
                <span className="w-28 shrink-0 text-end text-xs tabular-nums text-fg-muted">
                  {bucket.count} · {formatCurrency(bucket.minLtv, currency)}–{formatCurrency(bucket.maxLtv, currency)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <div className="mb-4 flex items-center gap-2">
          <Users className="h-4 w-4 text-fg-faint" aria-hidden />
          <p className="text-sm font-medium text-fg">Cohort retention</p>
        </div>
        <CohortRetentionTable currency={currency} />
      </div>

      {messageOpen && data && <MessageAtRiskDialog atRiskCount={data.atRiskCount} onClose={() => setMessageOpen(false)} />}
    </div>
  );
}

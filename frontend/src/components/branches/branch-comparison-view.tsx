"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchRollupCompare, type RollupCompareBranch } from "@/lib/branches-api";
import { formatCurrency } from "@/lib/format";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonCard, Skeleton } from "@/components/shared/skeleton";
import { cn } from "@/lib/utils";

const BRANCH_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

type Metric = "revenue" | "ordersCount" | "grossProfit";
const METRICS: { key: Metric; label: string }[] = [
  { key: "revenue", label: "Revenue" },
  { key: "ordersCount", label: "Orders" },
  { key: "grossProfit", label: "Gross profit" },
];

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <span className="text-xs font-medium text-fg-faint">{label}</span>
      <p className="mt-1 font-display text-xl font-bold text-fg">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-fg-faint">{sub}</p>}
    </div>
  );
}

function branchTotal(branch: RollupCompareBranch, metric: Metric): number {
  return branch.weeks.reduce((sum, w) => sum + w[metric], 0);
}

function formatMetric(value: number, metric: Metric, currency: string): string {
  return metric === "ordersCount" ? String(value) : formatCurrency(value, currency);
}

/** Multi-branch trend chart — one line per branch over the compared weeks, hand-rolled SVG (no charting lib in this codebase). */
function ComparisonChart({ branches, metric }: { branches: RollupCompareBranch[]; metric: Metric }) {
  const width = 600;
  const height = 200;
  const allWeeks = branches[0]?.weeks.map((w) => w.weekStart) ?? [];
  const allValues = branches.flatMap((b) => b.weeks.map((w) => w[metric]));
  const max = Math.max(...allValues, 1);

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${metric} by branch over time`}>
      {branches.map((b, i) => {
        const points = b.weeks.map((w, wi) => ({
          x: allWeeks.length > 1 ? (wi / (allWeeks.length - 1)) * width : 0,
          y: height - (w[metric] / max) * height,
        }));
        const path = points.map((p, pi) => `${pi === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
        const last = points[points.length - 1];
        return (
          <g key={b.businessId}>
            <path d={path} fill="none" stroke={BRANCH_COLORS[i % BRANCH_COLORS.length]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            {last && <circle cx={last.x} cy={last.y} r={3.5} fill={BRANCH_COLORS[i % BRANCH_COLORS.length]} />}
          </g>
        );
      })}
    </svg>
  );
}

export function BranchComparisonView({ currency }: { currency: string }) {
  const [metric, setMetric] = useState<Metric>("revenue");
  const { data: branches = [], isPending, isError, refetch } = useQuery({
    queryKey: ["rollup-compare"],
    queryFn: () => fetchRollupCompare(),
  });

  const ranked = useMemo(
    () => [...branches].sort((a, b) => branchTotal(b, metric) - branchTotal(a, metric)),
    [branches, metric],
  );
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  const spread = best && worst ? branchTotal(best, metric) - branchTotal(worst, metric) : 0;
  const allWeeks = branches[0]?.weeks.map((w) => w.weekStart) ?? [];

  if (isError) {
    return <ErrorBanner title="Couldn't load branch comparison" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end gap-1 rounded-full bg-surface-2 p-1 self-end">
        {METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMetric(m.key)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              metric === m.key ? "bg-surface text-fg shadow-[var(--shadow-sm)]" : "text-fg-muted hover:text-fg",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {isPending ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : branches.length === 0 ? (
        <p className="text-sm text-fg-muted">No branches to compare yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label="Best" value={best?.name ?? "—"} sub={best ? formatMetric(branchTotal(best, metric), metric, currency) : undefined} />
            <StatCard label="Worst" value={worst?.name ?? "—"} sub={worst ? formatMetric(branchTotal(worst, metric), metric, currency) : undefined} />
            <StatCard label="Spread" value={formatMetric(spread, metric, currency)} sub="Best − worst, this window" />
          </div>

          <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
            <div className="mb-4 flex flex-wrap gap-3">
              {branches.map((b, i) => (
                <span key={b.businessId} className="flex items-center gap-1.5 text-xs text-fg-muted">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BRANCH_COLORS[i % BRANCH_COLORS.length] }} />
                  {b.name}
                </span>
              ))}
            </div>
            {isPending ? <Skeleton className="h-48 w-full" /> : <ComparisonChart branches={branches} metric={metric} />}
          </div>

          <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                  <th className="px-4 py-3 text-start">Week of</th>
                  {branches.map((b) => (
                    <th key={b.businessId} className="px-4 py-3 text-start">
                      {b.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allWeeks.map((week, wi) => (
                  <tr key={week} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-fg-muted">{week}</td>
                    {branches.map((b) => (
                      <td key={b.businessId} className="px-4 py-3 text-fg-muted">
                        {formatMetric(b.weeks[wi]?.[metric] ?? 0, metric, currency)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

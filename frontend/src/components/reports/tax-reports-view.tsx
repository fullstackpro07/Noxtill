"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonCard, SkeletonRow } from "@/components/shared/skeleton";
import { fetchTaxSummary } from "@/lib/tax-reports-api";
import { formatCurrency, formatDate } from "@/lib/format";

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <span className="text-xs font-medium text-fg-faint">{label}</span>
      <p className={`mt-1 font-display text-xl font-bold ${tone === "warning" ? "text-accent" : "text-fg"}`}>{value}</p>
    </div>
  );
}

function TrendChart({ trend, currency }: { trend: { period: string; taxCollected: number }[]; currency: string }) {
  const width = 600;
  const height = 160;
  const max = Math.max(1, ...trend.map((t) => t.taxCollected));
  const points = trend.map((t, i) => ({
    x: trend.length > 1 ? (i / (trend.length - 1)) * width : 0,
    y: height - (t.taxCollected / max) * (height - 20) - 10,
  }));
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const last = points[points.length - 1];

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Tax collected trend">
      <path d={path} fill="none" stroke="var(--color-primary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {last && <circle cx={last.x} cy={last.y} r={4} fill="var(--color-primary)" />}
      {trend.map((t, i) => (
        <text key={t.period} x={points[i].x} y={height - 2} fontSize="9" fill="var(--color-fg-faint)" textAnchor="middle">
          {t.period.slice(5)}
        </text>
      ))}
      <title>{trend.map((t) => `${t.period}: ${formatCurrency(t.taxCollected, currency)}`).join(", ")}</title>
    </svg>
  );
}

export function TaxReportsView({ currency }: { currency: string }) {
  const [showFiling, setShowFiling] = useState(false);
  const [showRateBreakdown, setShowRateBreakdown] = useState(false);

  const { data: summary, isPending, isError, refetch } = useQuery({
    queryKey: ["tax-summary"],
    queryFn: () => fetchTaxSummary(),
  });

  if (isError) {
    return <ErrorBanner title="Couldn't load the tax report" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {isPending || !summary ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard label="Taxable sales" value={formatCurrency(summary.taxableSales, currency)} />
            <StatCard label={`${summary.taxLabel} collected`} value={formatCurrency(summary.taxCollected, currency)} />
            <StatCard label="Tax on purchases" value="Not tracked" tone="warning" />
            <StatCard label={`Net ${summary.taxLabel.toLowerCase()} due`} value={formatCurrency(summary.netTaxDue, currency)} />
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setShowFiling(true)}>
          <CalendarClock className="h-3.5 w-3.5" aria-hidden />
          Next filing date
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowRateBreakdown(true)}>
          <Percent className="h-3.5 w-3.5" aria-hidden />
          Rate breakdown
        </Button>
      </div>

      {isPending || !summary ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
          <SkeletonRow />
        </div>
      ) : (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-fg">{summary.taxLabel} collected — trailing 6 months</h3>
          <TrendChart trend={summary.trend} currency={currency} />
        </div>
      )}

      {isPending || !summary ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                <th className="px-4 py-3 text-start">Period</th>
                <th className="px-4 py-3 text-start">Taxable sales</th>
                <th className="px-4 py-3 text-start">{summary.taxLabel} collected</th>
              </tr>
            </thead>
            <tbody>
              {[...summary.trend].reverse().map((row) => (
                <tr key={row.period} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-fg">{row.period}</td>
                  <td className="px-4 py-3 tabular-nums text-fg-muted">{formatCurrency(row.taxableSales, currency)}</td>
                  <td className="px-4 py-3 tabular-nums text-fg-muted">{formatCurrency(row.taxCollected, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-fg-faint">
        &ldquo;Tax on purchases&rdquo; isn&apos;t tracked yet — no supplier invoice in this system currently records tax paid, so net due above is
        tax collected only, not netted against input tax.
      </p>

      {showFiling && summary && (
        <Dialog open onClose={() => setShowFiling(false)} title="Next filing date">
          <p className="text-sm text-fg">{formatDate(summary.nextFilingDate)}</p>
          <p className="mt-2 text-xs text-fg-faint">
            A generic monthly-filing assumption (the 15th of next month) — not specific to your jurisdiction&apos;s real filing calendar, which
            this system doesn&apos;t model yet.
          </p>
        </Dialog>
      )}

      {showRateBreakdown && summary && (
        <Dialog open onClose={() => setShowRateBreakdown(false)} title="Rate breakdown">
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-fg-muted">{summary.taxLabel} rate</span>
              <span className="font-medium text-fg">{summary.taxRate}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-muted">Taxable sales ({summary.period})</span>
              <span className="font-medium text-fg">{formatCurrency(summary.taxableSales, currency)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2">
              <span className="text-fg-muted">{summary.taxLabel} collected</span>
              <span className="font-medium text-fg">{formatCurrency(summary.taxCollected, currency)}</span>
            </div>
          </div>
          <p className="mt-3 text-xs text-fg-faint">
            A single flat rate applies across this business — there&apos;s no per-category or multi-rate tax model yet.
          </p>
        </Dialog>
      )}
    </div>
  );
}

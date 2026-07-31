"use client";

import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import { CHANNEL_OVERVIEW, OVERVIEW_TREND } from "@/lib/marketing-overview";
import { RevenueLineChart } from "@/components/analytics/revenue-line-chart";
import { formatCurrency } from "@/lib/format";

export function MarketingOverviewSection({ currency }: { currency: string }) {
  const totalSpend = CHANNEL_OVERVIEW.reduce((sum, c) => sum + c.spend, 0);

  return (
    <div className="mt-8 flex flex-col gap-5">
      <h2 className="font-display text-lg font-semibold text-fg">Cross-channel overview</h2>

      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
        <p className="mb-3 text-sm font-medium text-fg">Combined ad spend, last 12 weeks</p>
        <RevenueLineChart data={OVERVIEW_TREND} currency={currency} />
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
              <th className="px-4 py-3 text-start">Channel</th>
              <th className="px-4 py-3 text-start">Spend</th>
              <th className="px-4 py-3 text-start">Results</th>
              <th className="px-4 py-3 text-start" />
            </tr>
          </thead>
          <tbody>
            {CHANNEL_OVERVIEW.map((row) => (
              <tr key={row.key} className="border-b border-border last:border-0">
                <td className="p-0">
                  <Link href={row.href} className="flex items-center justify-between px-4 py-3 hover:bg-surface-2/50">
                    <span className="font-medium text-fg">{row.name}</span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-fg-muted">{formatCurrency(row.spend, currency)}</td>
                <td className="px-4 py-3 text-fg-muted">
                  {row.results} {row.resultLabel}
                </td>
                <td className="px-4 py-3 text-end">
                  <Link href={row.href} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    View
                    <ArrowRight className="h-3 w-3" aria-hidden />
                  </Link>
                </td>
              </tr>
            ))}
            <tr className="bg-surface-2/50">
              <td className="px-4 py-3 font-semibold text-fg">Total</td>
              <td className="px-4 py-3 font-semibold text-fg">{formatCurrency(totalSpend, currency)}</td>
              <td className="px-4 py-3" />
              <td className="px-4 py-3" />
            </tr>
          </tbody>
        </table>
      </div>

      <div className="rounded-[var(--radius-noxtill)] border border-primary/25 bg-primary/[0.04] p-4">
        <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-primary">
          <Sparkles className="h-4 w-4" aria-hidden />
          Recommendation
        </div>
        <p className="text-sm text-fg">
          Meta Ads is converting at a lower cost per result than Google Ads this month — consider shifting 20% of your Google
          budget toward the review-to-ad campaign.
        </p>
      </div>
    </div>
  );
}

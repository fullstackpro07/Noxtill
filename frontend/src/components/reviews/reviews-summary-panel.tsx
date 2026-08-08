"use client";

import { useQuery } from "@tanstack/react-query";
import { Star, TrendingUp } from "lucide-react";
import { RatingSparkline } from "./rating-sparkline";
import { Skeleton } from "@/components/shared/skeleton";
import { fetchReviewsSummary } from "@/lib/reviews-api";

export function ReviewsSummaryPanel() {
  const { data: summary, isPending } = useQuery({ queryKey: ["reviews-summary"], queryFn: fetchReviewsSummary });

  if (isPending) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }
  if (!summary) return null;

  const maxCount = Math.max(...summary.distribution.map((d) => d.count), 1);
  const conversionPct = summary.conversion.requested > 0 ? Math.round((summary.conversion.received / summary.conversion.requested) * 100) : 0;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-fg-faint">
          <Star className="h-3.5 w-3.5" aria-hidden />
          Average rating
        </p>
        <div className="flex items-end justify-between gap-3">
          <p className="font-display text-2xl font-bold text-fg">{summary.averageRating.toFixed(1)}</p>
          <RatingSparkline data={summary.sparkline} />
        </div>
      </div>

      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
        <p className="mb-2 text-xs font-medium text-fg-faint">Rating distribution</p>
        <div className="flex flex-col gap-1">
          {summary.distribution.map((d) => (
            <div key={d.stars} className="flex items-center gap-2">
              <span className="w-3 shrink-0 text-xs tabular-nums text-fg-faint">{d.stars}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-chart-1" style={{ width: `${(d.count / maxCount) * 100}%` }} />
              </div>
              <span className="w-4 shrink-0 text-end text-xs tabular-nums text-fg-faint">{d.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-fg-faint">
          <TrendingUp className="h-3.5 w-3.5" aria-hidden />
          Request → review conversion
        </p>
        <p className="font-display text-2xl font-bold text-fg">{conversionPct}%</p>
        <p className="text-xs text-fg-faint">
          {summary.conversion.received} of {summary.conversion.requested} requests, last 30 days
        </p>
      </div>
    </div>
  );
}

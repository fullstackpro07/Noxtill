"use client";

import { Star, TrendingUp } from "lucide-react";
import { RatingSparkline } from "./rating-sparkline";
import { EXTERNAL_REVIEWS, RATING_SPARKLINE, CONVERSION, averageRating, ratingDistribution } from "@/lib/reviews";

export function ReviewsSummaryPanel() {
  const avg = averageRating(EXTERNAL_REVIEWS);
  const distribution = ratingDistribution(EXTERNAL_REVIEWS);
  const maxCount = Math.max(...distribution.map((d) => d.count), 1);
  const conversionPct = CONVERSION.requested > 0 ? Math.round((CONVERSION.received / CONVERSION.requested) * 100) : 0;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-fg-faint">
          <Star className="h-3.5 w-3.5" aria-hidden />
          Average rating
        </p>
        <div className="flex items-end justify-between gap-3">
          <p className="font-display text-2xl font-bold text-fg">{avg.toFixed(1)}</p>
          <RatingSparkline data={RATING_SPARKLINE} />
        </div>
      </div>

      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
        <p className="mb-2 text-xs font-medium text-fg-faint">Rating distribution</p>
        <div className="flex flex-col gap-1">
          {distribution.map((d) => (
            <div key={d.stars} className="flex items-center gap-2">
              <span className="w-3 shrink-0 text-xs tabular-nums text-fg-faint">{d.stars}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-chart-1"
                  style={{ width: `${(d.count / maxCount) * 100}%` }}
                />
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
          {CONVERSION.received} of {CONVERSION.requested} requests, last 30 days
        </p>
      </div>
    </div>
  );
}

"use client";

import { RatingSparkline } from "@/components/reviews/rating-sparkline";
import type { Competitor } from "@/lib/competitors";

export function CompetitorCard({ competitor }: { competitor: Competitor }) {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-fg">{competitor.name}</p>
          <p className="text-xs text-fg-faint">{competitor.reviewCount} reviews</p>
        </div>
        <p className="font-display text-lg font-bold text-fg">{competitor.rating.toFixed(1)}</p>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-fg-faint">12-week trend</span>
        <RatingSparkline data={competitor.weeklyRatings} width={90} height={28} />
      </div>
    </div>
  );
}

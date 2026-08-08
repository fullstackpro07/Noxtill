"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { RatingSparkline } from "@/components/reviews/rating-sparkline";
import { triggerCompetitorSnapshot } from "@/lib/competitors-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import type { Competitor } from "@/lib/competitors";

export function CompetitorCard({ competitor }: { competitor: Competitor }) {
  const queryClient = useQueryClient();
  const refreshMutation = useMutation({
    mutationFn: () => triggerCompetitorSnapshot(competitor.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competitors"] });
      toast.success(`Refreshed ${competitor.name}.`);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't refresh this competitor right now.");
    },
  });

  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-fg">{competitor.name}</p>
          <p className="text-xs text-fg-faint">{competitor.reviewCount} reviews</p>
        </div>
        <p className="font-display text-lg font-bold text-fg">{competitor.rating > 0 ? competitor.rating.toFixed(1) : "—"}</p>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-fg-faint">12-week trend</span>
        <RatingSparkline data={competitor.weeklyRatings} width={90} height={28} />
      </div>
      <button
        type="button"
        onClick={() => refreshMutation.mutate()}
        disabled={refreshMutation.isPending}
        className="mt-3 flex items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:opacity-60"
      >
        <RefreshCw className={`h-3 w-3 ${refreshMutation.isPending ? "animate-spin" : ""}`} aria-hidden />
        {refreshMutation.isPending ? "Refreshing…" : "Refresh now"}
      </button>
    </div>
  );
}

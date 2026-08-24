"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trophy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonCard } from "@/components/shared/skeleton";
import { CompetitorCard } from "@/components/marketing/competitor-card";
import { AddCompetitorDialog } from "@/components/marketing/add-competitor-dialog";
import { fetchCompetitors, fetchCompetitorCategoryAverage } from "@/lib/competitors-api";
import { fetchReviewsSummary } from "@/lib/reviews-api";
import { MAX_COMPETITORS } from "@/lib/competitors";
import { toast } from "@/lib/toast";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <span className="text-xs font-medium text-fg-faint">{label}</span>
        <span className="font-display text-xl font-bold tabular-nums text-fg">{value}</span>
      </CardContent>
    </Card>
  );
}

export function CompetitorRatingsPanel() {
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: summary } = useQuery({ queryKey: ["reviews-summary"], queryFn: fetchReviewsSummary });
  const { data: categoryAverage } = useQuery({ queryKey: ["competitor-category-average"], queryFn: fetchCompetitorCategoryAverage });
  const {
    data: competitors = [],
    isPending,
    isError,
    refetch,
  } = useQuery({ queryKey: ["competitors"], queryFn: fetchCompetitors });

  const yourRating = summary?.averageRating ?? 0;
  const ratedCompetitors = competitors.filter((c) => c.rating > 0);
  const rank = 1 + ratedCompetitors.filter((c) => c.rating > yourRating).length;
  const totalRanked = ratedCompetitors.length + (summary ? 1 : 0);
  const gap = categoryAverage?.averageRating != null ? Math.round((yourRating - categoryAverage.averageRating) * 10) / 10 : null;

  const atLimit = competitors.length >= MAX_COMPETITORS;

  function handleOpenAdd() {
    if (atLimit) {
      toast.error(`You can track up to ${MAX_COMPETITORS} competitors.`);
    }
    setDialogOpen(true);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Your rating" value={yourRating > 0 ? yourRating.toFixed(1) : "—"} />
        <StatTile label="Category average" value={categoryAverage?.averageRating != null ? categoryAverage.averageRating.toFixed(1) : "—"} />
        <StatTile label="Your rank" value={totalRanked > 0 ? `#${rank} of ${totalRanked}` : "—"} />
        <StatTile label="Gap vs. average" value={gap != null ? `${gap > 0 ? "+" : ""}${gap.toFixed(1)}` : "—"} />
      </div>

      {rank === 1 && totalRanked > 1 && (
        <div className="flex items-center gap-2 rounded-[var(--radius-noxtill)] border border-whatsapp/25 bg-whatsapp/8 px-4 py-3 text-sm text-whatsapp">
          <Trophy className="h-4 w-4 shrink-0" aria-hidden />
          You&apos;re the top-rated business among everyone you&apos;re tracking.
        </div>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium text-fg">Tracked competitors — 12-week rating trend</p>
          <Button size="sm" variant="outline" onClick={handleOpenAdd}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Track competitor
          </Button>
        </div>
        {isError ? (
          <ErrorBanner title="Couldn't load competitors" description="Check your connection and try again." onRetry={() => refetch()} />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {isPending ? (
              <>
                <SkeletonCard />
                <SkeletonCard />
              </>
            ) : competitors.length === 0 ? (
              <p className="text-sm text-fg-faint">No competitors tracked yet — add one to see how you compare.</p>
            ) : (
              competitors.map((c) => <CompetitorCard key={c.id} competitor={c} />)
            )}
          </div>
        )}
      </div>

      <AddCompetitorDialog open={dialogOpen} onClose={() => setDialogOpen(false)} atLimit={atLimit} />
    </div>
  );
}

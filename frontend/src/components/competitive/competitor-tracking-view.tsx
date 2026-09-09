"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Trash2, ExternalLink, MessageSquareText, Clock, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { RatingSparkline } from "@/components/reviews/rating-sparkline";
import { SkeletonCard } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { EmptyState } from "@/components/shared/empty-state";
import { CompetitorSearchDialog } from "@/components/competitive/competitor-search-dialog";
import {
  fetchCompetitorsRaw,
  fetchCompetitorHistory,
  fetchCompetitorAds,
  fetchCompetitorDetails,
  fetchCompetitorCategoryAverage,
  triggerCompetitorSnapshot,
  removeCompetitor,
  type RawCompetitor,
  type CompetitorAd,
} from "@/lib/competitors-api";
import { fetchReviewsSummary } from "@/lib/reviews-api";
import { MAX_COMPETITORS } from "@/lib/competitors";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export function CompetitorTrackingView() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detail, setDetail] = useState<RawCompetitor | null>(null);

  const { data: competitors, isPending, isError, refetch } = useQuery({
    queryKey: ["competitors"],
    queryFn: fetchCompetitorsRaw,
  });
  const { data: summary } = useQuery({ queryKey: ["reviews-summary"], queryFn: fetchReviewsSummary });
  const { data: categoryAverage } = useQuery({ queryKey: ["competitor-category-average"], queryFn: fetchCompetitorCategoryAverage });

  const removeMutation = useMutation({
    mutationFn: removeCompetitor,
    onSuccess: () => {
      toast.success("Competitor removed.");
      void queryClient.invalidateQueries({ queryKey: ["competitors"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't remove this competitor."),
  });

  const atLimit = (competitors?.length ?? 0) >= MAX_COMPETITORS;
  const yourRating = summary?.averageRating ?? 0;
  const yourReviewCount = summary?.distribution.reduce((sum, d) => sum + d.count, 0) ?? 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg">Competitor Tracking</h1>
          <p className="mt-0.5 text-sm text-fg-muted">Track up to {MAX_COMPETITORS} competitors&apos; public ratings and ads.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Track competitor
        </Button>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load competitors" onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : !competitors || competitors.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="No competitors tracked yet"
          description="Add one to see how your rating compares."
          action={{ label: "Track competitor", onClick: () => setDialogOpen(true) }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {competitors.map((c) => (
            <CompetitorTrackCard key={c.id} competitor={c} onOpenDetail={() => setDetail(c)} onRemove={() => removeMutation.mutate(c.id)} />
          ))}
        </div>
      )}

      {competitors && competitors.length > 0 && (
        <div className="mt-6 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-fg">
            <MessageSquareText className="h-4 w-4 text-fg-faint" aria-hidden />
            Weekly comparison preview
          </div>
          <p className="text-xs text-fg-muted mb-2">A preview only — nothing here is sent anywhere.</p>
          <p className="rounded-[var(--radius-sm)] bg-surface-2 p-3 text-sm text-fg">
            This week: you&apos;re rated {yourRating > 0 ? yourRating.toFixed(1) : "—"}★
            {summary ? ` (${yourReviewCount} reviews)` : ""}. Your {competitors.length} tracked competitor
            {competitors.length === 1 ? "" : "s"} average{" "}
            {categoryAverage?.averageRating != null ? `${categoryAverage.averageRating.toFixed(1)}★` : "no rating data yet"}.
          </p>
        </div>
      )}

      <CompetitorSearchDialog open={dialogOpen} onClose={() => setDialogOpen(false)} atLimit={atLimit} />
      <CompetitorDetailDialog competitor={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function CompetitorTrackCard({
  competitor,
  onOpenDetail,
  onRemove,
}: {
  competitor: RawCompetitor;
  onOpenDetail: () => void;
  onRemove: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: history } = useQuery({ queryKey: ["competitor-history", competitor.id], queryFn: () => fetchCompetitorHistory(competitor.id) });
  const weeklyRatings = history && history.length > 0 ? history.map((h) => h.rating) : [];

  const refreshMutation = useMutation({
    mutationFn: () => triggerCompetitorSnapshot(competitor.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["competitors"] });
      void queryClient.invalidateQueries({ queryKey: ["competitor-history", competitor.id] });
      toast.success(`Refreshed ${competitor.name}.`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't refresh this competitor right now."),
  });

  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <button onClick={onOpenDetail} className="min-w-0 text-left hover:underline">
          <p className="truncate text-sm font-medium text-fg">{competitor.name}</p>
          <p className="text-xs text-fg-faint">{competitor.lastReviewsCount ?? 0} reviews</p>
        </button>
        <p className="font-display text-lg font-bold text-fg">{competitor.lastRating != null ? Number(competitor.lastRating).toFixed(1) : "—"}</p>
      </div>
      {weeklyRatings.length > 0 && (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-fg-faint">12-week trend</span>
          <RatingSparkline data={weeklyRatings} width={90} height={28} />
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <Button variant="ghost" size="sm" className="flex-1 px-0" onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}>
          <RefreshCw className={cn("h-3 w-3", refreshMutation.isPending && "animate-spin")} aria-hidden />
          Refresh
        </Button>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onRemove}>
          <Trash2 className="h-3 w-3" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function CompetitorDetailDialog({ competitor, onClose }: { competitor: RawCompetitor | null; onClose: () => void }) {
  return competitor ? <CompetitorDetailDialogBody competitor={competitor} onClose={onClose} /> : null;
}

function CompetitorDetailDialogBody({ competitor, onClose }: { competitor: RawCompetitor; onClose: () => void }) {
  const { data: ads, isPending: adsPending } = useQuery({
    queryKey: ["competitor-ads", competitor.id],
    queryFn: () => fetchCompetitorAds(competitor.id),
  });
  const { data: history } = useQuery({
    queryKey: ["competitor-history", competitor.id],
    queryFn: () => fetchCompetitorHistory(competitor.id),
  });
  const { data: details, isPending: detailsPending } = useQuery({
    queryKey: ["competitor-details", competitor.id],
    queryFn: () => fetchCompetitorDetails(competitor.id),
  });

  return (
    <Dialog open onClose={onClose} title={competitor.name} className="max-w-lg">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between rounded-[var(--radius-sm)] bg-surface-2 p-3">
          <span className="text-sm text-fg-muted">Current rating</span>
          <span className="font-display text-lg font-bold text-fg">
            {competitor.lastRating != null ? Number(competitor.lastRating).toFixed(1) : "—"} ({competitor.lastReviewsCount ?? 0} reviews)
          </span>
        </div>

        {history && history.length > 1 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-fg-muted">12-week rating history</p>
            <RatingSparkline data={history.map((h) => h.rating)} width={400} height={60} />
          </div>
        )}

        <div>
          <p className="mb-1.5 text-xs font-medium text-fg-muted">Active/recent ads</p>
          {adsPending ? (
            <p className="text-xs text-fg-faint">Loading…</p>
          ) : !ads || ads.length === 0 ? (
            <p className="text-xs text-fg-faint">
              No ads found — either they have none running, or a Facebook Page ID and Meta Ad Library access haven&apos;t been configured for
              this competitor.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {ads.map((ad: CompetitorAd) => (
                <div key={ad.adArchiveId} className="rounded-[var(--radius-sm)] border border-border p-2.5">
                  {ad.body && <p className="line-clamp-2 text-xs text-fg">{ad.body}</p>}
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[10px] text-fg-faint">
                      {ad.startedAt ? new Date(ad.startedAt).toLocaleDateString() : "Unknown start"}
                    </span>
                    {ad.snapshotUrl && (
                      <a href={ad.snapshotUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[10px] text-primary hover:underline">
                        View ad
                        <ExternalLink className="h-2.5 w-2.5" aria-hidden />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {detailsPending ? (
          <p className="text-xs text-fg-faint">Loading hours, reviews, and photos…</p>
        ) : (
          <>
            {details && details.photos.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-fg-muted">Photos</p>
                <div className="flex gap-2 overflow-x-auto">
                  {details.photos.map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={url} src={url} alt="" className="h-16 w-16 shrink-0 rounded-[var(--radius-sm)] border border-border object-cover" />
                  ))}
                </div>
              </div>
            )}

            {details && details.hours && details.hours.length > 0 && (
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  Hours
                </div>
                <div className="flex flex-col gap-0.5 text-xs text-fg">
                  {details.hours.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              </div>
            )}

            {details && details.reviews.length > 0 && (
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
                  <Star className="h-3.5 w-3.5" aria-hidden />
                  Recent reviews
                </div>
                <div className="flex flex-col gap-2">
                  {details.reviews.map((r, i) => (
                    <div key={i} className="rounded-[var(--radius-sm)] border border-border p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-fg">{r.authorName}</span>
                        <span className="flex items-center gap-0.5 text-xs text-fg-muted">
                          <Star className="h-3 w-3 fill-current" aria-hidden /> {r.rating}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-3 text-xs text-fg-muted">{r.text}</p>
                      <p className="mt-1 text-[10px] text-fg-faint">{r.relativeTime}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {details && !details.hours && details.reviews.length === 0 && details.photos.length === 0 && (
              <p className="text-xs text-fg-faint">
                No hours, reviews, or photos found — this competitor was likely added by free-text name rather than from a Google
                search result, so there&apos;s no real Place ID to look up.
              </p>
            )}

            <p className="text-xs text-fg-faint">
              Recent posts aren&apos;t shown — Google&apos;s public Places API never exposes a business&apos;s own promotional posts;
              that data is only reachable via the profile owner&apos;s own consent, which we have no path to for a competitor.
            </p>
          </>
        )}
      </div>
    </Dialog>
  );
}

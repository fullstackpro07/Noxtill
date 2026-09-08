"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Rocket, RefreshCw, Eye, Heart, MessageCircle, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { EmptyState } from "@/components/shared/empty-state";
import {
  fetchSocialPosts,
  fetchSocialPostAnalytics,
  pullSocialPostAnalytics,
  boostSocialPost,
  type SocialPost,
} from "@/lib/social-posts-api";
import { SOCIAL_PLATFORM_LABELS, type SocialPlatform } from "@/lib/social-accounts-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

/** Mirrors backend `BOOST_PROVIDER_MAP` — kept here only to grey out the action before the API round-trip, the 400 is still the real source of truth. */
const BOOSTABLE: SocialPlatform[] = ["facebook", "instagram", "tiktok", "linkedin", "pinterest", "snapchat", "reddit"];
/** Mirrors which connectors implement `fetchPostInsights` today. */
const INSIGHTS_CAPABLE: SocialPlatform[] = ["facebook", "instagram"];

export function PublishedView() {
  const queryClient = useQueryClient();
  const { data: published, isPending: p1, isError: e1, refetch: r1 } = useQuery({
    queryKey: ["social-posts", "published"],
    queryFn: () => fetchSocialPosts("published"),
  });
  const { data: partial, isPending: p2, isError: e2, refetch: r2 } = useQuery({
    queryKey: ["social-posts", "partially_failed"],
    queryFn: () => fetchSocialPosts("partially_failed"),
  });

  const posts = [...(published ?? []), ...(partial ?? [])].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  const isPending = p1 || p2;
  const isError = e1 || e2;

  const pullMutation = useMutation({
    mutationFn: pullSocialPostAnalytics,
    onSuccess: () => {
      toast.success("Pulled the latest insights.");
      void queryClient.invalidateQueries({ queryKey: ["social-post-analytics"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't pull insights right now."),
  });

  const [boostTarget, setBoostTarget] = useState<{ postId: string; platform: SocialPlatform } | null>(null);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-fg">Published Posts</h1>
        <p className="mt-0.5 text-sm text-fg-muted">
          Real per-post insights are only pollable on Facebook and Instagram today; other platforms show what was recorded at
          publish time.
        </p>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load published posts" onRetry={() => { void r1(); void r2(); }} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : posts.length === 0 ? (
        <EmptyState icon={Rocket} title="Nothing published yet" description="Posts appear here once at least one platform succeeds." />
      ) : (
        <div className="flex flex-col gap-3">
          {posts.map((post) => (
            <PublishedPostCard
              key={post.id}
              post={post}
              onPull={() => pullMutation.mutate(post.id)}
              pulling={pullMutation.isPending}
              onBoost={(platform) => setBoostTarget({ postId: post.id, platform })}
            />
          ))}
        </div>
      )}

      <BoostDialog target={boostTarget} onClose={() => setBoostTarget(null)} />
    </div>
  );
}

function PublishedPostCard({
  post,
  onPull,
  pulling,
  onBoost,
}: {
  post: SocialPost;
  onPull: () => void;
  pulling: boolean;
  onBoost: (platform: SocialPlatform) => void;
}) {
  const publishedTargets = post.targets.filter((t) => t.status === "published");
  const anyInsightsCapable = publishedTargets.some((t) => INSIGHTS_CAPABLE.includes(t.platform));

  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <p className="line-clamp-2 whitespace-pre-wrap text-sm text-fg">{post.caption}</p>
      <div className="mt-3 flex flex-col gap-2">
        {publishedTargets.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-surface-2 px-3 py-2">
            <div className="flex items-center gap-2">
              <Badge tone="success">{SOCIAL_PLATFORM_LABELS[t.platform]}</Badge>
              <span className="text-xs text-fg-faint">
                {t.publishedAt ? new Date(t.publishedAt).toLocaleDateString() : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {BOOSTABLE.includes(t.platform) && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onBoost(t.platform)}>
                  <Rocket className="h-3 w-3" aria-hidden />
                  Boost
                </Button>
              )}
            </div>
          </div>
        ))}
        {post.targets
          .filter((t) => t.status === "failed")
          .map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-destructive/6 px-3 py-2">
              <Badge tone="danger">{SOCIAL_PLATFORM_LABELS[t.platform]}</Badge>
              <span className="truncate text-xs text-destructive">{t.errorMessage}</span>
            </div>
          ))}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <p className="text-xs text-fg-faint">
          {anyInsightsCapable ? "Facebook/Instagram insights available." : "No pollable insights for these platforms."}
        </p>
        {anyInsightsCapable && (
          <Button variant="outline" size="sm" onClick={onPull} disabled={pulling}>
            <RefreshCw className={`h-3.5 w-3.5 ${pulling ? "animate-spin" : ""}`} aria-hidden />
            Pull insights
          </Button>
        )}
      </div>

      <PostAnalytics postId={post.id} />
    </div>
  );
}

function PostAnalytics({ postId }: { postId: string }) {
  const { data } = useQuery({
    queryKey: ["social-post-analytics", postId],
    queryFn: () => fetchSocialPostAnalytics(postId),
  });

  if (!data || data.length === 0) return null;

  return (
    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 sm:grid-cols-4">
      {data.map((row) => (
        <div key={row.id} className="flex flex-col gap-1 rounded-[var(--radius-sm)] bg-surface-2 p-2">
          <p className="text-[11px] text-fg-faint">{SOCIAL_PLATFORM_LABELS[row.socialPostTarget.platform]}</p>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-fg">
            <span className="inline-flex items-center gap-0.5">
              <Eye className="h-3 w-3" aria-hidden /> {row.reach}
            </span>
            <span className="inline-flex items-center gap-0.5">
              <Heart className="h-3 w-3" aria-hidden /> {row.likes}
            </span>
            <span className="inline-flex items-center gap-0.5">
              <MessageCircle className="h-3 w-3" aria-hidden /> {row.comments}
            </span>
            <span className="inline-flex items-center gap-0.5">
              <Share2 className="h-3 w-3" aria-hidden /> {row.shares}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function BoostDialog({ target, onClose }: { target: { postId: string; platform: SocialPlatform } | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [goal, setGoal] = useState("traffic");
  const [dailyBudget, setDailyBudget] = useState("10");

  const mutation = useMutation({
    mutationFn: () => boostSocialPost(target!.postId, target!.platform, { goal, dailyBudget: Number(dailyBudget) }),
    onSuccess: () => {
      toast.success("Boosted — a new ad campaign was created from this post.");
      void queryClient.invalidateQueries({ queryKey: ["ad-campaigns"] });
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't boost this post."),
  });

  if (!target) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Boost as ad — ${SOCIAL_PLATFORM_LABELS[target.platform]}`}
      description="This creates a real ad campaign from this post's caption and media."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !dailyBudget}>
            {mutation.isPending ? "Boosting…" : "Boost"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input label="Goal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. traffic, awareness" />
        <Input
          label="Daily budget"
          type="number"
          min={1}
          value={dailyBudget}
          onChange={(e) => setDailyBudget(e.target.value)}
        />
      </div>
    </Dialog>
  );
}

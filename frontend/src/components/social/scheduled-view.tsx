"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, RotateCw, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { EmptyState } from "@/components/shared/empty-state";
import {
  fetchSocialPostsQueue,
  publishSocialPostNow,
  retrySocialPostTarget,
  deleteSocialPost,
  type SocialPostTargetStatus,
} from "@/lib/social-posts-api";
import { SOCIAL_PLATFORM_LABELS } from "@/lib/social-accounts-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const TARGET_TONE: Record<SocialPostTargetStatus, "neutral" | "success" | "danger"> = {
  pending: "neutral",
  published: "success",
  failed: "danger",
};

function timeUntil(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return "due now";
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.round(hours / 24)}d`;
}

export function ScheduledView() {
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["social-posts-queue"],
    queryFn: fetchSocialPostsQueue,
    refetchInterval: 30_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["social-posts-queue"] });
    void queryClient.invalidateQueries({ queryKey: ["social-posts"] });
  };

  const publishMutation = useMutation({
    mutationFn: publishSocialPostNow,
    onSuccess: () => {
      toast.success("Publishing now.");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't publish this post."),
  });

  const retryMutation = useMutation({
    mutationFn: ({ id, platform }: { id: string; platform: string }) => retrySocialPostTarget(id, platform as never),
    onSuccess: () => {
      toast.success("Retrying that platform.");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't retry that target."),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSocialPost,
    onSuccess: () => {
      toast.success("Removed from the queue.");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't remove this post."),
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-fg">Scheduled Posts</h1>
        <p className="mt-0.5 text-sm text-fg-muted">Everything queued for delivery, in order of when it&apos;s due.</p>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load the queue" onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState icon={CalendarClock} title="Nothing queued" description="Schedule a post from Create Post to see it here." />
      ) : (
        <div className="flex flex-col gap-3">
          {data.map((post) => (
            <div key={post.id} className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="line-clamp-2 flex-1 whitespace-pre-wrap text-sm text-fg">{post.caption}</p>
                {post.scheduledFor && (
                  <Badge tone="primary" className="shrink-0">
                    <CalendarClock className="h-3 w-3" aria-hidden />
                    {timeUntil(post.scheduledFor)}
                  </Badge>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {post.targets.map((t) => (
                  <span key={t.id} className="inline-flex items-center gap-1">
                    <Badge tone={TARGET_TONE[t.status]}>{SOCIAL_PLATFORM_LABELS[t.platform]}</Badge>
                    {t.status === "failed" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-xs"
                        onClick={() => retryMutation.mutate({ id: post.id, platform: t.platform })}
                        disabled={retryMutation.isPending}
                      >
                        <RotateCw className="h-3 w-3" aria-hidden />
                        Retry
                      </Button>
                    )}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => deleteMutation.mutate(post.id)} disabled={deleteMutation.isPending}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Cancel
                </Button>
                <Button size="sm" onClick={() => publishMutation.mutate(post.id)} disabled={publishMutation.isPending}>
                  <Send className="h-3.5 w-3.5" aria-hidden />
                  Publish now
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

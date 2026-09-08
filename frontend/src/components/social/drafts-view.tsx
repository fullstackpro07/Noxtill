"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileEdit, Send, Trash2, Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { EmptyState } from "@/components/shared/empty-state";
import { fetchSocialPosts, publishSocialPostNow, deleteSocialPost } from "@/lib/social-posts-api";
import { SOCIAL_PLATFORM_LABELS } from "@/lib/social-accounts-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function DraftsView() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["social-posts", "draft"],
    queryFn: () => fetchSocialPosts("draft"),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["social-posts"] });

  const publishMutation = useMutation({
    mutationFn: publishSocialPostNow,
    onSuccess: () => {
      toast.success("Queued for publishing.");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't publish this post."),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSocialPost,
    onSuccess: () => {
      toast.success("Draft deleted.");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't delete this draft."),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(ids.map((id) => deleteSocialPost(id)));
      const failed = results.filter((r) => r.status === "rejected").length;
      return { total: ids.length, failed };
    },
    onSuccess: ({ total, failed }) => {
      toast.success(failed > 0 ? `Deleted ${total - failed} of ${total} — ${failed} failed.` : `Deleted ${total} drafts.`);
      setSelected(new Set());
      invalidate();
    },
  });

  const bulkPublishMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(ids.map((id) => publishSocialPostNow(id)));
      const failed = results.filter((r) => r.status === "rejected").length;
      return { total: ids.length, failed };
    },
    onSuccess: ({ total, failed }) => {
      toast.success(failed > 0 ? `Queued ${total - failed} of ${total} — ${failed} failed.` : `Queued ${total} drafts for publishing.`);
      setSelected(new Set());
      invalidate();
    },
  });

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!data) return;
    setSelected((prev) => (prev.size === data.length ? new Set() : new Set(data.map((p) => p.id))));
  }

  const anyBulkPending = bulkDeleteMutation.isPending || bulkPublishMutation.isPending;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg">Drafts</h1>
          <p className="mt-0.5 text-sm text-fg-muted">Posts saved but not yet scheduled or published.</p>
        </div>
        <Link href="/social/create">
          <Button>
            <Plus className="h-4 w-4" aria-hidden />
            New post
          </Button>
        </Link>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load drafts" onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={FileEdit}
          title="No drafts yet"
          description="Save a post without scheduling it to see it here."
          action={{ label: "Create a post", onClick: () => (window.location.href = "/social/create") }}
        />
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between rounded-[var(--radius-sm)] bg-surface-2 px-3 py-2">
            <label className="flex items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                checked={selected.size === data.length}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-border-strong accent-primary"
              />
              {selected.size > 0 ? `${selected.size} selected` : "Select all"}
            </label>
            {selected.size > 0 && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => bulkDeleteMutation.mutate([...selected])}
                  disabled={anyBulkPending}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Delete selected
                </Button>
                <Button size="sm" onClick={() => bulkPublishMutation.mutate([...selected])} disabled={anyBulkPending}>
                  <Send className="h-3.5 w-3.5" aria-hidden />
                  Publish selected
                </Button>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            {data.map((post) => (
              <div key={post.id} className="flex gap-3 rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
                <input
                  type="checkbox"
                  checked={selected.has(post.id)}
                  onChange={() => toggleSelect(post.id)}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-border-strong accent-primary"
                />
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap text-sm text-fg">
                    {post.caption || <span className="text-fg-faint">(no caption)</span>}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {post.targets.map((t) => (
                      <Badge key={t.id} tone="neutral">
                        {SOCIAL_PLATFORM_LABELS[t.platform]}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <Link href={`/social/create?id=${post.id}`}>
                      <Button variant="outline" size="sm">
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                        Edit
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteMutation.mutate(post.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      Delete
                    </Button>
                    <Button size="sm" onClick={() => publishMutation.mutate(post.id)} disabled={publishMutation.isPending}>
                      <Send className="h-3.5 w-3.5" aria-hidden />
                      Publish now
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Send, MailOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { EmptyState } from "@/components/shared/empty-state";
import { fetchSocialInbox, replySocialInboxItem, markSocialInboxItemRead, type SocialInboxStatus } from "@/lib/social-inbox-api";
import { SOCIAL_PLATFORM_LABELS } from "@/lib/social-accounts-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const FILTERS: { key: SocialInboxStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "read", label: "Read" },
  { key: "replied", label: "Replied" },
];

export function InboxView() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<SocialInboxStatus | "all">("all");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["social-inbox", filter],
    queryFn: () => fetchSocialInbox(filter === "all" ? undefined : filter),
  });

  const replyMutation = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => replySocialInboxItem(id, text),
    onSuccess: (_data, { id }) => {
      toast.success("Reply sent.");
      setReplyDrafts((prev) => ({ ...prev, [id]: "" }));
      void queryClient.invalidateQueries({ queryKey: ["social-inbox"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send that reply."),
  });

  const readMutation = useMutation({
    mutationFn: markSocialInboxItemRead,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["social-inbox"] }),
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-fg">Social Inbox</h1>
        <p className="mt-0.5 text-sm text-fg-muted">Comments and messages from every connected platform, in one queue.</p>
      </div>

      <div className="mb-4 flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium",
              filter === f.key ? "border-primary bg-primary/10 text-primary" : "border-border-strong text-fg hover:bg-surface-2",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load the inbox" onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState icon={Inbox} title="Nothing here" description="Comments and DMs will show up once accounts are connected." />
      ) : (
        <div className="flex flex-col gap-3">
          {data.map((item) => (
            <div key={item.id} className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge tone="neutral">{SOCIAL_PLATFORM_LABELS[item.platform]}</Badge>
                    <span className="text-xs text-fg-faint">{item.kind}</span>
                    {item.status === "unread" && <Badge tone="primary">New</Badge>}
                  </div>
                  <p className="mt-1 text-sm font-medium text-fg">{item.authorName ?? "Unknown"}</p>
                  <p className="text-sm text-fg-muted">{item.text}</p>
                </div>
                {item.status === "unread" && (
                  <Button variant="ghost" size="sm" onClick={() => readMutation.mutate(item.id)}>
                    <MailOpen className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                )}
              </div>

              {item.repliedText ? (
                <div className="mt-3 rounded-[var(--radius-sm)] bg-surface-2 p-2.5">
                  <p className="text-xs font-medium text-fg-muted">Your reply</p>
                  <p className="text-sm text-fg">{item.repliedText}</p>
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <Input
                    value={replyDrafts[item.id] ?? ""}
                    onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    placeholder="Write a reply…"
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={() => replyMutation.mutate({ id: item.id, text: replyDrafts[item.id] ?? "" })}
                    disabled={!replyDrafts[item.id]?.trim() || replyMutation.isPending}
                  >
                    <Send className="h-3.5 w-3.5" aria-hidden />
                    Reply
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

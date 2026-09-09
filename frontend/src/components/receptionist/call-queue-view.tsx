"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Check, PhoneForwarded, ListChecks, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { EmptyState } from "@/components/shared/empty-state";
import { fetchVoiceQueue, takeQueueItem, offerQueueCallback, clearVoiceQueue } from "@/lib/voice-queue-api";
import { fetchCalls } from "@/lib/voice-calls-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function CallQueueView() {
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["voice-queue"],
    queryFn: fetchVoiceQueue,
    refetchInterval: 20_000,
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["voice-queue"] });

  const takeMutation = useMutation({
    mutationFn: takeQueueItem,
    onSuccess: () => {
      toast.success("Marked handled.");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this item."),
  });

  const callbackMutation = useMutation({
    mutationFn: offerQueueCallback,
    onSuccess: () => {
      toast.success("Callback logged.");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this item."),
  });

  const clearMutation = useMutation({
    mutationFn: clearVoiceQueue,
    onSuccess: ({ cleared }) => {
      toast.success(`Cleared ${cleared} item${cleared === 1 ? "" : "s"}.`);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't clear the queue."),
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg">Call Queue</h1>
          <p className="mt-0.5 text-sm text-fg-muted">
            Calls needing human follow-up — every call is answered instantly by the AI, so this is the real work queue, not calls on
            hold.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/receptionist/settings">
            <Button variant="ghost" size="sm">
              <Settings2 className="h-3.5 w-3.5" aria-hidden />
              Hold message
            </Button>
          </Link>
          {data && data.items.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => clearMutation.mutate()} disabled={clearMutation.isPending}>
              <ListChecks className="h-3.5 w-3.5" aria-hidden />
              Clear queue
            </Button>
          )}
        </div>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load the queue" onRetry={() => refetch()} />
      ) : isPending || !data ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
              <p className="text-xs text-fg-faint">Waiting</p>
              <p className="font-display text-xl font-bold text-fg">{data.items.length}</p>
            </div>
            <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
              <p className="text-xs text-fg-faint">Estimated wait</p>
              <p className="font-display text-xl font-bold text-fg">
                {data.estimatedWaitMinutes != null ? `${data.estimatedWaitMinutes}m` : "—"}
              </p>
            </div>
          </div>

          {data.items.length === 0 ? (
            <EmptyState icon={Inbox} title="Queue is empty" description="Nothing is waiting on human follow-up right now." />
          ) : (
            <div className="mb-6 flex flex-col gap-3">
              {data.items.map((item) => (
                <div key={item.id} className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-fg-faint">#{item.position}</span>
                        <p className="text-sm font-medium text-fg">{item.fromNumber}</p>
                        {item.customIntentName && <Badge tone="primary">{item.customIntentName}</Badge>}
                        {item.callbackRequestedAt && <Badge tone="neutral">Callback offered</Badge>}
                      </div>
                      {item.lastMessage && <p className="mt-1 line-clamp-2 text-xs text-fg-muted">{item.lastMessage}</p>}
                      <p className="mt-1 text-[10px] text-fg-faint">Waiting since {timeAgo(item.startedAt)}</p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {!item.callbackRequestedAt && (
                        <Button variant="ghost" size="sm" onClick={() => callbackMutation.mutate(item.id)} disabled={callbackMutation.isPending}>
                          <PhoneForwarded className="h-3.5 w-3.5" aria-hidden />
                          Offer callback
                        </Button>
                      )}
                      <Button size="sm" onClick={() => takeMutation.mutate(item.id)} disabled={takeMutation.isPending}>
                        <Check className="h-3.5 w-3.5" aria-hidden />
                        Take
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <QueueDepthChart />
        </>
      )}
    </div>
  );
}

/** Real hour-of-day distribution of every queue-eligible call (missed/message/custom) in history — not a fabricated pattern. */
function QueueDepthChart() {
  const { data: calls, isPending } = useQuery({ queryKey: ["voice-calls"], queryFn: fetchCalls });

  if (isPending || !calls) return null;

  const eligible = calls.filter((c) => c.status === "missed" || c.outcome === "message" || c.outcome === "custom");
  const byHour = Array.from({ length: 24 }, () => 0);
  for (const call of eligible) {
    byHour[new Date(call.startedAt).getHours()] += 1;
  }
  const max = Math.max(...byHour, 1);

  if (eligible.length === 0) return null;

  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
      <p className="mb-3 text-sm font-medium text-fg">Queue depth by hour of day</p>
      <div className="flex h-24 items-end gap-1">
        {byHour.map((count, hour) => (
          <div key={hour} className="flex flex-1 flex-col items-center gap-1" title={`${hour}:00 — ${count} call(s)`}>
            <div className="w-full rounded-t bg-primary" style={{ height: `${Math.max(4, (count / max) * 100)}%` }} />
            {hour % 6 === 0 && <span className="text-[9px] text-fg-faint">{hour}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

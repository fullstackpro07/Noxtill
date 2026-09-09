"use client";

import { useQuery } from "@tanstack/react-query";
import { PhoneMissed, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { EmptyState } from "@/components/shared/empty-state";
import { fetchMissedCalls } from "@/lib/voice-calls-api";
import { formatDate, formatTime } from "@/lib/format";

export function MissedCallsView() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["voice-missed-calls"],
    queryFn: fetchMissedCalls,
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-fg">Missed Calls</h1>
        <p className="mt-0.5 text-sm text-fg-muted">
          A WhatsApp recovery message is sent automatically to every missed caller — per-message delivery status isn&apos;t tracked
          individually, only that it was attempted.
        </p>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load missed calls" onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState icon={PhoneMissed} title="No missed calls" description="Every call so far has been answered by the AI receptionist." />
      ) : (
        <div className="flex flex-col gap-3">
          {data.map((call) => (
            <div key={call.id} className="flex items-center justify-between gap-3 rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
              <div>
                <p className="text-sm font-medium text-fg">{call.fromNumber}</p>
                <p className="text-xs text-fg-faint">
                  {formatDate(call.startedAt)} · {formatTime(call.startedAt)}
                </p>
              </div>
              <Badge tone="neutral">
                <MessageCircle className="h-3 w-3" aria-hidden />
                Recovery message sent
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

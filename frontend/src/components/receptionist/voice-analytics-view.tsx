"use client";

import { useQuery } from "@tanstack/react-query";
import { Phone, Clock, CalendarCheck, MessageSquare } from "lucide-react";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { fetchVoiceAnalytics, type PhoneCallOutcome, type PhoneCallStatus } from "@/lib/voice-calls-api";

const OUTCOME_LABEL: Record<PhoneCallOutcome, string> = {
  none: "No outcome yet",
  booking: "Booked",
  message: "Message taken",
  transfer: "Transferred",
  custom: "Custom intent",
};

const STATUS_LABEL: Record<PhoneCallStatus, string> = {
  in_progress: "In progress",
  completed: "Completed",
  missed: "Missed",
  transferred: "Transferred",
};

export function VoiceAnalyticsView() {
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["voice-analytics"], queryFn: fetchVoiceAnalytics });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-fg">Call Analytics</h1>
        <p className="mt-0.5 text-sm text-fg-muted">Real aggregates over your full call history.</p>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load analytics" onRetry={() => refetch()} />
      ) : isPending || !data ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard icon={Phone} label="Total calls" value={data.totalCalls.toLocaleString()} />
            <StatCard icon={CalendarCheck} label="Booked" value={data.byOutcome.booking.toLocaleString()} />
            <StatCard icon={Clock} label="Avg. duration" value={`${Math.floor(data.averageDurationSeconds / 60)}m ${data.averageDurationSeconds % 60}s`} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
              <p className="mb-3 text-sm font-medium text-fg">By status</p>
              <div className="flex flex-col gap-2">
                {(Object.keys(data.byStatus) as PhoneCallStatus[]).map((status) => (
                  <BreakdownRow key={status} label={STATUS_LABEL[status]} count={data.byStatus[status]} total={data.totalCalls} />
                ))}
              </div>
            </div>
            <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
              <p className="mb-3 flex items-center gap-1.5 text-sm font-medium text-fg">
                <MessageSquare className="h-4 w-4 text-fg-faint" aria-hidden />
                By outcome
              </p>
              <div className="flex flex-col gap-2">
                {(Object.keys(data.byOutcome) as PhoneCallOutcome[]).map((outcome) => (
                  <BreakdownRow key={outcome} label={OUTCOME_LABEL[outcome]} count={data.byOutcome[outcome]} total={data.totalCalls} />
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <div className="flex items-center gap-2 text-xs text-fg-faint">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </div>
      <p className="mt-1 font-display text-xl font-bold text-fg">{value}</p>
    </div>
  );
}

function BreakdownRow({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-32 shrink-0 text-xs text-fg-muted">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 shrink-0 text-end text-xs tabular-nums text-fg">{count}</span>
    </div>
  );
}

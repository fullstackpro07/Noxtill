"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonCard, Skeleton } from "@/components/shared/skeleton";
import { HourlyBarChart } from "./hourly-bar-chart";
import { WeekdayHeatStrip } from "./weekday-heat-strip";
import { DeadHoursOfferDialog } from "./dead-hours-offer-dialog";
import { fetchProfitByTime } from "@/lib/profit-api";
import { formatHour } from "@/lib/profit";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <span className="text-xs font-medium text-fg-faint">{label}</span>
      <p className="mt-1 font-display text-xl font-bold text-fg">{value}</p>
    </div>
  );
}

export function TimeAnalysisView({ currency }: { currency: string }) {
  const [offerOpen, setOfferOpen] = useState(false);
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["profit-time"], queryFn: fetchProfitByTime });

  if (isError) {
    return <ErrorBanner title="Couldn't load time-of-day profit" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  const peakHour = data && data.hourly.length ? data.hourly.reduce((max, h) => (h.revenue > max.revenue ? h : max)) : null;
  const peakDay = data && data.weekday.length ? data.weekday.reduce((max, w) => (w.revenue > max.revenue ? w : max)) : null;
  const slowestDay = data && data.weekday.length ? data.weekday.reduce((min, w) => (w.revenue < min.revenue ? w : min)) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {isPending || !data ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard label="Peak hour" value={peakHour ? formatHour(peakHour.hour) : "—"} />
            <StatCard label="Peak day" value={peakDay ? peakDay.day : "—"} />
            <StatCard label="Slowest day" value={slowestDay ? slowestDay.day : "—"} />
          </>
        )}
      </div>

      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-fg">Revenue by hour — all time</p>
          {!isPending && data && data.hourly.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setOfferOpen(true)}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Dead-hours offer
            </Button>
          )}
        </div>

        {isPending || !data ? (
          <Skeleton className="h-48 w-full" />
        ) : data.hourly.length === 0 ? (
          <EmptyState icon={Clock} title="Not enough sales yet" description="Once you have completed sales, this chart fills in." />
        ) : (
          <HourlyBarChart data={data.hourly} currency={currency} />
        )}
      </div>

      {!isPending && data && data.weekday.length > 0 && (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
          <p className="mb-4 text-sm font-medium text-fg">Revenue by day of week</p>
          <WeekdayHeatStrip data={data.weekday} currency={currency} />
        </div>
      )}

      {!isPending && data && data.hourly.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-[var(--radius-sm)] bg-primary/6 px-3.5 py-3 text-sm text-fg">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          {data.insight}
        </div>
      )}

      {offerOpen && <DeadHoursOfferDialog onClose={() => setOfferOpen(false)} />}
    </div>
  );
}

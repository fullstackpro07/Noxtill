"use client";

import { useQuery } from "@tanstack/react-query";
import { Lightbulb, Clock } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { Skeleton } from "@/components/shared/skeleton";
import { HourlyBarChart } from "./hourly-bar-chart";
import { fetchProfitByTime } from "@/lib/profit-api";

export function ProfitTimeTab({ currency }: { currency: string }) {
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["profit-time"], queryFn: fetchProfitByTime });

  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
      <p className="mb-4 text-sm font-medium text-fg">Revenue by hour — all time</p>

      {isError ? (
        <ErrorBanner title="Couldn't load time-of-day profit" description="Check your connection and try again." onRetry={() => refetch()} />
      ) : isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : data.hourly.length === 0 ? (
        <EmptyState icon={Clock} title="Not enough sales yet" description="Once you have completed sales, this chart fills in." />
      ) : (
        <>
          <HourlyBarChart data={data.hourly} currency={currency} />
          <div className="mt-5 flex items-start gap-2.5 rounded-[var(--radius-sm)] bg-primary/6 px-3.5 py-3 text-sm text-fg">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            {data.insight}
          </div>
        </>
      )}
    </div>
  );
}

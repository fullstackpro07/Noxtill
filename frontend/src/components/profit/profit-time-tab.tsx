"use client";

import { Lightbulb } from "lucide-react";
import { HourlyBarChart } from "./hourly-bar-chart";
import { HOURLY_REVENUE, peakHourInsight } from "@/lib/profit";

export function ProfitTimeTab({ currency }: { currency: string }) {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
      <p className="mb-4 text-sm font-medium text-fg">Revenue by hour — today</p>
      <HourlyBarChart currency={currency} />
      <div className="mt-5 flex items-start gap-2.5 rounded-[var(--radius-sm)] bg-primary/6 px-3.5 py-3 text-sm text-fg">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        {peakHourInsight(HOURLY_REVENUE)}
      </div>
    </div>
  );
}

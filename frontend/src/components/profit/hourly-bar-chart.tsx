"use client";

import { HOURLY_REVENUE, formatHour } from "@/lib/profit";
import { formatCurrency } from "@/lib/format";

export function HourlyBarChart({ currency }: { currency: string }) {
  const max = Math.max(...HOURLY_REVENUE.map((d) => d.revenue));
  const peak = HOURLY_REVENUE.reduce((m, d) => (d.revenue > m.revenue ? d : m), HOURLY_REVENUE[0]);

  return (
    <div className="flex h-48 items-end gap-2">
      {HOURLY_REVENUE.map((d) => {
        const heightPct = max > 0 ? (d.revenue / max) * 100 : 0;
        const isPeak = d.hour === peak.hour;
        return (
          <div key={d.hour} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="relative flex h-36 w-full items-end">
              <div
                title={`${formatHour(d.hour)} — ${formatCurrency(d.revenue, currency)}`}
                style={{ height: `${heightPct}%` }}
                className={`w-full rounded-t-[4px] transition-opacity hover:opacity-80 ${isPeak ? "bg-chart-1" : "bg-chart-1/50"}`}
              />
              {isPeak && (
                <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium tabular-nums text-fg">
                  {formatCurrency(d.revenue, currency)}
                </span>
              )}
            </div>
            <span className="text-[10px] text-fg-faint">{formatHour(d.hour)}</span>
          </div>
        );
      })}
    </div>
  );
}

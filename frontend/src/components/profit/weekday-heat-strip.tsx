"use client";

import type { WeekdayRevenue } from "@/lib/profit-api";
import { formatCurrency } from "@/lib/format";

const DISPLAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SHORT_LABEL: Record<string, string> = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun",
};

/** Real `weekday` data from /profit/time — computed server-side since UPD-BE-078, but never rendered until now (UPD-FE-096). */
export function WeekdayHeatStrip({ data, currency }: { data: WeekdayRevenue[]; currency: string }) {
  const byDay = new Map(data.map((d) => [d.day, d.revenue]));
  const max = Math.max(1, ...data.map((d) => d.revenue));
  const deadDay = data.length ? data.reduce((min, w) => (w.revenue < min.revenue ? w : min)) : null;

  return (
    <div className="grid grid-cols-7 gap-2">
      {DISPLAY_ORDER.map((day) => {
        const revenue = byDay.get(day) ?? 0;
        const intensity = max > 0 ? Math.round((revenue / max) * 100) : 0;
        const isDead = deadDay?.day === day && revenue > 0;
        return (
          <div key={day} className="flex flex-col items-center gap-1.5">
            <div
              title={`${day} — ${formatCurrency(revenue, currency)}`}
              className="flex h-16 w-full items-end justify-center rounded-[6px] pb-1"
              style={{ backgroundColor: `color-mix(in srgb, var(--chart-1) ${intensity}%, var(--surface-2))` }}
            >
              {isDead && <span className="text-[9px] font-medium text-fg">slowest</span>}
            </div>
            <span className="text-[10px] text-fg-faint">{SHORT_LABEL[day]}</span>
          </div>
        );
      })}
    </div>
  );
}

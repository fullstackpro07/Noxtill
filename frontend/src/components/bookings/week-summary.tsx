"use client";

import { weekDates } from "@/lib/bookings";
import { cn } from "@/lib/utils";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function WeekSummary({
  anchor,
  appointments,
  onSelectDate,
}: {
  anchor: string;
  appointments: { date: string }[];
  onSelectDate: (date: string) => void;
}) {
  const dates = weekDates(anchor);

  return (
    <div className="grid grid-cols-7 gap-2">
      {dates.map((date, i) => {
        const dayAppointments = appointments.filter((a) => a.date === date);
        const isToday = date === anchor;
        return (
          <button
            key={date}
            onClick={() => onSelectDate(date)}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-[var(--radius-noxtill)] border p-3 text-center transition-colors",
              isToday ? "border-primary bg-primary/6" : "border-border hover:bg-surface-2/50",
            )}
          >
            <span className="text-xs font-medium text-fg-faint">{DAY_LABELS[i]}</span>
            <span className="font-display text-lg font-bold text-fg">{Number(date.slice(-2))}</span>
            <span className="text-xs text-fg-muted">{dayAppointments.length} booked</span>
          </button>
        );
      })}
    </div>
  );
}

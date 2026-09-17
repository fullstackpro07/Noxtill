"use client";

import { weekDates } from "@/lib/bookings";

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
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid grid-cols-7 gap-2">
      {dates.map((date, i) => {
        const dayAppointments = appointments.filter((a) => a.date === date);
        const isSelected = date === anchor;
        const isToday = date === today;
        return (
          <button
            key={date}
            onClick={() => onSelectDate(date)}
            className="flex flex-col items-center gap-1.5 rounded-[14px] p-3 text-center"
            style={{
              border: isSelected ? "1.5px solid var(--app-primary)" : "1px solid var(--app-border)",
              background: isSelected ? "var(--app-success-bg)" : "var(--app-surface)",
            }}
          >
            <span className="text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>{DAY_LABELS[i]}</span>
            <span className="text-[18px] font-extrabold" style={{ color: isToday ? "var(--app-primary)" : "var(--app-text)" }}>{Number(date.slice(-2))}</span>
            <span className="text-[11px] font-semibold" style={{ color: "var(--app-text-faint)" }}>{dayAppointments.length} booked</span>
          </button>
        );
      })}
    </div>
  );
}

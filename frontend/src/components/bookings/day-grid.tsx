"use client";

import { useDroppable } from "@dnd-kit/core";
import { AppointmentBlock } from "./appointment-block";
import { WORKING_HOURS } from "@/lib/bookings";
import type { LiveAppointment } from "@/lib/bookings-api";
import type { BookingStaffOption } from "@/lib/staff-api";
import { formatHour } from "@/lib/profit";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 56;
/**
 * Two lines of text-xs/leading-tight (~15px each = 30px) plus the button's own py-1 (8px) plus this
 * wrapper's p-0.5 (4px) = 42px minimum — anything shorter silently clips the second line's
 * descenders instead of showing an ellipsis, since flex items shrink below content size by default.
 */
const MIN_BLOCK_HEIGHT = 44;
const STAFF_COLOR_PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const UNASSIGNED_ID = "unassigned";
const UNASSIGNED_COLOR = "var(--fg-faint)";

function HourCell({ columnId, hour }: { columnId: string; hour: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${columnId}:${hour}` });
  return (
    <div ref={setNodeRef} style={{ height: ROW_HEIGHT }} className={cn("border-b border-border", isOver && "bg-primary/8")} />
  );
}

function Column({
  id,
  label,
  color,
  appointments,
  onSelect,
  shakingId,
  droppable = true,
}: {
  id: string;
  label: string;
  color: string;
  appointments: LiveAppointment[];
  onSelect: (appointment: LiveAppointment) => void;
  shakingId: string | null;
  droppable?: boolean;
}) {
  return (
    <div className="min-w-36 flex-1 border-e border-border last:border-e-0">
      <div className="flex items-center justify-center border-b border-border px-2 text-sm font-medium text-fg" style={{ height: ROW_HEIGHT }}>
        {label}
      </div>
      <div className="relative">
        {WORKING_HOURS.map((hour) =>
          droppable ? (
            <HourCell key={hour} columnId={id} hour={hour} />
          ) : (
            <div key={hour} className="border-b border-border" style={{ height: ROW_HEIGHT }} />
          ),
        )}
        {appointments.map((a) => (
          <div
            key={a.id}
            className="absolute inset-x-0.5 p-0.5"
            style={{
              top: (a.startHour - WORKING_HOURS[0]) * ROW_HEIGHT,
              height: Math.max(a.durationHours * ROW_HEIGHT, MIN_BLOCK_HEIGHT),
            }}
          >
            <AppointmentBlock appointment={a} color={color} onSelect={onSelect} shaking={shakingId === a.id} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DayGrid({
  appointments,
  staff,
  onSelect,
  shakingId,
}: {
  appointments: LiveAppointment[];
  staff: BookingStaffOption[];
  onSelect: (appointment: LiveAppointment) => void;
  shakingId: string | null;
}) {
  // Walk-ins/bookings with no staff assigned ("Any available") would otherwise render nowhere —
  // give them their own column instead of silently disappearing from the calendar.
  const unassigned = appointments.filter((a) => !a.staffId || !staff.some((s) => s.id === a.staffId));

  return (
    <div className="flex overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
      <div className="w-14 shrink-0 border-e border-border">
        <div className="border-b border-border" style={{ height: ROW_HEIGHT }} />
        {WORKING_HOURS.map((hour) => (
          <div key={hour} className="flex items-start justify-end border-b border-border pe-2 pt-1 text-xs text-fg-faint" style={{ height: ROW_HEIGHT }}>
            {formatHour(hour)}
          </div>
        ))}
      </div>

      {unassigned.length > 0 && (
        <Column
          id={UNASSIGNED_ID}
          label="Unassigned"
          color={UNASSIGNED_COLOR}
          appointments={unassigned}
          onSelect={onSelect}
          shakingId={shakingId}
          droppable={false}
        />
      )}

      {staff.map((s, i) => (
        <Column
          key={s.id}
          id={s.id}
          label={s.name}
          color={STAFF_COLOR_PALETTE[i % STAFF_COLOR_PALETTE.length]}
          appointments={appointments.filter((a) => a.staffId === s.id)}
          onSelect={onSelect}
          shakingId={shakingId}
        />
      ))}
    </div>
  );
}

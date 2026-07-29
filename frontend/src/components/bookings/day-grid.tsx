"use client";

import { useDroppable } from "@dnd-kit/core";
import { AppointmentBlock } from "./appointment-block";
import { WORKING_HOURS, type Appointment } from "@/lib/bookings";
import { STAFF } from "@/lib/staff";
import { formatHour } from "@/lib/profit";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 56;

function HourCell({ staffId, hour }: { staffId: string; hour: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${staffId}:${hour}` });
  return (
    <div ref={setNodeRef} style={{ height: ROW_HEIGHT }} className={cn("border-b border-border", isOver && "bg-primary/8")} />
  );
}

export function DayGrid({
  appointments,
  onSelect,
  shakingId,
}: {
  appointments: Appointment[];
  onSelect: (appointment: Appointment) => void;
  shakingId: string | null;
}) {
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

      {STAFF.map((staff) => (
        <div key={staff.id} className="min-w-36 flex-1 border-e border-border last:border-e-0">
          <div className="flex items-center justify-center border-b border-border px-2 text-sm font-medium text-fg" style={{ height: ROW_HEIGHT }}>
            {staff.name}
          </div>
          <div className="relative">
            {WORKING_HOURS.map((hour) => (
              <HourCell key={hour} staffId={staff.id} hour={hour} />
            ))}
            {appointments
              .filter((a) => a.staffId === staff.id)
              .map((a) => (
                <div
                  key={a.id}
                  className="absolute inset-x-0.5 p-0.5"
                  style={{ top: (a.startHour - WORKING_HOURS[0]) * ROW_HEIGHT, height: a.durationHours * ROW_HEIGHT }}
                >
                  <AppointmentBlock appointment={a} onSelect={onSelect} shaking={shakingId === a.id} />
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

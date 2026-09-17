"use client";

import { useDroppable } from "@dnd-kit/core";
import { AppointmentBlock } from "./appointment-block";
import { WORKING_HOURS } from "@/lib/bookings";
import type { LiveAppointment } from "@/lib/bookings-api";
import type { BookingStaffOption } from "@/lib/staff-api";
import { formatHour } from "@/lib/profit";

const ROW_HEIGHT = 56;
const MIN_BLOCK_HEIGHT = 46;
const UNASSIGNED_ID = "unassigned";

export interface CalendarBlockRange {
  staffUserId: string;
  startHour: number;
  durationHours: number;
  label: string;
}

function HourCell({ columnId, hour }: { columnId: string; hour: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${columnId}:${hour}` });
  return <div ref={setNodeRef} style={{ height: ROW_HEIGHT, borderBottom: "1px solid var(--app-border)", background: isOver ? "rgba(18,161,80,.06)" : undefined }} />;
}

function Column({
  id,
  label,
  appointments,
  blocks,
  onSelect,
  shakingId,
  droppable = true,
}: {
  id: string;
  label: string;
  appointments: LiveAppointment[];
  blocks: CalendarBlockRange[];
  onSelect: (appointment: LiveAppointment) => void;
  shakingId: string | null;
  droppable?: boolean;
}) {
  return (
    <div className="min-w-[140px] flex-1" style={{ borderInlineEnd: "1px solid var(--app-border)" }}>
      <div className="flex items-center justify-center px-2 text-[12.5px] font-extrabold" style={{ height: ROW_HEIGHT, borderBottom: "1px solid var(--app-border)", color: "var(--app-text)" }}>
        {label}
      </div>
      <div className="relative">
        {WORKING_HOURS.map((hour) => (droppable ? <HourCell key={hour} columnId={id} hour={hour} /> : <div key={hour} style={{ height: ROW_HEIGHT, borderBottom: "1px solid var(--app-border)" }} />))}

        {blocks.map((b, i) => (
          <div
            key={`block-${i}`}
            className="absolute inset-x-0.5 flex items-center justify-center rounded-[9px] p-0.5 text-center text-[10.5px] font-bold"
            style={{
              top: (b.startHour - WORKING_HOURS[0]) * ROW_HEIGHT,
              height: Math.max(b.durationHours * ROW_HEIGHT, MIN_BLOCK_HEIGHT),
              background: "repeating-linear-gradient(45deg,var(--app-surface-2),var(--app-surface-2) 5px,var(--app-border) 5px,var(--app-border) 10px)",
              color: "var(--app-text-faint)",
            }}
          >
            {b.label}
          </div>
        ))}

        {appointments.map((a) => (
          <div
            key={a.id}
            className="absolute inset-x-0.5 p-0.5"
            style={{
              top: (a.startHour - WORKING_HOURS[0]) * ROW_HEIGHT,
              height: Math.max(a.durationHours * ROW_HEIGHT, MIN_BLOCK_HEIGHT),
            }}
          >
            <AppointmentBlock appointment={a} onSelect={onSelect} shaking={shakingId === a.id} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DayGrid({
  appointments,
  staff,
  blocks = [],
  onSelect,
  shakingId,
}: {
  appointments: LiveAppointment[];
  staff: BookingStaffOption[];
  blocks?: CalendarBlockRange[];
  onSelect: (appointment: LiveAppointment) => void;
  shakingId: string | null;
}) {
  const unassigned = appointments.filter((a) => !a.staffId || !staff.some((s) => s.id === a.staffId));

  return (
    <div className="flex overflow-x-auto rounded-[14px]" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)" }}>
      <div className="w-14 shrink-0" style={{ borderInlineEnd: "1px solid var(--app-border)" }}>
        <div style={{ height: ROW_HEIGHT, borderBottom: "1px solid var(--app-border)" }} />
        {WORKING_HOURS.map((hour) => (
          <div key={hour} className="flex items-start justify-end pe-2 pt-1 text-[11px] font-bold" style={{ height: ROW_HEIGHT, borderBottom: "1px solid var(--app-border)", color: "var(--app-text-disabled)" }}>
            {formatHour(hour)}
          </div>
        ))}
      </div>

      {unassigned.length > 0 && (
        <Column id={UNASSIGNED_ID} label="Unassigned" appointments={unassigned} blocks={[]} onSelect={onSelect} shakingId={shakingId} droppable={false} />
      )}

      {staff.map((s) => (
        <Column
          key={s.id}
          id={s.id}
          label={s.name}
          appointments={appointments.filter((a) => a.staffId === s.id)}
          blocks={blocks.filter((b) => b.staffUserId === s.id)}
          onSelect={onSelect}
          shakingId={shakingId}
        />
      ))}
    </div>
  );
}

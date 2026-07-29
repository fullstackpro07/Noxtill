"use client";

import { useDraggable } from "@dnd-kit/core";
import type { Appointment } from "@/lib/bookings";
import { staffById } from "@/lib/staff";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<Appointment["status"], string> = {
  confirmed: "",
  completed: "opacity-70",
  cancelled: "opacity-50 line-through",
  no_show: "opacity-60 border-dashed",
};

export function AppointmentBlock({
  appointment,
  onSelect,
  shaking,
}: {
  appointment: Appointment;
  onSelect: (appointment: Appointment) => void;
  shaking: boolean;
}) {
  const staff = staffById(appointment.staffId);
  const draggable = appointment.status === "confirmed";
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: appointment.id,
    disabled: !draggable,
  });

  return (
    <button
      ref={setNodeRef}
      {...(draggable ? listeners : {})}
      {...(draggable ? attributes : {})}
      onClick={() => onSelect(appointment)}
      style={{
        borderColor: staff?.color,
        backgroundColor: `color-mix(in srgb, ${staff?.color ?? "var(--chart-1)"} 14%, transparent)`,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
      className={cn(
        "flex h-full w-full flex-col justify-center rounded-[6px] border-s-4 px-2 py-1 text-start text-xs leading-tight text-fg transition-opacity",
        draggable && "cursor-grab touch-none active:cursor-grabbing",
        isDragging && "z-20 opacity-80 shadow-[var(--shadow-md)]",
        shaking && "animate-shake",
        STATUS_STYLE[appointment.status],
      )}
    >
      <span className="truncate font-medium">{appointment.customerName}</span>
      <span className="truncate text-fg-faint">{appointment.serviceName}</span>
    </button>
  );
}

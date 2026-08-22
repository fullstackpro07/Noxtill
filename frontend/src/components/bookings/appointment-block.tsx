"use client";

import { useDraggable } from "@dnd-kit/core";
import { User } from "lucide-react";
import type { LiveAppointment } from "@/lib/bookings-api";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<LiveAppointment["status"], string> = {
  requested: "border-dashed",
  booked: "border-dashed",
  confirmed: "",
  completed: "opacity-70",
  cancelled: "opacity-50 line-through",
  no_show: "opacity-60 border-dashed",
};

/** Opacity/strikethrough alone reads as a rendering glitch at this size — spell out the status too. */
const STATUS_LABEL: Partial<Record<LiveAppointment["status"], string>> = {
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

export function AppointmentBlock({
  appointment,
  color,
  onSelect,
  shaking,
}: {
  appointment: LiveAppointment;
  color?: string;
  onSelect: (appointment: LiveAppointment) => void;
  shaking: boolean;
}) {
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
        borderColor: color,
        backgroundColor: `color-mix(in srgb, ${color ?? "var(--chart-1)"} 14%, transparent)`,
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
      <span className="flex shrink-0 items-center gap-1 truncate font-medium">
        <User className="h-3 w-3 shrink-0 text-fg-faint" aria-hidden />
        <span className="truncate">{appointment.customerName}</span>
      </span>
      <span className="shrink-0 truncate text-fg-faint">
        {appointment.serviceName}
        {STATUS_LABEL[appointment.status] && ` · ${STATUS_LABEL[appointment.status]}`}
      </span>
    </button>
  );
}

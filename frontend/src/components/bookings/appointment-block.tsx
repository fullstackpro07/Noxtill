"use client";

import { useDraggable } from "@dnd-kit/core";
import type { LiveAppointment } from "@/lib/bookings-api";
import { cn } from "@/lib/utils";

/** Colors match the Calendar screen's own legend exactly: Booked = outlined, Confirmed = filled
 * green, Completed = flat grey, No-show = striped red. Cancelled/Requested aren't in the legend
 * (they don't normally sit on today's grid) but get a sensible fallback rather than crashing. */
const STATUS_STYLE: Record<LiveAppointment["status"], { bg: string; border: string; fg: string; nameColor: string; strike?: boolean }> = {
  booked: { bg: "var(--app-surface)", border: "1.5px solid var(--app-primary)", fg: "var(--app-success-text)", nameColor: "var(--app-text)" },
  requested: { bg: "var(--app-surface)", border: "1.5px dashed var(--app-border-strong)", fg: "var(--app-text-faint)", nameColor: "var(--app-text)" },
  confirmed: { bg: "var(--app-primary)", border: "1.5px solid var(--app-primary)", fg: "rgba(255,255,255,.85)", nameColor: "#fff" },
  completed: { bg: "var(--app-surface-2)", border: "1.5px solid var(--app-surface-2)", fg: "var(--app-text-faint)", nameColor: "var(--app-text-muted)" },
  no_show: { bg: "repeating-linear-gradient(45deg,#FEE4E2,#FEE4E2 3px,#FDA29B 3px,#FDA29B 6px)", border: "1.5px solid #FDA29B", fg: "#912018", nameColor: "#912018" },
  cancelled: { bg: "var(--app-surface-2)", border: "1.5px solid var(--app-surface-2)", fg: "var(--app-text-disabled)", nameColor: "var(--app-text-disabled)", strike: true },
};

const STATUS_SHORT: Record<LiveAppointment["status"], string> = {
  booked: "Booked",
  requested: "Requested",
  confirmed: "Confirmed",
  completed: "Done",
  no_show: "No-show",
  cancelled: "Cancelled",
};

export function AppointmentBlock({
  appointment,
  onSelect,
  shaking,
}: {
  appointment: LiveAppointment;
  onSelect: (appointment: LiveAppointment) => void;
  shaking: boolean;
}) {
  const draggable = appointment.status === "confirmed" || appointment.status === "booked";
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: appointment.id,
    disabled: !draggable,
  });
  const style = STATUS_STYLE[appointment.status];

  return (
    <button
      ref={setNodeRef}
      {...(draggable ? listeners : {})}
      {...(draggable ? attributes : {})}
      onClick={() => onSelect(appointment)}
      style={{
        background: style.bg,
        border: style.border,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
      className={cn(
        "flex h-full w-full flex-col gap-0.5 rounded-[9px] px-2 py-1.5 text-start transition-opacity",
        draggable && "cursor-grab touch-none active:cursor-grabbing",
        isDragging && "z-20 opacity-80 shadow-[0_6px_16px_rgba(16,24,40,.1)]",
        shaking && "animate-shake",
      )}
    >
      <span className="flex items-center gap-1">
        <span className="text-[10.5px] font-extrabold" style={{ color: style.fg }}>{appointment.startsAt ? new Date(appointment.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""}</span>
        <span className="ms-auto text-[9.5px] font-extrabold" style={{ color: style.fg, opacity: 0.85 }}>{STATUS_SHORT[appointment.status]}</span>
      </span>
      <span className="truncate text-[11.5px] font-bold" style={{ color: style.nameColor, textDecoration: style.strike ? "line-through" : "none" }}>
        {appointment.customerName}
      </span>
      <span className="truncate text-[10px]" style={{ color: style.fg, opacity: 0.9 }}>{appointment.serviceName}</span>
    </button>
  );
}

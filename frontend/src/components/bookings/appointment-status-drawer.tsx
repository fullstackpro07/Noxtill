"use client";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { canTransition, type AppointmentStatus } from "@/lib/bookings";
import type { LiveAppointment } from "@/lib/bookings-api";
import { formatHour } from "@/lib/profit";
import { formatDate } from "@/lib/format";

const STATUS_TONE: Record<AppointmentStatus, "primary" | "success" | "neutral" | "danger"> = {
  booked: "neutral",
  confirmed: "primary",
  completed: "success",
  cancelled: "neutral",
  no_show: "danger",
};

const STATUS_ACTIONS: { to: AppointmentStatus; label: string }[] = [
  { to: "confirmed", label: "Confirm appointment" },
  { to: "completed", label: "Mark completed" },
  { to: "no_show", label: "Mark no-show" },
  { to: "cancelled", label: "Cancel appointment" },
];

export function AppointmentStatusDrawer({
  appointment,
  onClose,
  onStatusChange,
}: {
  appointment: LiveAppointment | null;
  onClose: () => void;
  onStatusChange: (id: string, status: AppointmentStatus) => void;
}) {
  if (!appointment) return null;

  function handleTransition(to: AppointmentStatus) {
    onStatusChange(appointment!.id, to);
    onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={appointment.customerName}
      description={`${appointment.serviceName} with ${appointment.staffName ?? "staff"}`}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between rounded-[var(--radius-sm)] bg-surface-2 px-3.5 py-2.5 text-sm">
          <span className="text-fg-muted">
            {formatDate(appointment.date)} · {formatHour(appointment.startHour)}
          </span>
          <Badge tone={STATUS_TONE[appointment.status]}>{appointment.status.replace("_", " ")}</Badge>
        </div>

        <div className="flex flex-col gap-2">
          {STATUS_ACTIONS.filter((a) => canTransition(appointment.status, a.to)).map((a) => (
            <Button key={a.to} variant={a.to === "cancelled" ? "destructive" : "outline"} onClick={() => handleTransition(a.to)}>
              {a.label}
            </Button>
          ))}
          {STATUS_ACTIONS.every((a) => !canTransition(appointment.status, a.to)) && (
            <p className="text-center text-sm text-fg-faint">This appointment is already finalized.</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}

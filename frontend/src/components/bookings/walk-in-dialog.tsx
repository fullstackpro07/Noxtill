"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { WORKING_HOURS, appointmentOccupying, type Appointment } from "@/lib/bookings";
import { STAFF } from "@/lib/staff";
import { PRODUCTS } from "@/lib/products";
import { formatHour } from "@/lib/profit";
import { toast } from "@/lib/toast";

const SERVICES = PRODUCTS.filter((p) => p.kind === "service" && p.active);

export function WalkInDialog({
  open,
  onClose,
  date,
  existingAppointments,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  existingAppointments: Appointment[];
  onCreate: (appointment: Appointment) => void;
}) {
  const [customerName, setCustomerName] = useState("");
  const [serviceId, setServiceId] = useState(SERVICES[0]?.id ?? "");
  const [staffId, setStaffId] = useState(STAFF[0].id);
  const [hour, setHour] = useState(WORKING_HOURS[0]);

  if (!open) return null;

  const service = SERVICES.find((s) => s.id === serviceId);
  const durationHours = Math.max(1, Math.ceil((service?.durationMinutes ?? 60) / 60));
  const conflict = appointmentOccupying(existingAppointments, staffId, hour);
  const canCreate = customerName.trim() !== "" && !!service && !conflict;

  function handleCreate() {
    onCreate({
      id: `walkin-${Date.now()}`,
      staffId,
      customerName: customerName.trim(),
      serviceName: service!.name,
      date,
      startHour: hour,
      durationHours,
      status: "confirmed",
    });
    toast.success(`Walk-in booked for ${customerName}.`);
    setCustomerName("");
    onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add walk-in"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!canCreate}>
            Book
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Customer name" autoFocus value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        <Select label="Service" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
          {SERVICES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.durationMinutes}m)
            </option>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-4">
          <Select label="Staff" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            {STAFF.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select label="Time" value={hour} onChange={(e) => setHour(Number(e.target.value))}>
            {WORKING_HOURS.map((h) => (
              <option key={h} value={h}>
                {formatHour(h)}
              </option>
            ))}
          </Select>
        </div>
        {conflict && <p className="text-xs text-destructive">That staff member already has {conflict.customerName} at this time.</p>}
      </div>
    </Dialog>
  );
}

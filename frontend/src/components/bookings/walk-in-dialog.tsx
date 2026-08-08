"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { WORKING_HOURS, appointmentOccupying, dateHourToIso } from "@/lib/bookings";
import { fetchStaff } from "@/lib/staff-api";
import { fetchProducts } from "@/lib/products-api";
import { createWalkInAppointment, type LiveAppointment } from "@/lib/bookings-api";
import { formatHour } from "@/lib/profit";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function WalkInDialog({
  open,
  onClose,
  date,
  existingAppointments,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  existingAppointments: LiveAppointment[];
}) {
  const queryClient = useQueryClient();
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [hour, setHour] = useState(WORKING_HOURS[0]);

  const { data: services = [] } = useQuery({
    queryKey: ["products", "service"],
    queryFn: () => fetchProducts({ kind: "service", active: true }),
    enabled: open,
  });
  const { data: staff = [] } = useQuery({
    queryKey: ["staff"],
    queryFn: fetchStaff,
    enabled: open,
  });

  // The Service <select> falls back to services[0] for display before the user ever touches it —
  // submissions must resolve through the same fallback, not the raw (possibly still-empty) state.
  const service = services.find((s) => s.id === serviceId) ?? services[0];

  const createMutation = useMutation({
    mutationFn: () =>
      createWalkInAppointment({
        serviceId: service!.id,
        staffId: staffId || undefined,
        startsAt: dateHourToIso(date, hour),
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
      }),
    onSuccess: (created) => {
      toast.success(`Walk-in booked for ${created.customerName}.`);
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      setCustomerName("");
      setCustomerPhone("");
      onClose();
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiError && err.status === 409
          ? "That slot was just taken — pick a different time."
          : err instanceof ApiError
            ? err.message
            : "Couldn't book this walk-in — please try again.",
      );
    },
  });

  if (!open) return null;

  const conflict = staffId ? appointmentOccupying(existingAppointments, staffId, hour) : undefined;
  const canCreate = customerName.trim() !== "" && customerPhone.trim() !== "" && !!service && !conflict;

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
          <Button onClick={() => createMutation.mutate()} disabled={!canCreate || createMutation.isPending}>
            {createMutation.isPending ? "Booking…" : "Book"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Customer name" autoFocus value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        <Input label="Phone number" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
        <Select label="Service" value={serviceId || services[0]?.id || ""} onChange={(e) => setServiceId(e.target.value)}>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.durationMinutes ?? 30}m)
            </option>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-4">
          <Select label="Staff" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            <option value="">Any available</option>
            {staff.map((s) => (
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

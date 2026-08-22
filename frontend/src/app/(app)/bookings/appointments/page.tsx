"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { AppointmentsListPanel } from "@/components/bookings/appointments-list-panel";

export default function BookingsAppointmentsListPage() {
  return (
    <SubscreenShell title="Appointments List">
      <AppointmentsListPanel />
    </SubscreenShell>
  );
}

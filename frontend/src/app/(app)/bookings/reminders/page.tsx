"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { BookingRemindersPanel } from "@/components/bookings/booking-reminders-panel";

export default function BookingRemindersPage() {
  return (
    <SubscreenShell title="Reminders">
      <BookingRemindersPanel />
    </SubscreenShell>
  );
}

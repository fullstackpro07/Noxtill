"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { BookingRequestsPanel } from "@/components/bookings/booking-requests-panel";

export default function BookingRequestsPage() {
  return (
    <SubscreenShell title="Booking Requests">
      <BookingRequestsPanel />
    </SubscreenShell>
  );
}

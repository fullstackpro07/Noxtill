"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { BookingLinkPanel } from "@/components/bookings/booking-link-panel";

export default function BookingLinkPage() {
  return (
    <SubscreenShell title="Booking Link & QR">
      <BookingLinkPanel />
    </SubscreenShell>
  );
}

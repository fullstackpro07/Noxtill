"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { WaitlistPanel } from "@/components/bookings/waitlist-panel";

export default function BookingsWaitlistPage() {
  return (
    <SubscreenShell title="Waiting List">
      <WaitlistPanel />
    </SubscreenShell>
  );
}

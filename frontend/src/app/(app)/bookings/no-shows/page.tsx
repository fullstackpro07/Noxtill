"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { NoShowsPanel } from "@/components/bookings/no-shows-panel";

export default function BookingsNoShowsPage() {
  return (
    <SubscreenShell title="No-Shows">
      <NoShowsPanel />
    </SubscreenShell>
  );
}

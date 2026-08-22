"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { QueuePanel } from "@/components/bookings/queue-panel";

export default function BookingsQueuePage() {
  return (
    <SubscreenShell title="Queue / Tokens">
      <QueuePanel />
    </SubscreenShell>
  );
}

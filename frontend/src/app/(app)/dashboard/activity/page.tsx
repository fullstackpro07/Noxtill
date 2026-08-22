"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { LiveActivityFeed } from "@/components/dashboard/live-activity-feed";

export default function DashboardActivityPage() {
  return (
    <SubscreenShell title="Live Activity">
      <LiveActivityFeed />
    </SubscreenShell>
  );
}

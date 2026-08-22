"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { NightlyCloseView } from "@/components/dashboard/nightly-close-view";

export default function DashboardNightlyClosePage() {
  return (
    <SubscreenShell title="Nightly Close">
      <NightlyCloseView />
    </SubscreenShell>
  );
}

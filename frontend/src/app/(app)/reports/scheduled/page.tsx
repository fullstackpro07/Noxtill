"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { ScheduledReportsView } from "@/components/reports/scheduled-reports-view";

export default function ScheduledReportsPage() {
  return (
    <SubscreenShell title="Scheduled Reports" description="Recurring reports and data exports, delivered automatically.">
      <ScheduledReportsView />
    </SubscreenShell>
  );
}

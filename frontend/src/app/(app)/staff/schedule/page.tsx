"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { ScheduleView } from "@/components/staff/schedule-view";

export default function StaffSchedulePage() {
  return (
    <SubscreenShell title="Shifts & Schedule" description="The real weekly roster — add shifts, review swap requests, and notify staff.">
      <ScheduleView />
    </SubscreenShell>
  );
}

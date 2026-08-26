"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { TimesheetsView } from "@/components/staff/timesheets-view";

export default function StaffTimesheetsPage() {
  return (
    <SubscreenShell title="Timesheets" description="Real hours and overtime, computed live from attendance — with break rules applied.">
      <TimesheetsView />
    </SubscreenShell>
  );
}

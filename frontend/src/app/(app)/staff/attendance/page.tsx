"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { AttendanceView } from "@/components/staff/attendance-view";

export default function StaffAttendancePage() {
  return (
    <SubscreenShell title="Attendance" description="Clock in/out and the real check-in history for your team.">
      <AttendanceView />
    </SubscreenShell>
  );
}

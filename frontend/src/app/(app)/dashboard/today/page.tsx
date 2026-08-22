"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { TodayBusinessView } from "@/components/dashboard/today-business-view";

export default function DashboardTodayPage() {
  return (
    <SubscreenShell title="Today's Business">
      <TodayBusinessView />
    </SubscreenShell>
  );
}

"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { HealthScoreCard } from "@/components/dashboard/health-score-card";

export default function DashboardHealthScorePage() {
  return (
    <SubscreenShell title="Health Score">
      <HealthScoreCard />
    </SubscreenShell>
  );
}

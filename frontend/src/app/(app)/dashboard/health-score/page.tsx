"use client";

import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { HealthScoreCard } from "@/components/dashboard/health-score-card";

export default function DashboardHealthScorePage() {
  return (
    <div className="flex min-h-full flex-col">
      <DashboardTabs />
      <div className="px-6 pb-7 pt-4.5">
        <HealthScoreCard />
      </div>
    </div>
  );
}

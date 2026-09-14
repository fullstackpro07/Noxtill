"use client";

import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { LiveActivityFeed } from "@/components/dashboard/live-activity-feed";

export default function DashboardActivityPage() {
  return (
    <div className="flex min-h-full flex-col">
      <DashboardTabs />
      <div className="px-6 pb-7 pt-4.5">
        <LiveActivityFeed />
      </div>
    </div>
  );
}

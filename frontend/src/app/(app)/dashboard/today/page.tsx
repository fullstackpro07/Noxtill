"use client";

import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { TodayBusinessView } from "@/components/dashboard/today-business-view";

export default function DashboardTodayPage() {
  return (
    <div className="flex min-h-full flex-col">
      <DashboardTabs />
      <div className="px-6 pb-7 pt-4.5">
        <TodayBusinessView />
      </div>
    </div>
  );
}

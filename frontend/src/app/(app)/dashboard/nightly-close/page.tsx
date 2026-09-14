"use client";

import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { NightlyCloseView } from "@/components/dashboard/nightly-close-view";

export default function DashboardNightlyClosePage() {
  return (
    <div className="flex min-h-full flex-col">
      <DashboardTabs />
      <div className="px-6 pb-7 pt-4.5">
        <NightlyCloseView />
      </div>
    </div>
  );
}

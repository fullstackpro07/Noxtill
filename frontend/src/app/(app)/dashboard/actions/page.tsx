"use client";

import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { ActionCenter } from "@/components/dashboard/action-center";

export default function DashboardActionsPage() {
  return (
    <div className="flex min-h-full flex-col">
      <DashboardTabs />
      <div className="px-6 pb-7 pt-4.5">
        <ActionCenter />
      </div>
    </div>
  );
}

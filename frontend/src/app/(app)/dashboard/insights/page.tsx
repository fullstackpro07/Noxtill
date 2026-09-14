"use client";

import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { AiInsightsFeed } from "@/components/dashboard/ai-insights-feed";

export default function DashboardInsightsPage() {
  return (
    <div className="flex min-h-full flex-col">
      <DashboardTabs />
      <div className="px-6 pb-7 pt-4.5">
        <AiInsightsFeed />
      </div>
    </div>
  );
}

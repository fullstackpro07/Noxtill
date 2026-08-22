"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { AiInsightsFeed } from "@/components/dashboard/ai-insights-feed";

export default function DashboardInsightsPage() {
  return (
    <SubscreenShell title="AI Insights">
      <AiInsightsFeed />
    </SubscreenShell>
  );
}

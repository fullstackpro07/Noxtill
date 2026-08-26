"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { AnalyticsTab } from "@/components/analytics/analytics-tab";
import { KeywordEditor } from "@/components/marketing/keyword-editor";
import { useSession } from "@/lib/session";

export default function MarketingAnalyticsPage() {
  const session = useSession();
  return (
    <SubscreenShell title="Analytics">
      <div className="flex flex-col gap-6">
        <AnalyticsTab currency={session.business.currency} />
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
          <p className="mb-3 text-sm font-medium text-fg">Tracked search keywords</p>
          <KeywordEditor />
        </div>
      </div>
    </SubscreenShell>
  );
}

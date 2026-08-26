"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { CustomerAnalyticsView } from "@/components/profit/customer-analytics-view";
import { useSession } from "@/lib/session";

export default function CustomerAnalyticsPage() {
  const session = useSession();
  return (
    <SubscreenShell title="Customer Analytics" description="New vs. returning, retention, lifetime value, and at-risk customers.">
      <CustomerAnalyticsView currency={session.business.currency} />
    </SubscreenShell>
  );
}

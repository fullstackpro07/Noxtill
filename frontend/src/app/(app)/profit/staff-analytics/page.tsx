"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { StaffAnalyticsView } from "@/components/profit/staff-analytics-view";
import { useSession } from "@/lib/session";

export default function StaffAnalyticsPage() {
  const session = useSession();
  return (
    <SubscreenShell title="Staff Analytics" description="Real sales, no-shows, and review mentions per staff member — separate from Commissions.">
      <StaffAnalyticsView currency={session.business.currency} />
    </SubscreenShell>
  );
}

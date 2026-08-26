"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { AdvancesView } from "@/components/staff/advances-view";
import { useSession } from "@/lib/session";

export default function StaffAdvancesPage() {
  const session = useSession();
  return (
    <SubscreenShell title="Advances" description="Real cash advances, auto-deducted from each staff member's next commission payout.">
      <AdvancesView currency={session.business.currency} />
    </SubscreenShell>
  );
}

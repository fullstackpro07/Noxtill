"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { DepositsPanel } from "@/components/bookings/deposits-panel";
import { useSession } from "@/lib/session";

export default function BookingsDepositsPage() {
  const session = useSession();
  return (
    <SubscreenShell title="Deposits">
      <DepositsPanel currency={session.business.currency} />
    </SubscreenShell>
  );
}

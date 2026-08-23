"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { OverduePanel } from "@/components/credit/overdue-panel";
import { useSession } from "@/lib/session";

export default function CreditOverduePage() {
  const session = useSession();
  return (
    <SubscreenShell title="Overdue">
      <OverduePanel currency={session.business.currency} />
    </SubscreenShell>
  );
}

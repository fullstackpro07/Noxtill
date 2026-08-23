"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { DueTodayPanel } from "@/components/credit/due-today-panel";
import { useSession } from "@/lib/session";

export default function CreditDueTodayPage() {
  const session = useSession();
  return (
    <SubscreenShell title="Due Today">
      <DueTodayPanel currency={session.business.currency} />
    </SubscreenShell>
  );
}

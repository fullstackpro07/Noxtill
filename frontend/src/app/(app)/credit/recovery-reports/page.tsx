"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { RecoveryReportsPanel } from "@/components/credit/recovery-reports-panel";
import { useSession } from "@/lib/session";

export default function CreditRecoveryReportsPage() {
  const session = useSession();
  return (
    <SubscreenShell title="Recovery Reports">
      <RecoveryReportsPanel currency={session.business.currency} />
    </SubscreenShell>
  );
}

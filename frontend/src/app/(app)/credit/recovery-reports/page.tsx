"use client";

import { RecoveryReportsPanel } from "@/components/credit/recovery-reports-panel";
import { useSession } from "@/lib/session";

export default function CreditRecoveryReportsPage() {
  const session = useSession();
  return <RecoveryReportsPanel currency={session.business.currency} />;
}

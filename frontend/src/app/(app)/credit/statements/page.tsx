"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { StatementsPanel } from "@/components/credit/statements-panel";
import { useSession } from "@/lib/session";

export default function CreditStatementsPage() {
  const session = useSession();
  return (
    <SubscreenShell title="Statements">
      <StatementsPanel currency={session.business.currency} />
    </SubscreenShell>
  );
}

"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { CashFlowView } from "@/components/profit/cash-flow-view";
import { useSession } from "@/lib/session";

export default function CashFlowPage() {
  const session = useSession();
  return (
    <SubscreenShell title="Cash Flow" description="A 30-day projection from your real trailing revenue/expense averages plus scheduled obligations.">
      <CashFlowView currency={session.business.currency} />
    </SubscreenShell>
  );
}

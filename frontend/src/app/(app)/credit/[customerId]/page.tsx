"use client";

import { use } from "react";
import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { LedgerDetailPanel } from "@/components/credit/ledger-detail-panel";
import { useSession } from "@/lib/session";

export default function CreditLedgerDetailPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = use(params);
  const session = useSession();
  return (
    <SubscreenShell title="Customer Ledger">
      <LedgerDetailPanel customerId={customerId} currency={session.business.currency} />
    </SubscreenShell>
  );
}

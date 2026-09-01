"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { PurchasesView } from "@/components/inventory/purchases-view";
import { useSession } from "@/lib/session";

export default function PurchasesPage() {
  const session = useSession();
  return (
    <SubscreenShell title="Purchases" description="Purchase orders to suppliers, from draft through receipt.">
      <PurchasesView currency={session.business.currency} />
    </SubscreenShell>
  );
}

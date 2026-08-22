"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { QuotationsPanel } from "@/components/orders/quotations-panel";
import { useSession } from "@/lib/session";

export default function OrdersQuotationsPage() {
  const session = useSession();
  return (
    <SubscreenShell title="Quotations">
      <QuotationsPanel currency={session.business.currency} />
    </SubscreenShell>
  );
}

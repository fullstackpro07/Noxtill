"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { ReceiptsView } from "@/components/orders/receipts-view";

export default function OrdersReceiptsPage() {
  return (
    <SubscreenShell title="Receipts">
      <ReceiptsView />
    </SubscreenShell>
  );
}

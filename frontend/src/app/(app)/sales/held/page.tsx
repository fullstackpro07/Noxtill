"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { HeldSalesView } from "@/components/pos/held-sales-view";

export default function SalesHeldPage() {
  return (
    <SubscreenShell title="Held Sales">
      <HeldSalesView />
    </SubscreenShell>
  );
}

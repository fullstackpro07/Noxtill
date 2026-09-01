"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { StockCountView } from "@/components/inventory/stock-count-view";

export default function StockCountPage() {
  return (
    <SubscreenShell title="Stock Count" description="Reconcile a physical count against real stock — nothing changes until you apply it.">
      <StockCountView />
    </SubscreenShell>
  );
}

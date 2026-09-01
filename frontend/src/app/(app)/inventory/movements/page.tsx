"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { StockMovementsView } from "@/components/inventory/stock-movements-view";

export default function StockMovementsPage() {
  return (
    <SubscreenShell title="Stock Movements" description="Every real stock change across every product, with a running balance.">
      <StockMovementsView />
    </SubscreenShell>
  );
}

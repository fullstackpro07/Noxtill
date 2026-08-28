"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { StockTransfersView } from "@/components/branches/stock-transfers-view";

export default function BranchTransfersPage() {
  return (
    <SubscreenShell title="Stock Transfers" description="Move real inventory between branches — request, approve, ship, and receive.">
      <StockTransfersView />
    </SubscreenShell>
  );
}

"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { SalesHistoryView } from "@/components/pos/sales-history-view";

export default function SalesHistoryPage() {
  return (
    <SubscreenShell title="Sales History">
      <SalesHistoryView />
    </SubscreenShell>
  );
}

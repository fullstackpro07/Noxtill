"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { LowStockView } from "@/components/inventory/low-stock-view";
import { useSession } from "@/lib/session";

export default function LowStockPage() {
  const session = useSession();
  return (
    <SubscreenShell title="Low Stock" description="Below-threshold and out-of-stock products, with reorder suggestions and back-in-stock alerts.">
      <LowStockView currency={session.business.currency} />
    </SubscreenShell>
  );
}

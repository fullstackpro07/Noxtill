"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { TablesGrid } from "@/components/orders/tables-grid";
import { useSession } from "@/lib/session";

export default function OrdersTablesPage() {
  const session = useSession();
  return (
    <SubscreenShell title="Tables">
      <TablesGrid currency={session.business.currency} />
    </SubscreenShell>
  );
}

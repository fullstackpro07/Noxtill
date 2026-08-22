"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { InvoicesView } from "@/components/orders/invoices-view";

export default function OrdersInvoicesPage() {
  return (
    <SubscreenShell title="Invoices">
      <InvoicesView />
    </SubscreenShell>
  );
}

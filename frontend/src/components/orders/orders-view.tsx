"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { OrderKanbanBoard } from "./order-kanban-board";

/** Order Board — the other Orders screens (Tables, Drafts, Quotations, Returns, Invoices,
 * Receipts) are reached via the sidebar's Orders dropdown, each its own route. */
export function OrdersView({ currency, businessName }: { currency: string; businessName: string }) {
  return (
    <SubscreenShell title="Orders">
      <OrderKanbanBoard currency={currency} businessName={businessName} />
    </SubscreenShell>
  );
}

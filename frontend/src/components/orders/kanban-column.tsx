"use client";

import { useDroppable } from "@dnd-kit/core";
import { OrderCard } from "./order-card";
import type { LiveOrder } from "@/lib/orders-api";
import { cn } from "@/lib/utils";

export function KanbanColumn({
  status,
  label,
  orders,
  currency,
  onViewInvoice,
}: {
  status: string;
  label: string;
  orders: LiveOrder[];
  currency: string;
  onViewInvoice: (order: LiveOrder) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-w-64 flex-1 flex-col rounded-[var(--radius-noxtill)] bg-surface-2/50 p-3 transition-colors",
        isOver && "bg-primary/8",
      )}
    >
      <div className="mb-2.5 flex items-center justify-between px-1">
        <p className="text-sm font-semibold text-fg">{label}</p>
        <span className="text-xs text-fg-faint">{orders.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2.5">
        {orders.map((order) => (
          <OrderCard key={order.id} order={order} currency={currency} onViewInvoice={onViewInvoice} />
        ))}
        {orders.length === 0 && <p className="px-1 py-6 text-center text-xs text-fg-faint">No orders</p>}
      </div>
    </div>
  );
}

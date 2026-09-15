"use client";

import { useDroppable } from "@dnd-kit/core";
import { OrderCard } from "./order-card";
import type { LiveOrder } from "@/lib/orders-api";
import { formatCurrency } from "@/lib/format";

export function KanbanColumn({
  status,
  label,
  orders,
  now,
  currency,
  onOpen,
}: {
  status: string;
  label: string;
  orders: LiveOrder[];
  now: number;
  currency: string;
  onOpen: (order: LiveOrder) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const value = orders.reduce((sum, o) => sum + o.total, 0);

  return (
    <div
      ref={setNodeRef}
      className="flex min-h-[220px] flex-col gap-2.5 rounded-[14px] p-[11px]"
      style={{ background: isOver ? "var(--app-success-bg)" : "#F0F2F5", border: "1px solid var(--app-border)" }}
    >
      <div className="flex items-baseline gap-2 px-[3px] py-0.5">
        <span className="text-[13px] font-extrabold" style={{ color: "var(--app-text)" }}>{label}</span>
        <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "var(--app-success-bg)", color: "var(--app-success-text)" }}>{orders.length}</span>
        <span className="ms-auto text-[11.5px] font-bold" style={{ color: "var(--app-text-faint)" }}>{formatCurrency(value, currency)}</span>
      </div>
      {orders.length === 0 ? (
        <div className="rounded-[12px] p-[26px_12px] text-center text-[12px] font-semibold" style={{ border: "1px dashed var(--app-border-strong)", color: "var(--app-text-disabled)" }}>
          Nothing in progress
        </div>
      ) : (
        orders.map((order) => <OrderCard key={order.id} order={order} now={now} currency={currency} onOpen={onOpen} />)
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { KanbanColumn } from "./kanban-column";
import { InvoicePreviewDialog } from "./invoice-preview-dialog";
import { ORDER_STATUS_COLUMNS, ORDERS, type Order, type OrderStatus } from "@/lib/orders";
import { toast } from "@/lib/toast";

const ILLEGAL_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  completed: [],
  cancelled: [],
};

export function OrderKanbanBoard({ currency }: { currency: string }) {
  const [orders, setOrders] = useState<Order[]>(ORDERS);
  const [invoiceOrder, setInvoiceOrder] = useState<Order | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const newStatus = over.id as OrderStatus;
    const order = orders.find((o) => o.id === active.id);
    if (!order || order.status === newStatus) return;

    if (ILLEGAL_TRANSITIONS[order.status]?.includes(newStatus) || order.status === "completed" || order.status === "cancelled") {
      toast.error(`Can't move a ${order.status} order back to ${newStatus}.`);
      return;
    }

    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: newStatus } : o)));
    toast.success(`Order #${order.orderNo} moved to ${newStatus}. Live update wires up in INT-003.`);
  }

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {ORDER_STATUS_COLUMNS.map((column) => (
            <KanbanColumn
              key={column.key}
              status={column.key}
              label={column.label}
              orders={orders.filter((o) => o.status === column.key)}
              currency={currency}
              onViewInvoice={setInvoiceOrder}
            />
          ))}
        </div>
      </DndContext>
      <InvoicePreviewDialog order={invoiceOrder} currency={currency} onClose={() => setInvoiceOrder(null)} />
    </>
  );
}

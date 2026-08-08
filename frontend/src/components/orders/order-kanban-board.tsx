"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { KanbanColumn } from "./kanban-column";
import { InvoicePreviewDialog } from "./invoice-preview-dialog";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonCard } from "@/components/shared/skeleton";
import { ORDER_STATUS_COLUMNS, ORDER_STATUS_TRANSITIONS, type OrderStatus } from "@/lib/orders";
import { fetchOrders, updateOrderStatus, type LiveOrder } from "@/lib/orders-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function OrderKanbanBoard({ currency, businessName }: { currency: string; businessName: string }) {
  const [invoiceOrder, setInvoiceOrder] = useState<LiveOrder | null>(null);
  const queryClient = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const {
    data: orders = [],
    isPending,
    isError,
    refetch,
  } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) => updateOrderStatus(id, status),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ["orders"] });
      const previous = queryClient.getQueryData<LiveOrder[]>(["orders"]);
      queryClient.setQueryData<LiveOrder[]>(["orders"], (prev) =>
        prev?.map((o) => (o.id === id ? { ...o, status } : o)),
      );
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["orders"], context.previous);
      toast.error(err instanceof ApiError ? err.message : "Couldn't update this order's status.");
    },
    onSuccess: (updated) => {
      toast.success(`Order #${updated.orderNo} moved to ${updated.status.replace("_", " ")}.`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const newStatus = over.id as OrderStatus;
    const order = orders.find((o) => o.id === active.id);
    if (!order || order.status === newStatus) return;

    if (!ORDER_STATUS_TRANSITIONS[order.status].includes(newStatus)) {
      toast.error(`Can't move a ${order.status.replace("_", " ")} order to ${newStatus.replace("_", " ")}.`);
      return;
    }

    statusMutation.mutate({ id: order.id, status: newStatus });
  }

  if (isError) {
    return <ErrorBanner title="Couldn't load orders" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  if (isPending) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
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
      <InvoicePreviewDialog order={invoiceOrder} currency={currency} businessName={businessName} onClose={() => setInvoiceOrder(null)} />
    </>
  );
}

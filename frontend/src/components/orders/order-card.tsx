"use client";

import { useDraggable } from "@dnd-kit/core";
import { Banknote, CreditCard, Wallet, HandCoins, FileText } from "lucide-react";
import type { LiveOrder, LivePaymentMethod } from "@/lib/orders-api";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const PAYMENT_ICON: Record<LivePaymentMethod, typeof Banknote> = {
  cash: Banknote,
  card: CreditCard,
  online: Wallet,
  credit: HandCoins,
};

export function OrderCard({
  order,
  currency,
  onViewInvoice,
}: {
  order: LiveOrder;
  currency: string;
  onViewInvoice: (order: LiveOrder) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: order.id });
  const PaymentIcon = PAYMENT_ICON[order.paymentMethod];

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn(
        "cursor-grab touch-none rounded-[var(--radius-noxtill)] border border-border bg-surface p-3.5 active:cursor-grabbing",
        isDragging && "z-10 opacity-60 shadow-[var(--shadow-lg)]",
      )}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-fg-faint">#{order.orderNo}</span>
        <PaymentIcon className="h-3.5 w-3.5 text-fg-faint" aria-hidden />
      </div>
      <p className="truncate text-sm font-medium text-fg">{order.customerName}</p>
      <p className="mt-0.5 truncate text-xs text-fg-muted">{order.items.map((i) => i.name).join(", ")}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="font-display text-sm font-bold text-fg">{formatCurrency(order.total, currency)}</span>
        {order.status === "completed" && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onViewInvoice(order)}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <FileText className="h-3 w-3" aria-hidden />
            Invoice
          </button>
        )}
      </div>
    </div>
  );
}

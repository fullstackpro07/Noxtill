"use client";

import { Users } from "lucide-react";
import { DINE_TABLES, ORDERS } from "@/lib/orders";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  free: "border-border bg-surface text-fg-muted",
  occupied: "border-primary bg-primary/8 text-primary",
  reserved: "border-accent bg-accent/12 text-accent-foreground",
};

export function TablesGrid({ currency }: { currency: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {DINE_TABLES.map((table) => {
        const order = table.currentOrderId ? ORDERS.find((o) => o.id === table.currentOrderId) : undefined;
        return (
          <div
            key={table.id}
            className={cn("flex flex-col gap-2 rounded-[var(--radius-noxtill)] border p-4", STATUS_STYLES[table.status])}
          >
            <div className="flex items-center justify-between">
              <p className="font-display text-lg font-bold">{table.label}</p>
              <span className="flex items-center gap-1 text-xs">
                <Users className="h-3.5 w-3.5" aria-hidden />
                {table.seats}
              </span>
            </div>
            <p className="text-xs capitalize">{table.status}</p>
            {order && <p className="text-xs font-medium">{formatCurrency(order.total, currency)} open</p>}
          </div>
        );
      })}
    </div>
  );
}

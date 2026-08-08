"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonCard } from "@/components/shared/skeleton";
import { fetchOrders } from "@/lib/orders-api";
import { formatCurrency } from "@/lib/format";

/**
 * There's no dedicated "tables" entity in the backend (no roster of seats/reservations) — only
 * `Order.tableNo`, a free-text field set by dine-in orders. So this shows one card per table
 * number with an open order, not a full floor plan of free/reserved slots.
 */
export function TablesGrid({ currency }: { currency: string }) {
  const { data: orders = [], isPending, isError, refetch } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });

  const occupiedTables = useMemo(() => {
    const open = orders.filter((o) => o.tableNo && o.status !== "completed" && o.status !== "cancelled");
    const byTable = new Map<string, { tableNo: string; total: number; orderCount: number }>();
    for (const order of open) {
      const key = order.tableNo!;
      const existing = byTable.get(key);
      if (existing) {
        existing.total += order.total;
        existing.orderCount += 1;
      } else {
        byTable.set(key, { tableNo: key, total: order.total, orderCount: 1 });
      }
    }
    return [...byTable.values()].sort((a, b) => a.tableNo.localeCompare(b.tableNo));
  }, [orders]);

  if (isError) {
    return <ErrorBanner title="Couldn't load tables" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  if (isPending) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (occupiedTables.length === 0) {
    return <EmptyState icon={Users} title="No occupied tables" description="Dine-in orders with a table number will show up here." />;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {occupiedTables.map((table) => (
        <div key={table.tableNo} className="flex flex-col gap-2 rounded-[var(--radius-noxtill)] border border-primary bg-primary/8 p-4 text-primary">
          <div className="flex items-center justify-between">
            <p className="font-display text-lg font-bold">{table.tableNo}</p>
            <span className="flex items-center gap-1 text-xs">
              <Users className="h-3.5 w-3.5" aria-hidden />
              {table.orderCount}
            </span>
          </div>
          <p className="text-xs capitalize">occupied</p>
          <p className="text-xs font-medium">{formatCurrency(table.total, currency)} open</p>
        </div>
      ))}
    </div>
  );
}

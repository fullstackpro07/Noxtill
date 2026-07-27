"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/tabs";
import { OrderKanbanBoard } from "./order-kanban-board";
import { TablesGrid } from "./tables-grid";
import { QuotationCard } from "./quotation-card";
import { QUOTATIONS } from "@/lib/orders";

type OrdersTab = "board" | "tables" | "quotations";

export function OrdersView({ currency }: { currency: string }) {
  const [tab, setTab] = useState<OrdersTab>("board");

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-fg">Orders</h1>
        <Tabs
          items={[
            { key: "board", label: "Board" },
            { key: "tables", label: "Tables" },
            { key: "quotations", label: "Quotations" },
          ]}
          value={tab}
          onChange={(k) => setTab(k as OrdersTab)}
          className="w-80"
        />
      </div>

      {tab === "board" && <OrderKanbanBoard currency={currency} />}
      {tab === "tables" && <TablesGrid currency={currency} />}
      {tab === "quotations" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUOTATIONS.map((q) => (
            <QuotationCard key={q.id} quotation={q} currency={currency} />
          ))}
        </div>
      )}
    </div>
  );
}

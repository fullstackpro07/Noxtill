"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/tabs";
import { OrderKanbanBoard } from "./order-kanban-board";
import { TablesGrid } from "./tables-grid";
import { QuotationsPanel } from "./quotations-panel";

type OrdersTab = "board" | "tables" | "quotations";

export function OrdersView({ currency, businessName }: { currency: string; businessName: string }) {
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

      {tab === "board" && <OrderKanbanBoard currency={currency} businessName={businessName} />}
      {tab === "tables" && <TablesGrid currency={currency} />}
      {tab === "quotations" && <QuotationsPanel currency={currency} />}
    </div>
  );
}

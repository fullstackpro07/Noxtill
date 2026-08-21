"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/tabs";
import { PosView } from "@/components/pos/pos-view";
import { HeldSalesView } from "@/components/pos/held-sales-view";
import { CashRegisterView } from "@/components/pos/cash-register-view";
import { ShiftClosingView } from "@/components/pos/shift-closing-view";
import { SalesHistoryView } from "@/components/pos/sales-history-view";

type SalesTab = "fast-sale" | "held" | "cash-register" | "shift-closing" | "history";

const TAB_ITEMS = [
  { key: "fast-sale", label: "Fast Sale" },
  { key: "held", label: "Held Sales" },
  { key: "cash-register", label: "Cash Register" },
  { key: "shift-closing", label: "Shift Closing" },
  { key: "history", label: "Sales History" },
] as const;

export function SalesView({ currency }: { currency: string }) {
  const [tab, setTab] = useState<SalesTab>("fast-sale");

  if (tab === "fast-sale") {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <div className="border-b border-border px-4 pt-6 sm:px-6 lg:px-8">
          <Tabs items={TAB_ITEMS as unknown as { key: string; label: string }[]} value={tab} onChange={(k) => setTab(k as SalesTab)} className="mb-5 w-full max-w-2xl" />
        </div>
        <PosView currency={currency} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <Tabs items={TAB_ITEMS as unknown as { key: string; label: string }[]} value={tab} onChange={(k) => setTab(k as SalesTab)} className="mb-5 w-full max-w-2xl" />
      {tab === "held" && <HeldSalesView />}
      {tab === "cash-register" && <CashRegisterView />}
      {tab === "shift-closing" && <ShiftClosingView />}
      {tab === "history" && <SalesHistoryView />}
    </div>
  );
}

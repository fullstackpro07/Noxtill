"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/tabs";
import { ProfitProductsTab } from "./profit-products-tab";
import { ProfitTimeTab } from "./profit-time-tab";
import { ProfitPnlTab } from "./profit-pnl-tab";
import { ProfitWhatifTab } from "./profit-whatif-tab";

type ProfitTab = "products" | "time" | "pnl" | "whatif";

export function ProfitView({ currency }: { currency: string }) {
  const [tab, setTab] = useState<ProfitTab>("products");

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-fg">Profit</h1>
        <Tabs
          items={[
            { key: "products", label: "Products" },
            { key: "time", label: "Time" },
            { key: "pnl", label: "P&L" },
            { key: "whatif", label: "What-if" },
          ]}
          value={tab}
          onChange={(k) => setTab(k as ProfitTab)}
          className="w-full sm:w-96"
        />
      </div>

      {tab === "products" && <ProfitProductsTab currency={currency} />}
      {tab === "time" && <ProfitTimeTab currency={currency} />}
      {tab === "pnl" && <ProfitPnlTab currency={currency} />}
      {tab === "whatif" && <ProfitWhatifTab />}
    </div>
  );
}

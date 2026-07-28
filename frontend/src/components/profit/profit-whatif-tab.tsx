"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { PNL_STATEMENT, netProfit } from "@/lib/profit";
import { formatCurrency } from "@/lib/format";

export function ProfitWhatifTab({ currency }: { currency: string }) {
  const [priceChangePercent, setPriceChangePercent] = useState(0);

  const currentNet = netProfit(PNL_STATEMENT);
  const projectedRevenue = PNL_STATEMENT.revenue * (1 + priceChangePercent / 100);
  const projectedNet = projectedRevenue - PNL_STATEMENT.cogs - PNL_STATEMENT.expenses;
  const delta = projectedNet - currentNet;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="price-slider" className="text-sm font-medium text-fg">
            Price change across all services
          </label>
          <span className="font-display text-lg font-bold text-fg">
            {priceChangePercent > 0 ? "+" : ""}
            {priceChangePercent}%
          </span>
        </div>
        <input
          id="price-slider"
          type="range"
          min={-20}
          max={20}
          step={1}
          value={priceChangePercent}
          onChange={(e) => setPriceChangePercent(Number(e.target.value))}
          className="w-full accent-primary"
        />

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-[var(--radius-sm)] bg-surface-2 p-3.5">
            <p className="text-xs text-fg-faint">Projected net profit</p>
            <p className="mt-0.5 font-display text-lg font-bold text-fg">{formatCurrency(projectedNet, currency)}</p>
          </div>
          <div className="rounded-[var(--radius-sm)] bg-surface-2 p-3.5">
            <p className="text-xs text-fg-faint">Change vs. today</p>
            <p className={`mt-0.5 font-display text-lg font-bold ${delta >= 0 ? "text-whatsapp" : "text-destructive"}`}>
              {delta >= 0 ? "+" : ""}
              {formatCurrency(delta, currency)}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2.5 rounded-[var(--radius-sm)] border border-border-strong bg-surface-2 px-3.5 py-3 text-xs text-fg-muted">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-fg-faint" aria-hidden />
        This is a simulated estimate assuming unchanged demand — it does not account for customers lost or gained by a price
        change. Not financial advice; always confirm with your own numbers before acting on it.
      </div>
    </div>
  );
}

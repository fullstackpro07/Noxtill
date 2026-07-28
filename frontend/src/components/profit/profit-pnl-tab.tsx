"use client";

import Link from "next/link";
import { Download, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PNL_STATEMENT, netProfit } from "@/lib/profit";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";

export function ProfitPnlTab({ currency }: { currency: string }) {
  const net = netProfit(PNL_STATEMENT);

  const rows: { label: string; value: number; emphasis?: boolean }[] = [
    { label: "Revenue", value: PNL_STATEMENT.revenue },
    { label: "Cost of goods sold", value: -PNL_STATEMENT.cogs },
    { label: "Expenses", value: -PNL_STATEMENT.expenses },
  ];

  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-medium text-fg">{PNL_STATEMENT.month}</p>
        <Link href="/expenses" className="text-xs font-medium text-primary hover:underline">
          View expenses →
        </Link>
      </div>

      <div className="flex flex-col divide-y divide-border">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between py-2.5 text-sm">
            <span className="text-fg-muted">{row.label}</span>
            <span className={row.value < 0 ? "tabular-nums text-destructive" : "tabular-nums text-fg"}>
              {row.value < 0 ? "−" : ""}
              {formatCurrency(Math.abs(row.value), currency)}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between py-3">
          <span className="font-semibold text-fg">Net profit</span>
          <span className={`font-display text-lg font-bold tabular-nums ${net >= 0 ? "text-whatsapp" : "text-destructive"}`}>
            {formatCurrency(net, currency)}
          </span>
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => toast.info("P&L PDF exported. Live export wires up in INT-005.")}>
          <Download className="h-3.5 w-3.5" aria-hidden />
          Export
        </Button>
        <Button size="sm" onClick={() => toast.success("P&L statement sent via WhatsApp. Live send wires up in INT-005.")}>
          <Send className="h-3.5 w-3.5" aria-hidden />
          Send
        </Button>
      </div>
    </div>
  );
}

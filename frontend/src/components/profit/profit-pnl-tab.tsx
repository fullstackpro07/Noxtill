"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Download, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ErrorBanner } from "@/components/shared/error-states";
import { Skeleton } from "@/components/shared/skeleton";
import { fetchPnl } from "@/lib/profit-api";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";

function recentMonths(count = 6): { value: string; label: string }[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
    return { value, label };
  });
}

export function ProfitPnlTab({ currency }: { currency: string }) {
  const months = useMemo(() => recentMonths(), []);
  const [month, setMonth] = useState(months[0].value);

  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["profit-pnl", month], queryFn: () => fetchPnl(month) });

  const notReady = () =>
    toast.info("PDF export/send lands with the Reports module — not available yet.");

  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Select value={month} onChange={(e) => setMonth(e.target.value)} className="w-40">
          {months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
        <Link href="/expenses" className="text-xs font-medium text-primary hover:underline">
          View expenses →
        </Link>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load the P&L statement" description="Check your connection and try again." onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="flex flex-col divide-y divide-border">
            <div className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-fg-muted">Revenue</span>
              <span className="tabular-nums text-fg">{formatCurrency(data.revenue, currency)}</span>
            </div>
            <div className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-fg-muted">Cost of goods sold</span>
              <span className="tabular-nums text-destructive">−{formatCurrency(data.cogs, currency)}</span>
            </div>
            {data.expenses.map((e) => (
              <div key={e.category} className="flex items-center justify-between py-2.5 ps-4 text-sm">
                <span className="text-fg-faint">{e.category}</span>
                <span className="tabular-nums text-destructive">−{formatCurrency(e.amount, currency)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-fg-muted">Total expenses</span>
              <span className="tabular-nums text-destructive">−{formatCurrency(data.totalExpenses, currency)}</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="font-semibold text-fg">Net profit</span>
              <span className={`font-display text-lg font-bold tabular-nums ${data.netProfit >= 0 ? "text-whatsapp" : "text-destructive"}`}>
                {formatCurrency(data.netProfit, currency)}
              </span>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={notReady}>
              <Download className="h-3.5 w-3.5" aria-hidden />
              Export
            </Button>
            <Button size="sm" onClick={notReady}>
              <Send className="h-3.5 w-3.5" aria-hidden />
              Send
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { PieChart, Clock3, Banknote, Users, BarChart3, ChevronRight } from "lucide-react";
import { ProfitPnlTab } from "./profit-pnl-tab";

const SCREENS = [
  { href: "/profit/product-profitability", label: "Product Profitability", icon: PieChart },
  { href: "/profit/time-analysis", label: "Time Analysis", icon: Clock3 },
  { href: "/profit/cash-flow", label: "Cash Flow", icon: Banknote },
  { href: "/profit/customer-analytics", label: "Customer Analytics", icon: Users },
  { href: "/profit/staff-analytics", label: "Staff Analytics", icon: BarChart3 },
];

export function ProfitOverviewPanel({ currency }: { currency: string }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        {SCREENS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="flex items-center gap-2.5 rounded-[var(--radius-noxtill)] border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-2/50"
          >
            <s.icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="flex-1 text-sm font-medium text-fg">{s.label}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-fg-faint" aria-hidden />
          </Link>
        ))}
      </div>

      <div>
        <p className="mb-3 text-sm font-medium text-fg">Profit & loss</p>
        <ProfitPnlTab currency={currency} />
      </div>
    </div>
  );
}

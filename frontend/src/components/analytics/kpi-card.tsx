"use client";

import Link from "next/link";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import type { KpiCard as KpiCardData } from "@/lib/analytics";

export function KpiCard({ kpi }: { kpi: KpiCardData }) {
  const positive = kpi.deltaPercent >= 0;
  return (
    <Link
      href={kpi.href}
      className="flex flex-col gap-1.5 rounded-[var(--radius-noxtill)] border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-2/50"
    >
      <span className="text-xs font-medium text-fg-faint">{kpi.label}</span>
      <span className="font-display text-xl font-bold text-fg">{kpi.value}</span>
      <span className={`flex items-center gap-1 text-xs font-medium ${positive ? "text-whatsapp" : "text-destructive"}`}>
        {positive ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />}
        {Math.abs(kpi.deltaPercent).toFixed(1)}% vs last period
      </span>
    </Link>
  );
}

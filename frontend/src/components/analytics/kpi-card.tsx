"use client";

import Link from "next/link";

export interface KpiCardData {
  key: string;
  label: string;
  value: string;
  href: string;
}

/** No "vs last period" delta shown — there's no real trend/comparison data behind it, so it's honestly omitted rather than faked. */
export function KpiCard({ kpi }: { kpi: KpiCardData }) {
  return (
    <Link
      href={kpi.href}
      className="flex flex-col gap-1.5 rounded-[var(--radius-noxtill)] border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-2/50"
    >
      <span className="text-xs font-medium text-fg-faint">{kpi.label}</span>
      <span className="font-display text-xl font-bold text-fg">{kpi.value}</span>
    </Link>
  );
}

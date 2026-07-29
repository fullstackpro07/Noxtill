"use client";

import Link from "next/link";
import { Trophy } from "lucide-react";
import { STAFF } from "@/lib/staff";
import { COMMISSION_DATA } from "@/lib/commissions";
import { formatCurrency } from "@/lib/format";

export function StaffLeaderboard({ currency }: { currency: string }) {
  const ranked = STAFF.map((s) => ({
    staff: s,
    sales: COMMISSION_DATA.find((c) => c.staffId === s.id)?.salesTotal ?? 0,
  }))
    .filter((r) => r.sales > 0)
    .sort((a, b) => b.sales - a.sales);

  return (
    <Link href="/staff" className="block rounded-[var(--radius-noxtill)] border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-2/50">
      <p className="mb-3 flex items-center gap-1.5 text-sm font-medium text-fg">
        <Trophy className="h-4 w-4 text-accent-foreground" aria-hidden />
        Staff leaderboard
      </p>
      <div className="flex flex-col gap-2">
        {ranked.map((r, i) => (
          <div key={r.staff.id} className="flex items-center gap-2.5 text-sm">
            <span className="w-4 shrink-0 text-fg-faint">{i + 1}</span>
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
              style={{ backgroundColor: r.staff.color }}
            >
              {r.staff.name.charAt(0)}
            </span>
            <span className="flex-1 truncate text-fg">{r.staff.name}</span>
            <span className="font-medium text-fg-muted">{formatCurrency(r.sales, currency)}</span>
          </div>
        ))}
      </div>
    </Link>
  );
}

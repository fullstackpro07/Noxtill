"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { fetchCommissions } from "@/lib/staff-api";
import { formatCurrency } from "@/lib/format";

const AVATAR_PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function StaffLeaderboard({ currency }: { currency: string }) {
  const month = currentMonth();
  const { data: entries = [] } = useQuery({ queryKey: ["commissions", month], queryFn: () => fetchCommissions(month) });

  const ranked = entries.filter((e) => e.totalSales > 0).sort((a, b) => b.totalSales - a.totalSales);

  return (
    <Link href="/staff" className="block rounded-[var(--radius-noxtill)] border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-2/50">
      <p className="mb-3 flex items-center gap-1.5 text-sm font-medium text-fg">
        <Trophy className="h-4 w-4 text-accent-foreground" aria-hidden />
        Staff leaderboard
      </p>
      <div className="flex flex-col gap-2">
        {ranked.map((entry, i) => (
          <div key={entry.businessUserId} className="flex items-center gap-2.5 text-sm">
            <span className="w-4 shrink-0 text-fg-faint">{i + 1}</span>
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
              style={{ backgroundColor: AVATAR_PALETTE[i % AVATAR_PALETTE.length] }}
            >
              {entry.name.charAt(0)}
            </span>
            <span className="flex-1 truncate text-fg">{entry.name}</span>
            <span className="font-medium text-fg-muted">{formatCurrency(entry.totalSales, currency)}</span>
          </div>
        ))}
      </div>
    </Link>
  );
}

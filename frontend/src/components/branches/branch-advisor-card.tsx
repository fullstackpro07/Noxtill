"use client";

import { Sparkles, ShieldAlert } from "lucide-react";
import { BRANCH_METRICS } from "@/lib/branches";

export function BranchAdvisorCard({ branchId }: { branchId: string }) {
  const branch = BRANCH_METRICS.find((b) => b.branchId === branchId) ?? BRANCH_METRICS[0];
  const other = BRANCH_METRICS.find((b) => b.branchId !== branch.branchId);
  const note =
    other && branch.avgTicket < other.avgTicket
      ? `${branch.name}'s average ticket (${branch.avgTicket.toFixed(0)}) trails ${other.name} — consider a retail add-on prompt at checkout.`
      : `${branch.name} is leading on average ticket this month — worth reviewing what's driving it for the other location.`;

  return (
    <div className="rounded-[var(--radius-noxtill)] border border-primary/25 bg-primary/[0.04] p-4">
      <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-primary">
        <Sparkles className="h-4 w-4" aria-hidden />
        Branch advisor
      </div>
      <p className="text-sm text-fg">{note}</p>
      <div className="mt-3 flex items-start gap-1.5 text-xs text-fg-faint">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Based on your own branch data only — never a competitor&apos;s or another business&apos;s numbers.
      </div>
    </div>
  );
}

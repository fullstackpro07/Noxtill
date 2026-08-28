"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { RollupComparison } from "@/components/branches/rollup-comparison";
import { useSession } from "@/lib/session";

export default function BranchRollupPage() {
  const session = useSession();
  return (
    <SubscreenShell title="Roll-up Dashboard" description="Combined performance across every branch in your group, last 30 days.">
      <RollupComparison currency={session.business.currency} />
    </SubscreenShell>
  );
}

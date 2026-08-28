"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { BranchComparisonView } from "@/components/branches/branch-comparison-view";
import { useSession } from "@/lib/session";

export default function BranchComparePage() {
  const session = useSession();
  return (
    <SubscreenShell title="Branch Comparison" description="See which branch leads on each metric, week over week.">
      <BranchComparisonView currency={session.business.currency} />
    </SubscreenShell>
  );
}

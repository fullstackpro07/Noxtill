"use client";

import { BranchDropdown } from "./branch-dropdown";
import { RollupComparison } from "./rollup-comparison";
import { BranchAdvisorCard } from "./branch-advisor-card";

export function BranchesView({ currency }: { currency: string }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-fg">Branches</h1>
        <BranchDropdown />
      </div>

      <div className="mb-5">
        <BranchAdvisorCard />
      </div>

      <RollupComparison currency={currency} />
    </div>
  );
}

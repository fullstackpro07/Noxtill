"use client";

import { useState } from "react";
import { BranchDropdown } from "./branch-dropdown";
import { RollupComparison } from "./rollup-comparison";
import { BranchAdvisorCard } from "./branch-advisor-card";
import { BRANCH_METRICS } from "@/lib/branches";

export function BranchesView({ currency }: { currency: string }) {
  const [selected, setSelected] = useState("all");
  const advisorBranchId = selected === "all" ? BRANCH_METRICS[0].branchId : selected;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-fg">Branches</h1>
        <BranchDropdown value={selected} onChange={setSelected} />
      </div>

      <div className="mb-5">
        <BranchAdvisorCard branchId={advisorBranchId} />
      </div>

      <RollupComparison currency={currency} />
    </div>
  );
}

"use client";

import { AllBranchesView } from "@/components/branches/all-branches-view";
import { useSession } from "@/lib/session";

export default function BranchesPage() {
  const session = useSession();
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-fg">Branches</h1>
      </div>
      <AllBranchesView currency={session.business.currency} />
    </div>
  );
}

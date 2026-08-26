"use client";

import { ProfitOverviewPanel } from "@/components/profit/profit-overview-panel";
import { useSession } from "@/lib/session";

export default function ProfitPage() {
  const session = useSession();
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-fg">Profit</h1>
      </div>
      <ProfitOverviewPanel currency={session.business.currency} />
    </div>
  );
}

"use client";

import { MarketingOverviewPanel } from "@/components/marketing/marketing-overview-panel";
import { useSession } from "@/lib/session";

export default function MarketingPage() {
  const session = useSession();
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-fg">Marketing</h1>
      </div>
      <MarketingOverviewPanel currency={session.business.currency} />
    </div>
  );
}

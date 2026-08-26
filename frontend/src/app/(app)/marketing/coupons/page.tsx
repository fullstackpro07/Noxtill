"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { CouponsPanel } from "@/components/marketing/coupons-panel";
import { useSession } from "@/lib/session";

export default function MarketingCouponsPage() {
  const session = useSession();
  return (
    <SubscreenShell title="Coupons">
      <CouponsPanel currency={session.business.currency} />
    </SubscreenShell>
  );
}

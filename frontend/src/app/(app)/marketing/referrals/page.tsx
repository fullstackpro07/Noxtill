"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { ReferralsPanel } from "@/components/marketing/referrals-panel";

export default function MarketingReferralsPage() {
  return (
    <SubscreenShell title="Referrals">
      <ReferralsPanel />
    </SubscreenShell>
  );
}

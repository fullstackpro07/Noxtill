"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { LoyaltyMembershipsView } from "@/components/customers/loyalty-memberships-view";

export default function LoyaltyMembershipsPage() {
  return (
    <SubscreenShell title="Loyalty & Memberships" description="Real punch cards and recurring memberships, issued and charged on real customer activity.">
      <LoyaltyMembershipsView />
    </SubscreenShell>
  );
}

"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { PricingPanel } from "@/components/products/pricing-panel";
import { useSession } from "@/lib/session";

export default function ProductsPricingPage() {
  const session = useSession();
  return (
    <SubscreenShell title="Pricing">
      <PricingPanel currency={session.business.currency} />
    </SubscreenShell>
  );
}

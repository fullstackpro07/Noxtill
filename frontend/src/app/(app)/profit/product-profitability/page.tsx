"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { ProductProfitabilityView } from "@/components/profit/product-profitability-view";
import { useSession } from "@/lib/session";

export default function ProductProfitabilityPage() {
  const session = useSession();
  return (
    <SubscreenShell title="Product Profitability" description="Margin and profit contribution per product, with a price-adjustment what-if.">
      <ProductProfitabilityView currency={session.business.currency} />
    </SubscreenShell>
  );
}

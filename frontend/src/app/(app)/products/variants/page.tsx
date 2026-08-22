"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { VariantsPanel } from "@/components/products/variants-panel";
import { useSession } from "@/lib/session";

export default function ProductsVariantsPage() {
  const session = useSession();
  return (
    <SubscreenShell title="Variants">
      <VariantsPanel currency={session.business.currency} />
    </SubscreenShell>
  );
}

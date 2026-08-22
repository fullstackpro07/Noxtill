"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { BundlesPanel } from "@/components/products/bundles-panel";
import { useSession } from "@/lib/session";

export default function ProductsBundlesPage() {
  const session = useSession();
  return (
    <SubscreenShell title="Bundles">
      <BundlesPanel currency={session.business.currency} />
    </SubscreenShell>
  );
}

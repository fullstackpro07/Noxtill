"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { WastageView } from "@/components/inventory/wastage-view";
import { useSession } from "@/lib/session";

export default function WastagePage() {
  const session = useSession();
  return (
    <SubscreenShell title="Wastage" description="Written-off stock, by reason and by product.">
      <WastageView currency={session.business.currency} />
    </SubscreenShell>
  );
}

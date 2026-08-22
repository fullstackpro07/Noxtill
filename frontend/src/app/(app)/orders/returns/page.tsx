"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { ReturnsPanel } from "@/components/orders/returns-panel";
import { useSession } from "@/lib/session";

export default function OrdersReturnsPage() {
  const session = useSession();
  return (
    <SubscreenShell title="Returns">
      <ReturnsPanel currency={session.business.currency} />
    </SubscreenShell>
  );
}

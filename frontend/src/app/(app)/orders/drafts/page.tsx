"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { DraftOrdersPanel } from "@/components/orders/draft-orders-panel";
import { useSession } from "@/lib/session";

export default function OrdersDraftsPage() {
  const session = useSession();
  return (
    <SubscreenShell title="Drafts">
      <DraftOrdersPanel currency={session.business.currency} />
    </SubscreenShell>
  );
}

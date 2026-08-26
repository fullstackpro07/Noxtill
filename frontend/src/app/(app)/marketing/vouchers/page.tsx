"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { VouchersPanel } from "@/components/marketing/vouchers-panel";
import { useSession } from "@/lib/session";

export default function MarketingVouchersPage() {
  const session = useSession();
  return (
    <SubscreenShell title="Vouchers">
      <VouchersPanel currency={session.business.currency} />
    </SubscreenShell>
  );
}

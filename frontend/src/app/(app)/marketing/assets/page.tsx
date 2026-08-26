"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { MarketingAssetsPanel } from "@/components/marketing/marketing-assets-panel";
import { useSession } from "@/lib/session";

export default function MarketingAssetsPage() {
  const session = useSession();
  return (
    <SubscreenShell title="Marketing Assets">
      <MarketingAssetsPanel businessName={session.business.name} />
    </SubscreenShell>
  );
}

"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { CampaignsTab } from "@/components/marketing/campaigns-tab";

export default function MarketingCampaignsPage() {
  return (
    <SubscreenShell title="Campaigns">
      <CampaignsTab />
    </SubscreenShell>
  );
}

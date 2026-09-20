"use client";

import { Suspense } from "react";
import { CampaignBuilderView } from "@/components/marketing/campaign-builder-view";

export default function MarketingBuilderPage() {
  return (
    <Suspense fallback={null}>
      <CampaignBuilderView />
    </Suspense>
  );
}

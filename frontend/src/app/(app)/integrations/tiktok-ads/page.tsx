"use client";

import { TikTokAdsView } from "@/components/integrations/tiktok-ads/tiktok-ads-view";
import { useMockSession } from "@/lib/mock-session";

export default function TikTokAdsIntegrationPage() {
  const session = useMockSession();
  return <TikTokAdsView currency={session.business.currency} />;
}

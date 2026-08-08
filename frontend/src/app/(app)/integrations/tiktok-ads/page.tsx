"use client";

import { TikTokAdsView } from "@/components/integrations/tiktok-ads/tiktok-ads-view";
import { useSession } from "@/lib/session";

export default function TikTokAdsIntegrationPage() {
  const session = useSession();
  return <TikTokAdsView currency={session.business.currency} />;
}

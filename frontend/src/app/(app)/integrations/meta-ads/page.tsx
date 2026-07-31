"use client";

import { MetaAdsView } from "@/components/integrations/meta-ads/meta-ads-view";
import { useMockSession } from "@/lib/mock-session";

export default function MetaAdsIntegrationPage() {
  const session = useMockSession();
  return <MetaAdsView currency={session.business.currency} />;
}

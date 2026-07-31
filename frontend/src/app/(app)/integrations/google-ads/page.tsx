"use client";

import { GoogleAdsView } from "@/components/integrations/google-ads/google-ads-view";
import { useMockSession } from "@/lib/mock-session";

export default function GoogleAdsIntegrationPage() {
  const session = useMockSession();
  return <GoogleAdsView currency={session.business.currency} />;
}

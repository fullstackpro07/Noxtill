"use client";

import { GoogleAdsView } from "@/components/integrations/google-ads/google-ads-view";
import { useSession } from "@/lib/session";

export default function GoogleAdsIntegrationPage() {
  const session = useSession();
  return <GoogleAdsView currency={session.business.currency} />;
}

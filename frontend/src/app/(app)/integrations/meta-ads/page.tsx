"use client";

import { MetaAdsView } from "@/components/integrations/meta-ads/meta-ads-view";
import { useSession } from "@/lib/session";

export default function MetaAdsIntegrationPage() {
  const session = useSession();
  return <MetaAdsView currency={session.business.currency} />;
}

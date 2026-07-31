"use client";

import { IntegrationsHubView } from "@/components/integrations/integrations-hub-view";
import { useMockSession } from "@/lib/mock-session";

export default function IntegrationsPage() {
  const session = useMockSession();
  return <IntegrationsHubView currency={session.business.currency} />;
}

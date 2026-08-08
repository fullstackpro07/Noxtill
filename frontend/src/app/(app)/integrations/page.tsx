"use client";

import { IntegrationsHubView } from "@/components/integrations/integrations-hub-view";
import { useSession } from "@/lib/session";

export default function IntegrationsPage() {
  const session = useSession();
  return <IntegrationsHubView currency={session.business.currency} />;
}

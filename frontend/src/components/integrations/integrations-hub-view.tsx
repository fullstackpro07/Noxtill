"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ConnectorCard } from "./connector-card";
import { OAuthConnectDialog } from "./oauth-connect-dialog";
import { MarketingOverviewSection } from "./marketing-overview-section";
import { CONNECTORS, connectorByKey, type Connector, type ConnectorKey } from "@/lib/integrations";
import { fetchIntegrations } from "@/lib/integrations-api";
import { toast } from "@/lib/toast";

export function IntegrationsHubView({ currency }: { currency: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [target, setTarget] = useState<Connector | null>(null);

  const { data: liveStatuses } = useQuery({
    queryKey: ["integrations"],
    queryFn: fetchIntegrations,
  });

  const connectors: Connector[] = CONNECTORS.map((c) => ({
    ...c,
    status: liveStatuses?.[c.key] ?? "not_connected",
  }));

  // The backend's OAuth callback redirects the browser straight back to this page with
  // ?connected=<provider> or ?error=<provider> — this IS the "callback landing," no separate route needed.
  useEffect(() => {
    const connectedKey = searchParams.get("connected") as ConnectorKey | null;
    const errorKey = searchParams.get("error") as ConnectorKey | null;
    if (connectedKey) {
      const connector = connectorByKey(connectedKey);
      toast.success(`Connected ${connector?.name ?? connectedKey}.`);
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
      router.replace(pathname);
    } else if (errorKey) {
      const connector = connectorByKey(errorKey);
      toast.error(`Couldn't connect ${connector?.name ?? errorKey} — please try again.`);
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
      router.replace(pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per mount to consume the redirect params
  }, []);

  function handleConnected(key: Connector["key"]) {
    void queryClient.invalidateQueries({ queryKey: ["integrations"] });
    toast.success(`Connected ${connectorByKey(key)?.name ?? key}.`);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-fg">Integrations</h1>
        <p className="mt-0.5 text-sm text-fg-muted">Connect the channels where you already run marketing.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {connectors.map((c) => (
          <ConnectorCard key={c.key} connector={c} onConnect={setTarget} />
        ))}
      </div>

      <MarketingOverviewSection currency={currency} />

      <OAuthConnectDialog
        connector={target}
        onClose={() => setTarget(null)}
        onConnected={handleConnected}
        reconnect={target?.status === "needs_attention"}
      />
    </div>
  );
}

"use client";

import { useState } from "react";
import { ConnectorCard } from "./connector-card";
import { OAuthConnectDialog } from "./oauth-connect-dialog";
import { MarketingOverviewSection } from "./marketing-overview-section";
import { CONNECTORS as INITIAL_CONNECTORS, type Connector } from "@/lib/integrations";
import { toast } from "@/lib/toast";

export function IntegrationsHubView({ currency }: { currency: string }) {
  const [connectors, setConnectors] = useState<Connector[]>(INITIAL_CONNECTORS);
  const [target, setTarget] = useState<Connector | null>(null);

  function handleConnected(key: Connector["key"]) {
    setConnectors((prev) => prev.map((c) => (c.key === key ? { ...c, status: "connected" } : c)));
    toast.success("Connected. Live OAuth wires up in INT-013.");
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

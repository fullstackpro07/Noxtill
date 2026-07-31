"use client";

import Link from "next/link";
import { RefreshCw, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusChip } from "./status-chip";
import type { Connector } from "@/lib/integrations";

export function ConnectorCard({ connector, onConnect }: { connector: Connector; onConnect: (connector: Connector) => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-fg">{connector.name}</p>
          <p className="mt-0.5 text-xs text-fg-muted">{connector.description}</p>
        </div>
        <StatusChip status={connector.status} />
      </div>
      <div className="mt-auto flex gap-2">
        {connector.status === "not_connected" && (
          <Button size="sm" className="flex-1" onClick={() => onConnect(connector)}>
            <Plug className="h-3.5 w-3.5" aria-hidden />
            Connect
          </Button>
        )}
        {connector.status === "needs_attention" && (
          <Button size="sm" variant="destructive" className="flex-1" onClick={() => onConnect(connector)}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Reconnect
          </Button>
        )}
        {connector.status === "connected" && (
          <Link href={connector.href} className="flex-1">
            <Button size="sm" variant="outline" className="w-full">
              Manage
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

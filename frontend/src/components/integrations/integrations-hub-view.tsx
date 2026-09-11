"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plug, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { StatusChip } from "./status-chip";
import { OAuthConnectDialog } from "./oauth-connect-dialog";
import { MarketingOverviewSection } from "./marketing-overview-section";
import { connectorByKey, type Connector, type ConnectorKey, type ConnectorStatus } from "@/lib/integrations";
import { fetchIntegrationDirectory, type IntegrationDirectoryRow, type IntegrationCategory } from "@/lib/integration-directory-api";
import { providerLabel, CATEGORY_LABELS } from "@/lib/provider-labels";
import { toast } from "@/lib/toast";

const CATEGORY_ORDER: IntegrationCategory[] = ["ads", "social", "directories", "accounting", "ecommerce", "automation", "other"];

/**
 * Where a provider's card links to. The catalogue's own `href` wins when a provider has a real
 * dedicated page (gmb's post/insights manager, email's campaign builder, every ad platform's
 * `/advertising`) — the generic Connection Detail page is the fallback for providers with no
 * richer page of their own (quickbooks/xero/shopify/woocommerce, bing_places/apple_business_connect/yelp).
 */
function hrefFor(row: IntegrationDirectoryRow, connector: Connector | undefined): string {
  if (connector) return connector.href;
  if (row.category === "social") return "/social";
  if (row.category === "automation") return "/integrations/automation";
  return `/integrations/${row.provider}`;
}

/**
 * Integration Directory, module 24 (UPD-FE-063v depth fix) — real categorized data from
 * `GET /integrations/directory` (ads/social/directories/accounting/e-commerce/automation/other),
 * replacing the previous hardcoded 15-provider mock catalogue. The OAuth connect dialog still
 * only applies to providers with a real registered connector (`connectorByKey`); automation
 * platforms (real REST-Hook subscriptions, no OAuth) and social platforms (their own connect flow
 * under `/social`) link straight to their real management screen instead.
 */
export function IntegrationsHubView({ currency }: { currency: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [target, setTarget] = useState<Connector | null>(null);

  const { data: rows, isPending, isError, refetch } = useQuery({
    queryKey: ["integration-directory"],
    queryFn: fetchIntegrationDirectory,
  });

  const grouped = useMemo(() => {
    const map = new Map<IntegrationCategory, IntegrationDirectoryRow[]>();
    for (const row of rows ?? []) {
      map.set(row.category, [...(map.get(row.category) ?? []), row]);
    }
    return map;
  }, [rows]);

  // The backend's OAuth callback redirects the browser straight back to this page with
  // ?connected=<provider> or ?error=<provider> — this IS the "callback landing," no separate route needed.
  useEffect(() => {
    const connectedKey = searchParams.get("connected") as ConnectorKey | null;
    const errorKey = searchParams.get("error") as ConnectorKey | null;
    if (connectedKey) {
      const connector = connectorByKey(connectedKey);
      toast.success(`Connected ${connector?.name ?? connectedKey}.`);
      void queryClient.invalidateQueries({ queryKey: ["integration-directory"] });
      router.replace(pathname);
    } else if (errorKey) {
      const connector = connectorByKey(errorKey);
      toast.error(`Couldn't connect ${connector?.name ?? errorKey} — please try again.`);
      void queryClient.invalidateQueries({ queryKey: ["integration-directory"] });
      router.replace(pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per mount to consume the redirect params
  }, []);

  function handleConnected(key: Connector["key"]) {
    void queryClient.invalidateQueries({ queryKey: ["integration-directory"] });
    toast.success(`Connected ${connectorByKey(key)?.name ?? key}.`);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-fg">Integrations</h1>
        <p className="mt-0.5 text-sm text-fg-muted">Every real connector this app supports, across every category.</p>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load integrations" onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {CATEGORY_ORDER.filter((cat) => grouped.has(cat)).map((category) => (
            <div key={category}>
              <p className="mb-3 text-sm font-medium text-fg">{CATEGORY_LABELS[category]}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {grouped.get(category)!.map((row) => {
                  const connector = connectorByKey(row.provider as ConnectorKey);
                  const canOAuthConnect = !!connector && row.category !== "automation" && row.category !== "social";
                  return (
                    <div key={row.provider} className="flex flex-col gap-3 rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-fg">{providerLabel(row.provider)}</p>
                        <StatusChip status={row.status as ConnectorStatus} />
                      </div>
                      <div className="mt-auto flex gap-2">
                        {canOAuthConnect && row.status === "not_connected" && (
                          <Button size="sm" className="flex-1" onClick={() => setTarget({ ...connector!, status: row.status as ConnectorStatus })}>
                            <Plug className="h-3.5 w-3.5" aria-hidden />
                            Connect
                          </Button>
                        )}
                        {canOAuthConnect && row.status === "needs_attention" && (
                          <Button size="sm" variant="destructive" className="flex-1" onClick={() => setTarget({ ...connector!, status: row.status as ConnectorStatus })}>
                            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                            Reconnect
                          </Button>
                        )}
                        {(row.status === "connected" || !canOAuthConnect) && (
                          <Link href={hrefFor(row, connector)} className="flex-1">
                            <Button size="sm" variant="outline" className="w-full">
                              Manage
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

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

"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, PlugZap, ShieldOff, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { fetchConnectionDetail, triggerConnectionSync, isAutomationDetail } from "@/lib/connection-detail-api";
import { disconnectIntegration } from "@/lib/integrations-api";
import type { ConnectorKey } from "@/lib/integrations";
import { providerLabel } from "@/lib/provider-labels";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { formatDate, formatTime } from "@/lib/format";

/** Every OAuth-shaped category has a real sync action now — accounting/e-commerce/directory run their own sync, ads runs a real on-demand stats refresh. */
function canManuallySync(category: string): boolean {
  return category === "accounting" || category === "ecommerce" || category === "directories" || category === "directory" || category === "ads";
}

/**
 * Connection Detail (UPD-FE-130) — one real, generic screen across every connector category.
 * Automation platforms render a structurally different real view (their own subscriptions +
 * delivery history) since they have no OAuth connection at all — see `isAutomationDetail`.
 */
export function ConnectionDetailView({ provider }: { provider: string }) {
  const queryClient = useQueryClient();
  const { data: detail, isPending, isError, refetch } = useQuery({
    queryKey: ["connection-detail", provider],
    queryFn: () => fetchConnectionDetail(provider),
  });

  const syncMutation = useMutation({
    mutationFn: () => triggerConnectionSync(provider),
    onSuccess: (result) => {
      const r = result as { synced?: number; total?: number; retried?: number } | null;
      if (typeof r?.retried === "number") toast.success(`Retried ${r.retried} failed delivery(ies).`);
      else if (typeof r?.synced === "number") toast.success(`Refreshed stats for ${r.synced}/${r.total} campaign(s).`);
      else toast.success("Synced.");
      void queryClient.invalidateQueries({ queryKey: ["connection-detail", provider] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't sync this connector."),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectIntegration(provider as ConnectorKey),
    onSuccess: () => {
      toast.success("Disconnected.");
      void queryClient.invalidateQueries({ queryKey: ["connection-detail", provider] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't disconnect this connector."),
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/integrations" className="mb-4 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Integrations
      </Link>
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-fg">{providerLabel(provider)}</h1>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load this connector" onRetry={() => refetch()} />
      ) : isPending || !detail ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : isAutomationDetail(detail) ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-fg-muted">
              Real REST-Hook subscriptions — no single OAuth connection exists for automation platforms.{" "}
              <Link href="/integrations/automation" className="text-primary hover:underline">
                Manage subscriptions →
              </Link>
            </p>
            <Button size="sm" variant="outline" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              {syncMutation.isPending ? "Retrying…" : "Retry failed deliveries"}
            </Button>
          </div>
          {detail.subscriptions.length === 0 ? (
            <p className="text-sm text-fg-faint">No subscriptions for this platform yet.</p>
          ) : (
            detail.subscriptions.map((sub) => (
              <div key={sub.id} className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
                <div className="flex items-center gap-2">
                  <Badge tone={sub.active ? "success" : "neutral"}>{sub.active ? "Active" : "Paused"}</Badge>
                  <p className="text-sm font-medium text-fg">{sub.triggerKey}</p>
                </div>
                <p className="mt-1 truncate text-xs text-fg-muted">{sub.targetUrl}</p>
                <p className="mt-1 text-xs text-fg-faint">Created {formatDate(sub.createdAt)}</p>
                <p className="mt-2 text-xs font-medium text-fg-muted">Recent deliveries</p>
                {sub.recentDeliveries.length === 0 ? (
                  <p className="text-xs text-fg-faint">None yet.</p>
                ) : (
                  <div className="mt-1 flex flex-col gap-1">
                    {sub.recentDeliveries.map((d) => (
                      <div key={d.id} className="flex items-center gap-2 text-xs">
                        <Badge tone={d.status === "success" ? "success" : d.status === "failed" ? "danger" : "neutral"}>{d.status}</Badge>
                        <span className="text-fg-faint">{formatDate(d.createdAt)} · {formatTime(d.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
              <p className="text-xs text-fg-faint">Status</p>
              <Badge tone={detail.status === "connected" ? "success" : detail.status === "needs_attention" ? "danger" : "neutral"} className="mt-1">
                {detail.status.replace("_", " ")}
              </Badge>
            </div>
            <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
              <p className="text-xs text-fg-faint">Connected since</p>
              <p className="mt-1 text-sm font-medium text-fg">{detail.connectedAt ? formatDate(detail.connectedAt) : "—"}</p>
            </div>
            <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
              <p className="text-xs text-fg-faint">Last synced</p>
              <p className="mt-1 text-sm font-medium text-fg">{detail.lastSyncAt ? `${formatDate(detail.lastSyncAt)} · ${formatTime(detail.lastSyncAt)}` : "Never"}</p>
            </div>
          </div>

          {detail.tokenExpiresAt && (
            <p className="text-xs text-fg-faint">Token expires {formatDate(detail.tokenExpiresAt)} · {formatTime(detail.tokenExpiresAt)}</p>
          )}

          <div className="flex gap-2">
            {detail.status === "connected" && canManuallySync(detail.category) && (
              <Button size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                {syncMutation.isPending ? "Syncing…" : "Sync now"}
              </Button>
            )}
            {detail.category === "accounting" && (
              <Link href="/integrations/accounting-ecommerce">
                <Button size="sm" variant="outline">
                  Manage mappings
                </Button>
              </Link>
            )}
            {detail.category === "ecommerce" && (
              <Link href="/integrations/accounting-ecommerce">
                <Button size="sm" variant="outline">
                  Manage sync
                </Button>
              </Link>
            )}
            {detail.status === "not_connected" ? (
              <span className="text-xs text-fg-faint">
                <PlugZap className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                Connect this provider from{" "}
                <Link href="/integrations" className="text-primary hover:underline">
                  Integrations
                </Link>
              </span>
            ) : (
              <Button size="sm" variant="destructive" onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}>
                <ShieldOff className="h-3.5 w-3.5" aria-hidden />
                Disconnect
              </Button>
            )}
          </div>

          {detail.fieldMapping && detail.fieldMapping.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-fg">Field mapping</p>
              <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-fg-faint">
                      <th className="px-4 py-2 font-medium">Category</th>
                      <th className="px-4 py-2 font-medium">Account code</th>
                      <th className="px-4 py-2 font-medium">Tax code</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.fieldMapping.map((m) => (
                      <tr key={m.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2 text-fg-muted">{m.productCategory ?? <span className="italic">Default</span>}</td>
                        <td className="px-4 py-2 text-fg-muted">{m.externalAccountCode}</td>
                        <td className="px-4 py-2 text-fg-muted">{m.externalTaxCode ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {detail.category === "ecommerce" && detail.conflicts && detail.conflicts.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-fg">Conflict history</p>
              <p className="mb-2 text-xs text-fg-faint">Every real stock conflict this sync has detected — resolved automatically, most-recently-updated side wins.</p>
              <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-fg-faint">
                      <th className="px-4 py-2 font-medium">SKU</th>
                      <th className="px-4 py-2 font-medium">Winner</th>
                      <th className="px-4 py-2 font-medium">Local qty</th>
                      <th className="px-4 py-2 font-medium">Remote qty</th>
                      <th className="px-4 py-2 font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.conflicts.map((c) => (
                      <tr key={c.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2 font-medium text-fg">{c.sku}</td>
                        <td className="px-4 py-2">
                          <Badge tone={c.winner === "remote" ? "primary" : "neutral"}>{c.winner}</Badge>
                        </td>
                        <td className="px-4 py-2 text-fg-muted">{c.localQty}</td>
                        <td className="px-4 py-2 text-fg-muted">{c.remoteQty}</td>
                        <td className="px-4 py-2 text-xs text-fg-faint">{formatDate(c.createdAt)} · {formatTime(c.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-medium text-fg">Sync activity</p>
            {detail.syncLog.length === 0 ? (
              <p className="text-sm text-fg-faint">No sync activity recorded yet.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {detail.syncLog.map((entry, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <Badge tone={entry.success ? "success" : "danger"}>{entry.success ? "success" : "failed"}</Badge>
                    <span className="text-fg-faint">{formatDate(entry.occurredAt)} · {formatTime(entry.occurredAt)}</span>
                    {entry.message && <span className="text-fg-muted">{entry.message}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

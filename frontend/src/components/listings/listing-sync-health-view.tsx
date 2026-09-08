"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, X, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { EmptyState } from "@/components/shared/empty-state";
import { fetchSyncLog, fetchListingHealth, fetchCitationAudit } from "@/lib/master-listing-api";
import { formatDate } from "@/lib/format";

export function ListingSyncHealthView() {
  const healthQuery = useQuery({ queryKey: ["listing-health"], queryFn: fetchListingHealth });
  const syncLogQuery = useQuery({ queryKey: ["listing-sync-log"], queryFn: fetchSyncLog });
  const citationQuery = useQuery({ queryKey: ["citation-audit"], queryFn: fetchCitationAudit });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-5 font-display text-2xl font-bold text-fg">Sync &amp; Health</h1>

      {healthQuery.data && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Health score" value={`${healthQuery.data.score}`} />
          <StatCard label="Connected directories" value={`${healthQuery.data.connectedProviders.length} of ${healthQuery.data.totalProviders}`} />
          <StatCard label="Recent sync" value={healthQuery.data.hasRecentSync ? "Yes" : "No"} />
          <StatCard label="Mismatches" value={`${healthQuery.data.mismatchCount}`} />
        </div>
      )}

      <div className="mb-6 rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
        <p className="mb-3 text-sm font-medium text-fg">Citation audit</p>
        <p className="mb-3 text-xs text-fg-faint">Compares each directory&apos;s last-synced record against your current Master Business Record.</p>
        {citationQuery.isError ? (
          <ErrorBanner title="Couldn't load the citation audit" onRetry={() => citationQuery.refetch()} />
        ) : citationQuery.isPending ? (
          <SkeletonRow />
        ) : citationQuery.data?.length === 0 ? (
          <p className="text-sm text-fg-faint">No directories have been synced yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                  <th className="px-2 py-2 text-start">Directory</th>
                  <th className="px-2 py-2 text-start">Last synced</th>
                  <th className="px-2 py-2 text-start">Status</th>
                  <th className="px-2 py-2 text-start">Mismatched fields</th>
                </tr>
              </thead>
              <tbody>
                {citationQuery.data?.map((row) => (
                  <tr key={row.provider} className="border-b border-border last:border-0">
                    <td className="px-2 py-2.5 font-medium text-fg">{row.provider}</td>
                    <td className="px-2 py-2.5 text-fg-muted">{formatDate(row.syncedAt)}</td>
                    <td className="px-2 py-2.5">
                      {row.matches ? (
                        <Badge tone="success">
                          <Check className="h-3 w-3" aria-hidden /> In sync
                        </Badge>
                      ) : (
                        <Badge tone="danger">
                          <X className="h-3 w-3" aria-hidden /> Drifted
                        </Badge>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-fg-faint">{row.mismatchedFields.join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
        <p className="mb-3 text-sm font-medium text-fg">Sync log</p>
        {syncLogQuery.isError ? (
          <ErrorBanner title="Couldn't load the sync log" onRetry={() => syncLogQuery.refetch()} />
        ) : syncLogQuery.isPending ? (
          <SkeletonRow />
        ) : syncLogQuery.data?.length === 0 ? (
          <EmptyState icon={History} title="No sync attempts yet" description="Run a sync from the Business Listings overview to see attempts here." />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {syncLogQuery.data?.map((log) => (
              <li key={log.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div>
                  <p className="font-medium text-fg">{log.provider}</p>
                  {log.message && <p className="text-xs text-fg-faint">{log.message}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={log.status === "success" ? "success" : "danger"}>{log.status}</Badge>
                  <span className="text-xs text-fg-faint">{formatDate(log.createdAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <p className="text-xs text-fg-faint">{label}</p>
      <p className="mt-1 font-display text-xl font-bold text-fg">{value}</p>
    </div>
  );
}

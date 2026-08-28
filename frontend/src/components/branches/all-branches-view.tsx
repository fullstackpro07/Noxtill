"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Settings, Power, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonCard, SkeletonRow } from "@/components/shared/skeleton";
import { BranchAdvisorCard } from "./branch-advisor-card";
import { CreateBranchDialog } from "./create-branch-dialog";
import { BranchDropdown } from "./branch-dropdown";
import { fetchBranches, deactivateBranch, reactivateBranch, fetchRollupDashboard, type Branch } from "@/lib/branches-api";
import { formatCurrency } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <span className="text-xs font-medium text-fg-faint">{label}</span>
      <p className="mt-1 font-display text-xl font-bold text-fg">{value}</p>
    </div>
  );
}

export function AllBranchesView({ currency }: { currency: string }) {
  const [creating, setCreating] = useState(false);
  const [deactivating, setDeactivating] = useState<Branch | null>(null);
  const queryClient = useQueryClient();

  const { data: branches = [], isPending, isError, refetch } = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });
  const { data: rollup } = useQuery({ queryKey: ["rollup-dashboard"], queryFn: () => fetchRollupDashboard() });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => deactivateBranch(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      toast.success("Branch deactivated.");
      setDeactivating(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't deactivate this branch — please try again."),
  });

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => reactivateBranch(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      toast.success("Branch reactivated.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't reactivate this branch — please try again."),
  });

  const revenueByBranch = new Map((rollup?.branches ?? []).map((b) => [b.businessId, b]));
  const bestPerformer = rollup?.branches.length ? [...rollup.branches].sort((a, b) => b.revenue - a.revenue)[0] : null;
  const needsAttention = rollup?.branches.length
    ? [...rollup.branches].filter((b) => b.reviewAvg != null && b.reviewAvg < 3.5).length
    : 0;

  if (isError) {
    return <ErrorBanner title="Couldn't load branches" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {isPending ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard label="Total branches" value={String(branches.length)} />
            <StatCard label="Combined revenue (30d)" value={formatCurrency(rollup?.totals.revenue ?? 0, currency)} />
            <StatCard label="Best performer" value={bestPerformer?.name ?? "—"} />
            <StatCard label="Needs attention" value={String(needsAttention)} />
          </>
        )}
      </div>

      <BranchAdvisorCard />

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-fg">All branches</p>
          <div className="flex items-center gap-2">
            <BranchDropdown />
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add branch
            </Button>
          </div>
        </div>

        {isPending ? (
          <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : branches.length === 0 ? (
          <EmptyState icon={Building2} title="No branches yet" description="Add your first branch to start comparing performance across locations." action={{ label: "Add branch", onClick: () => setCreating(true) }} />
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                  <th className="px-4 py-3 text-start">Branch</th>
                  <th className="px-4 py-3 text-start">Revenue (30d)</th>
                  <th className="px-4 py-3 text-start">Orders</th>
                  <th className="px-4 py-3 text-start">Customers</th>
                  <th className="px-4 py-3 text-start">Credit outstanding</th>
                  <th className="px-4 py-3 text-start">Status</th>
                  <th className="px-4 py-3 text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((b) => {
                  const stats = revenueByBranch.get(b.id);
                  return (
                    <tr key={b.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-fg">{b.name}</span>
                          {!b.parentId && <Badge tone="primary">Main</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-fg-muted">{formatCurrency(stats?.revenue ?? 0, currency)}</td>
                      <td className="px-4 py-3 text-fg-muted">{stats?.ordersCount ?? 0}</td>
                      <td className="px-4 py-3 text-fg-muted">{stats?.customerCount ?? 0}</td>
                      <td className="px-4 py-3 text-fg-muted">{formatCurrency(stats?.creditOutstanding ?? 0, currency)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={b.active ? "success" : "neutral"}>{b.active ? "Active" : "Deactivated"}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/branches/${b.id}/settings`}>
                            <Button variant="ghost" size="sm" aria-label="Settings">
                              <Settings className="h-3.5 w-3.5" aria-hidden />
                            </Button>
                          </Link>
                          {b.parentId && (
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={b.active ? "Deactivate" : "Reactivate"}
                              onClick={() => (b.active ? setDeactivating(b) : reactivateMutation.mutate(b.id))}
                            >
                              <Power className="h-3.5 w-3.5" aria-hidden />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateBranchDialog open={creating} onClose={() => setCreating(false)} />

      <Dialog
        open={deactivating != null}
        onClose={() => setDeactivating(null)}
        title={deactivating ? `Deactivate "${deactivating.name}"?` : "Deactivate branch"}
        description="Historical data stays intact. Reactivate anytime from this same table."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeactivating(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => deactivating && deactivateMutation.mutate(deactivating.id)} disabled={deactivateMutation.isPending}>
              {deactivateMutation.isPending ? "Deactivating…" : "Deactivate"}
            </Button>
          </>
        }
      />
    </div>
  );
}

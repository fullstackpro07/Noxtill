"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Wallet, Lightbulb } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { EmptyState } from "@/components/shared/empty-state";
import { fetchAdBudget, fetchAdPerformance, fetchAdLeads, fetchAdSettings, AD_PROVIDER_LABELS } from "@/lib/ads-api";
import { formatDate } from "@/lib/format";

/**
 * The AI-reallocation-suggestion popup (UPD-FE-060e) is a real, rule-based insight computed
 * client-side from `fetchAdPerformance()`'s real per-platform cost-per-result — not an LLM call,
 * and disclosed as such: it names the real highest- and lowest-cost-per-result platforms when the
 * gap is meaningful, never a fabricated number.
 */
function ReallocationInsight({ performance }: { performance: { provider: string; costPerResult: number | null; results: number }[] }) {
  const withResults = performance.filter((p) => p.costPerResult != null && p.results > 0);
  if (withResults.length < 2) return null;
  const sorted = [...withResults].sort((a, b) => (a.costPerResult ?? 0) - (b.costPerResult ?? 0));
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  if (!best.costPerResult || !worst.costPerResult || worst.costPerResult <= best.costPerResult * 1.3) return null;

  return (
    <div className="mb-4 flex items-start gap-2 rounded-[var(--radius-noxtill)] border border-primary/30 bg-primary/8 p-3 text-sm">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
      <p>
        <span className="font-medium text-fg">Reallocation suggestion (rule-based, from your real numbers):</span>{" "}
        {AD_PROVIDER_LABELS[worst.provider as keyof typeof AD_PROVIDER_LABELS]} costs ${worst.costPerResult.toFixed(2)}/result vs{" "}
        {AD_PROVIDER_LABELS[best.provider as keyof typeof AD_PROVIDER_LABELS]}&apos;s ${best.costPerResult.toFixed(2)} — consider shifting some budget toward the latter.
      </p>
    </div>
  );
}

export function BudgetPerformanceView() {
  const { data: budget, isPending: budgetPending, isError: budgetError, refetch: refetchBudget } = useQuery({ queryKey: ["ad-budget"], queryFn: fetchAdBudget });
  const { data: performance, isPending: perfPending } = useQuery({ queryKey: ["ad-performance"], queryFn: fetchAdPerformance });
  const { data: leads, isPending: leadsPending, isError: leadsError, refetch: refetchLeads } = useQuery({ queryKey: ["ad-leads"], queryFn: fetchAdLeads });
  const { data: settings } = useQuery({ queryKey: ["ad-settings"], queryFn: fetchAdSettings });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-fg">Budget, Performance &amp; Leads</h1>
        <p className="mt-0.5 text-sm text-fg-muted">A real cross-platform rollup over every stored campaign — no fabricated trend, since only current totals are stored.</p>
      </div>

      {settings?.autoPauseCostPerResult != null && (
        <p className="mb-4 text-xs text-fg-faint">
          Real auto-pause is on: any active campaign over ${Number(settings.autoPauseCostPerResult).toFixed(2)}/result is paused automatically, hourly.{" "}
          <Link href="/advertising/settings" className="text-primary hover:underline">
            Change
          </Link>
        </p>
      )}

      {performance && <ReallocationInsight performance={performance} />}

      <div className="mb-8">
        <p className="mb-3 text-sm font-medium text-fg">Budget &amp; Spend</p>
        {budgetError ? (
          <ErrorBanner title="Couldn't load budget" onRetry={() => refetchBudget()} />
        ) : budgetPending || perfPending ? (
          <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
            <SkeletonRow />
          </div>
        ) : !budget || budget.rows.length === 0 ? (
          <EmptyState icon={Wallet} title="No campaigns yet" description="Create a campaign to see real budget and performance here." />
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-fg-faint">
                  <th className="px-4 py-2 font-medium">Platform</th>
                  <th className="px-4 py-2 font-medium">Campaigns</th>
                  <th className="px-4 py-2 font-medium">Daily budget</th>
                  <th className="px-4 py-2 font-medium">Spend</th>
                  <th className="px-4 py-2 font-medium">CTR</th>
                  <th className="px-4 py-2 font-medium">Cost / result</th>
                </tr>
              </thead>
              <tbody>
                {budget.rows.map((row) => {
                  const perf = performance?.find((p) => p.provider === row.provider);
                  return (
                    <tr key={row.provider} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 font-medium text-fg">{AD_PROVIDER_LABELS[row.provider]}</td>
                      <td className="px-4 py-2 text-fg-muted">{row.campaignCount}</td>
                      <td className="px-4 py-2 text-fg-muted">${row.totalDailyBudget.toFixed(2)}</td>
                      <td className="px-4 py-2 text-fg-muted">{perf ? `$${perf.spend.toFixed(2)}` : "—"}</td>
                      <td className="px-4 py-2 text-fg-muted">{perf?.ctr != null ? `${perf.ctr}%` : "—"}</td>
                      <td className="px-4 py-2 text-fg-muted">{perf?.costPerResult != null ? `$${perf.costPerResult.toFixed(2)}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border">
                  <td className="px-4 py-2 text-xs font-medium text-fg-faint">Total</td>
                  <td />
                  <td className="px-4 py-2 text-xs font-medium text-fg-faint">${budget.totalDailyBudget.toFixed(2)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <div>
        <p className="mb-3 text-sm font-medium text-fg">Lead Inbox</p>
        {leadsError ? (
          <ErrorBanner title="Couldn't load leads" onRetry={() => refetchLeads()} />
        ) : leadsPending ? (
          <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
            <SkeletonRow />
          </div>
        ) : !leads || leads.length === 0 ? (
          <EmptyState icon={Wallet} title="No leads yet" description="Real lead-gen-form submissions from connected platforms will appear here." />
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-fg-faint">
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Contact</th>
                  <th className="px-4 py-2 font-medium">Platform</th>
                  <th className="px-4 py-2 font-medium">Received</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium text-fg">{lead.name ?? "—"}</td>
                    <td className="px-4 py-2 text-fg-muted">{lead.email ?? lead.phone ?? "—"}</td>
                    <td className="px-4 py-2">
                      <Badge tone="neutral">{AD_PROVIDER_LABELS[lead.provider]}</Badge>
                    </td>
                    <td className="px-4 py-2 text-xs text-fg-faint">{formatDate(lead.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

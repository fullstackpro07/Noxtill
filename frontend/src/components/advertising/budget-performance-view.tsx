"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Wallet, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { EmptyState } from "@/components/shared/empty-state";
import { fetchAdBudget, fetchAdPerformance, fetchAdLeads, fetchAdSettings, AD_PROVIDER_LABELS } from "@/lib/ads-api";
import { suggestMarketingReallocation } from "@/lib/marketing-overview-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { formatDate } from "@/lib/format";

/**
 * AI-reallocation-suggestion (UPD-FE-060e) — a real Claude call via the shared, rate-limited AI
 * infra (`MarketingOverviewService.suggestReallocation`, already built for the cross-channel
 * Marketing Overview screen), grounded in this business's own real spend/results across every ad
 * platform. Reused rather than duplicated with a second, ads-only AI call.
 */
function ReallocationDialog({ onClose }: { onClose: () => void }) {
  const mutation = useMutation({
    mutationFn: () => suggestMarketingReallocation(),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't get a suggestion right now."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="AI reallocation ideas"
      description="Grounded in your own real spend and results across every channel — not a generic tip."
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      {mutation.data ? (
        <p className="text-sm text-fg">{mutation.data.suggestion}</p>
      ) : (
        <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {mutation.isPending ? "Thinking…" : "Get suggestion"}
        </Button>
      )}
    </Dialog>
  );
}

export function BudgetPerformanceView() {
  const [aiOpen, setAiOpen] = useState(false);
  const { data: budget, isPending: budgetPending, isError: budgetError, refetch: refetchBudget } = useQuery({ queryKey: ["ad-budget"], queryFn: fetchAdBudget });
  const { data: performance, isPending: perfPending } = useQuery({ queryKey: ["ad-performance"], queryFn: fetchAdPerformance });
  const { data: leads, isPending: leadsPending, isError: leadsError, refetch: refetchLeads } = useQuery({ queryKey: ["ad-leads"], queryFn: fetchAdLeads });
  const { data: settings } = useQuery({ queryKey: ["ad-settings"], queryFn: fetchAdSettings });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg">Budget, Performance &amp; Leads</h1>
          <p className="mt-0.5 text-sm text-fg-muted">A real cross-platform rollup over every stored campaign — no fabricated trend, since only current totals are stored.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setAiOpen(true)}>
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          AI reallocation ideas
        </Button>
      </div>

      {settings?.autoPauseCostPerResult != null && (
        <p className="mb-4 text-xs text-fg-faint">
          Real auto-pause is on: any active campaign over ${Number(settings.autoPauseCostPerResult).toFixed(2)}/result is paused automatically, hourly.{" "}
          <Link href="/advertising/settings" className="text-primary hover:underline">
            Change
          </Link>
        </p>
      )}

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

      {aiOpen && <ReallocationDialog onClose={() => setAiOpen(false)} />}
    </div>
  );
}

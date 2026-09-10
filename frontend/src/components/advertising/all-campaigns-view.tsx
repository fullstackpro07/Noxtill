"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Pause, Play, Copy, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { EmptyState } from "@/components/shared/empty-state";
import {
  fetchCampaigns,
  updateCampaign,
  createCampaign,
  fetchAdPerformance,
  fetchCampaignFatigue,
  AD_PROVIDER_LABELS,
  type AdCampaign,
  type AdProvider,
} from "@/lib/ads-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { formatDate } from "@/lib/format";

const STATUS_TONE: Record<AdCampaign["status"], "neutral" | "primary" | "success"> = {
  draft: "neutral",
  paused: "neutral",
  active: "success",
};

/** Real platform ads-manager home links — not a per-campaign deep link, since each provider's deep-link URL scheme needs account context this app doesn't broker a picker for yet. */
const PLATFORM_LINKS: Record<AdProvider, string> = {
  google_ads: "https://ads.google.com/aw/campaigns",
  meta_ads: "https://adsmanager.facebook.com",
  tiktok_ads: "https://ads.tiktok.com/i18n/perf/campaign",
  linkedin_ads: "https://www.linkedin.com/campaignmanager",
  pinterest_ads: "https://ads.pinterest.com/advertiser",
  snapchat_ads: "https://ads.snapchat.com",
  microsoft_ads: "https://ads.microsoft.com/campaign",
  amazon_ads: "https://advertising.amazon.com/campaign-manager",
  reddit_ads: "https://ads.reddit.com/campaigns",
};

export function AllCampaignsView() {
  const queryClient = useQueryClient();
  const [providerFilter, setProviderFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [budgetDraft, setBudgetDraft] = useState<Record<string, string>>({});

  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["ad-campaigns"], queryFn: fetchCampaigns });
  const { data: performance } = useQuery({ queryKey: ["ad-performance"], queryFn: fetchAdPerformance });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["ad-campaigns"] });

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "paused" | "active" }) => updateCampaign(id, { status }),
    onSuccess: () => {
      toast.success("Campaign updated.");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this campaign."),
  });

  const budgetMutation = useMutation({
    mutationFn: ({ id, dailyBudget }: { id: string; dailyBudget: number }) => updateCampaign(id, { dailyBudget }),
    onSuccess: (_data, vars) => {
      toast.success("Budget updated.");
      setBudgetDraft((prev) => {
        const next = { ...prev };
        delete next[vars.id];
        return next;
      });
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this budget."),
  });

  const duplicateMutation = useMutation({
    mutationFn: (c: AdCampaign) => createCampaign(c.provider, { name: `${c.goal} campaign (copy)`, goal: c.goal, dailyBudget: Number(c.budget), meta: c.providerMeta }),
    onSuccess: () => {
      toast.success("Campaign duplicated as a new draft.");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't duplicate this campaign."),
  });

  const filtered = (data ?? []).filter((c) => (!providerFilter || c.provider === providerFilter) && (!statusFilter || c.status === statusFilter));

  const perfByProvider = useMemo(() => new Map((performance ?? []).map((p) => [p.provider, p])), [performance]);
  const maxSpend = Math.max(1, ...(performance ?? []).map((p) => p.spend));
  const maxCpr = Math.max(1, ...(performance ?? []).map((p) => p.costPerResult ?? 0));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-fg">All Campaigns</h1>
        <p className="mt-0.5 text-sm text-fg-muted">Every real campaign across every connected platform, in one table — pause, resume, and adjust budget directly, applied at the provider when connected.</p>
      </div>

      {performance && performance.length > 0 && (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
            <p className="mb-2 text-xs font-medium text-fg-muted">Spend by platform</p>
            <div className="flex flex-col gap-1.5">
              {performance.map((p) => (
                <div key={p.provider} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 truncate text-xs text-fg-muted">{AD_PROVIDER_LABELS[p.provider]}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${(p.spend / maxSpend) * 100}%` }} />
                  </div>
                  <span className="w-14 shrink-0 text-right text-xs tabular-nums text-fg-faint">${p.spend.toFixed(0)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
            <p className="mb-2 text-xs font-medium text-fg-muted">Cost per result by platform</p>
            <div className="flex flex-col gap-1.5">
              {performance.map((p) => (
                <div key={p.provider} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 truncate text-xs text-fg-muted">{AD_PROVIDER_LABELS[p.provider]}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-[var(--chart-2)]" style={{ width: `${((p.costPerResult ?? 0) / maxCpr) * 100}%` }} />
                  </div>
                  <span className="w-14 shrink-0 text-right text-xs tabular-nums text-fg-faint">{p.costPerResult != null ? `$${p.costPerResult.toFixed(2)}` : "—"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mb-4 flex gap-2">
        <Select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} className="w-44">
          <option value="">All platforms</option>
          {Object.entries(AD_PROVIDER_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-36">
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="paused">Paused</option>
          <option value="active">Active</option>
        </Select>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load campaigns" onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Megaphone} title="No campaigns" description="Nothing matches this filter yet." />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-fg-faint">
                <th className="px-4 py-2 font-medium">Platform</th>
                <th className="px-4 py-2 font-medium">Goal</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Daily budget</th>
                <th className="px-4 py-2 font-medium">Spend</th>
                <th className="px-4 py-2 font-medium">Impressions</th>
                <th className="px-4 py-2 font-medium">CTR</th>
                <th className="px-4 py-2 font-medium">Trend</th>
                <th className="px-4 py-2 font-medium">Created</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const perf = perfByProvider.get(c.provider);
                const draft = budgetDraft[c.id];
                return (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium text-fg">{AD_PROVIDER_LABELS[c.provider]}</td>
                    <td className="px-4 py-2 text-fg-muted">{c.goal}</td>
                    <td className="px-4 py-2">
                      <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={1}
                          value={draft ?? String(c.budget)}
                          onChange={(e) => setBudgetDraft((prev) => ({ ...prev, [c.id]: e.target.value }))}
                          className="w-20"
                        />
                        {draft !== undefined && draft !== String(c.budget) && (
                          <Button size="sm" variant="ghost" disabled={budgetMutation.isPending} onClick={() => budgetMutation.mutate({ id: c.id, dailyBudget: Number(draft) })}>
                            Save
                          </Button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-fg-muted">{perf ? `$${perf.spend.toFixed(0)}` : "—"}</td>
                    <td className="px-4 py-2 text-fg-muted">{perf ? perf.impressions.toLocaleString() : "—"}</td>
                    <td className="px-4 py-2 text-fg-muted">{perf?.ctr != null ? `${perf.ctr}%` : "—"}</td>
                    <td className="px-4 py-2">
                      <FatigueBadge campaignId={c.id} enabled={c.status !== "draft"} />
                    </td>
                    <td className="px-4 py-2 text-xs text-fg-faint">{formatDate(c.createdAt)}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1">
                        {c.status !== "draft" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={c.status === "active" ? "Pause" : "Resume"}
                            disabled={toggleMutation.isPending}
                            onClick={() => toggleMutation.mutate({ id: c.id, status: c.status === "active" ? "paused" : "active" })}
                          >
                            {c.status === "active" ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" aria-label="Duplicate" disabled={duplicateMutation.isPending} onClick={() => duplicateMutation.mutate(c)}>
                          <Copy className="h-4 w-4" aria-hidden />
                        </Button>
                        <a href={PLATFORM_LINKS[c.provider]} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                          Open
                        </a>
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
  );
}

/**
 * Fatigue-warning depth fix — real, from `AdCampaignStatsSnapshot` rows the hourly stats-sync job
 * has actually captured. `sampleSize < 2` (no real trend yet) renders nothing, never a fabricated
 * "healthy" claim.
 */
function FatigueBadge({ campaignId, enabled }: { campaignId: string; enabled: boolean }) {
  const { data } = useQuery({
    queryKey: ["ad-campaign-fatigue", campaignId],
    queryFn: () => fetchCampaignFatigue(campaignId),
    enabled,
  });
  if (!data || data.sampleSize < 2) return <span className="text-xs text-fg-faint">—</span>;
  if (!data.fatigued) return <Badge tone="success">Stable</Badge>;
  return (
    <Badge tone="warning" title={`CTR down ${data.ctrDeclinePercent}% vs a week ago`}>
      <TrendingDown className="h-3 w-3" aria-hidden /> Fatigued
    </Badge>
  );
}

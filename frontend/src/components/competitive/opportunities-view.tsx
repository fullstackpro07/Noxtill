"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, X, Lightbulb, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { EmptyState } from "@/components/shared/empty-state";
import {
  fetchCompetitiveOpportunities,
  refreshCompetitiveOpportunities,
  dismissCompetitiveOpportunity,
  fetchCompetitiveSettings,
  updateCompetitiveSettings,
  type CompetitiveOpportunity,
  type CompetitiveSettings,
} from "@/lib/competitive-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const KIND_LABEL: Record<CompetitiveOpportunity["kind"], string> = {
  keyword: "Keyword",
  review: "Reviews",
  listing: "Listings",
  social: "Social",
};

export function OpportunitiesView() {
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["competitive-opportunities"],
    queryFn: fetchCompetitiveOpportunities,
  });

  const refreshMutation = useMutation({
    mutationFn: refreshCompetitiveOpportunities,
    onSuccess: (count) => {
      toast.success(count > 0 ? `Found ${count} gap${count === 1 ? "" : "s"}.` : "No gaps found — you're in good shape.");
      void queryClient.invalidateQueries({ queryKey: ["competitive-opportunities"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't refresh right now."),
  });

  const dismissMutation = useMutation({
    mutationFn: dismissCompetitiveOpportunity,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["competitive-opportunities"] }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't dismiss this."),
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg">Opportunities & Recommendations</h1>
          <p className="mt-0.5 text-sm text-fg-muted">Real gaps found in your listings, reviews, keywords, and social activity.</p>
        </div>
        <Button variant="outline" onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}>
          <RefreshCw className={`h-4 w-4 ${refreshMutation.isPending ? "animate-spin" : ""}`} aria-hidden />
          Refresh
        </Button>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load opportunities" onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="No gaps found"
          description="Hit refresh to run a fresh check, or check back after your next weekly scan."
        />
      ) : (
        <div className="mb-8 flex flex-col gap-3">
          {data.map((opp) => (
            <div key={opp.id} className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Badge tone="neutral">{KIND_LABEL[opp.kind]}</Badge>
                  <p className="mt-2 text-sm text-fg">{opp.evidence}</p>
                  {opp.recommendation && <p className="mt-1.5 text-sm font-medium text-primary">{opp.recommendation}</p>}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => dismissMutation.mutate(opp.id)}
                  disabled={dismissMutation.isPending}
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4 text-fg-faint" aria-hidden />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <SettingsSection />
    </div>
  );
}

function SettingsSection() {
  const { data, isPending } = useQuery({ queryKey: ["competitive-settings"], queryFn: fetchCompetitiveSettings });

  if (isPending || !data) {
    return (
      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
        <SkeletonRow />
      </div>
    );
  }
  return <SettingsForm key={JSON.stringify(data)} initial={data} />;
}

function SettingsForm({ initial }: { initial: CompetitiveSettings }) {
  const queryClient = useQueryClient();
  const [scanFrequencyDays, setScanFrequencyDays] = useState(initial.scanFrequencyDays);
  const [keywordRankAlertThreshold, setKeywordRankAlertThreshold] = useState(initial.keywordRankAlertThreshold);
  const [reviewFreshnessAlertDays, setReviewFreshnessAlertDays] = useState(initial.reviewFreshnessAlertDays);
  const [weeklyReportRecipient, setWeeklyReportRecipient] = useState(initial.weeklyReportRecipient ?? "");

  const mutation = useMutation({
    mutationFn: () =>
      updateCompetitiveSettings({
        scanFrequencyDays,
        keywordRankAlertThreshold,
        reviewFreshnessAlertDays,
        weeklyReportRecipient: weeklyReportRecipient.trim() || null,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["competitive-settings"], updated);
      toast.success("Settings saved.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save settings — please try again."),
  });

  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-fg">
        <Settings2 className="h-4 w-4 text-fg-faint" aria-hidden />
        Settings
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Input
          type="number"
          min={1}
          label="Scan frequency (days)"
          value={scanFrequencyDays}
          onChange={(e) => setScanFrequencyDays(Number(e.target.value))}
        />
        <Input
          type="number"
          min={1}
          label="Keyword rank alert threshold"
          hint="Alert when a keyword ranks worse than this"
          value={keywordRankAlertThreshold}
          onChange={(e) => setKeywordRankAlertThreshold(Number(e.target.value))}
        />
        <Input
          type="number"
          min={1}
          label="Review freshness alert (days)"
          value={reviewFreshnessAlertDays}
          onChange={(e) => setReviewFreshnessAlertDays(Number(e.target.value))}
        />
      </div>
      <Input
        type="email"
        label="Weekly report recipient (optional)"
        placeholder="owner@example.com"
        value={weeklyReportRecipient}
        onChange={(e) => setWeeklyReportRecipient(e.target.value)}
        hint="Saved for when weekly email reports ship — nothing is sent to this address yet."
      />
      <div className="flex justify-end">
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

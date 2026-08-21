"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { PermissionLockCard } from "@/components/shared/permission-lock-card";
import { SkeletonRow } from "@/components/shared/skeleton";
import { useSession } from "@/lib/session";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { formatDate } from "@/lib/format";
import { useNow } from "@/hooks/use-now";
import {
  AI_INSIGHT_CATEGORY_LABEL,
  fetchAiInsights,
  setInsightStatus,
  type AiInsightCategory,
  type LiveAiInsight,
} from "@/lib/ai-insights-api";

const CATEGORY_TONE: Record<AiInsightCategory, BadgeProps["tone"]> = {
  sales: "success",
  stock: "warning",
  customers: "primary",
  marketing: "primary",
  credit: "danger",
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function AiInsightsFeed() {
  const session = useSession();
  const [category, setCategory] = useState<AiInsightCategory | "all">("all");
  const [detail, setDetail] = useState<LiveAiInsight | null>(null);
  const queryClient = useQueryClient();

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["ai-insights", category],
    queryFn: () => fetchAiInsights({ category: category === "all" ? undefined : category, status: "new" }),
  });

  // Unfiltered-by-status so the summary cards reflect the real weekly total, not just what's still open.
  const { data: allInsights } = useQuery({
    queryKey: ["ai-insights-all", category],
    queryFn: () => fetchAiInsights({ category: category === "all" ? undefined : category }),
  });

  const now = useNow();
  const stats = useMemo(() => {
    const thisWeek = (allInsights ?? []).filter((i) => now - new Date(i.createdAt).getTime() < WEEK_MS);
    return {
      insightsThisWeek: thisWeek.length,
      actionsTaken: thisWeek.filter((i) => i.status === "actioned").length,
    };
  }, [allInsights, now]);

  const actionMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "actioned" | "dismissed" }) => setInsightStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-insights"] });
      queryClient.invalidateQueries({ queryKey: ["ai-insights-all"] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update this insight — please try again.");
    },
  });

  if (session.user.role === "staff") {
    return (
      <Card>
        <CardContent>
          <PermissionLockCard description="AI insights are limited to owners and managers." />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI insights</CardTitle>
        <Select value={category} onChange={(e) => setCategory(e.target.value as AiInsightCategory | "all")} className="w-36" aria-label="Filter by category">
          <option value="all">All categories</option>
          {(Object.keys(AI_INSIGHT_CATEGORY_LABEL) as AiInsightCategory[]).map((c) => (
            <option key={c} value={c}>
              {AI_INSIGHT_CATEGORY_LABEL[c]}
            </option>
          ))}
        </Select>
      </CardHeader>

      <div className="flex gap-4 border-b border-border px-5 pb-4 text-sm text-fg-muted">
        <span>
          <span className="font-semibold tabular-nums text-fg">{stats.insightsThisWeek}</span> this week
        </span>
        <span>
          <span className="font-semibold tabular-nums text-whatsapp">{stats.actionsTaken}</span> actioned
        </span>
      </div>

      <CardContent className={data && data.length > 0 ? "flex flex-col gap-3" : ""}>
        {isPending && (
          <div className="flex flex-col gap-1">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        )}

        {isError && <ErrorBanner title="Couldn't load AI insights" onRetry={() => refetch()} />}

        {!isPending && !isError && data && data.length === 0 && (
          <EmptyState icon={Sparkles} title="No open insights" description="New observations from your real business data will appear here." />
        )}

        {data?.map((insight) => (
          <InsightCard
            key={insight.id}
            insight={insight}
            onAction={() => actionMutation.mutate({ id: insight.id, status: "actioned" })}
            onDismiss={() => actionMutation.mutate({ id: insight.id, status: "dismissed" })}
            onOpenDetail={() => setDetail(insight)}
            pending={actionMutation.isPending}
          />
        ))}
      </CardContent>

      <InsightDetailDialog insight={detail} onClose={() => setDetail(null)} />
    </Card>
  );
}

function InsightCard({
  insight,
  onAction,
  onDismiss,
  onOpenDetail,
  pending,
}: {
  insight: LiveAiInsight;
  onAction: () => void;
  onDismiss: () => void;
  onOpenDetail: () => void;
  pending: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface-2/40 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Badge tone={CATEGORY_TONE[insight.category]}>{AI_INSIGHT_CATEGORY_LABEL[insight.category]}</Badge>
        <span className="text-xs text-fg-faint">{formatDate(insight.createdAt)}</span>
      </div>
      <button onClick={onOpenDetail} className="text-start hover:underline">
        <p className="text-sm text-fg">{insight.observation}</p>
      </button>
      <p className="mt-1.5 text-xs text-fg-faint">Based on: {insight.sourceFigure}</p>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDismiss} disabled={pending}>
          <X className="h-3.5 w-3.5" aria-hidden />
          Dismiss
        </Button>
        <Button variant="outline" size="sm" onClick={onAction} disabled={pending}>
          <Check className="h-3.5 w-3.5" aria-hidden />
          Actioned
        </Button>
      </div>
    </div>
  );
}

function InsightDetailDialog({ insight, onClose }: { insight: LiveAiInsight | null; onClose: () => void }) {
  if (!insight) return null;
  return (
    <Dialog open={!!insight} onClose={onClose} title="Insight detail">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Badge tone={CATEGORY_TONE[insight.category]}>{AI_INSIGHT_CATEGORY_LABEL[insight.category]}</Badge>
          <span className="text-xs text-fg-faint">{formatDate(insight.createdAt)}</span>
        </div>
        <p className="text-sm text-fg">{insight.observation}</p>
        <div className="rounded-[var(--radius-sm)] border border-border bg-surface-2/50 p-3.5">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-fg-faint">
            The real figure this was generated from
          </p>
          <p className="text-sm text-fg">{insight.sourceFigure}</p>
        </div>
      </div>
    </Dialog>
  );
}

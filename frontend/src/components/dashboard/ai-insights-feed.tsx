"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { formatDate } from "@/lib/format";
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

export function AiInsightsFeed() {
  const [category, setCategory] = useState<AiInsightCategory | "all">("all");
  const queryClient = useQueryClient();

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["ai-insights", category],
    queryFn: () => fetchAiInsights({ category: category === "all" ? undefined : category, status: "new" }),
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "actioned" | "dismissed" }) => setInsightStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-insights"] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update this insight — please try again.");
    },
  });

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
            pending={actionMutation.isPending}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function InsightCard({
  insight,
  onAction,
  onDismiss,
  pending,
}: {
  insight: LiveAiInsight;
  onAction: () => void;
  onDismiss: () => void;
  pending: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface-2/40 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Badge tone={CATEGORY_TONE[insight.category]}>{AI_INSIGHT_CATEGORY_LABEL[insight.category]}</Badge>
        <span className="text-xs text-fg-faint">{formatDate(insight.createdAt)}</span>
      </div>
      <p className="text-sm text-fg">{insight.observation}</p>
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

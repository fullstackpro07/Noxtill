"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Check, X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { PermissionLockCard } from "@/components/shared/permission-lock-card";
import { useSession } from "@/lib/session";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { formatDate, formatCurrency } from "@/lib/format";
import { useNow } from "@/hooks/use-now";
import {
  AI_INSIGHT_CATEGORY_LABEL,
  fetchAiInsights,
  setInsightStatus,
  type AiInsightCategory,
  type LiveAiInsight,
} from "@/lib/ai-insights-api";

const CATEGORY_COLOR: Record<AiInsightCategory, { bg: string; fg: string }> = {
  sales: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)" },
  stock: { bg: "var(--app-warning-bg)", fg: "var(--app-warning-text)" },
  customers: { bg: "#EEF4FF", fg: "#3538CD" },
  marketing: { bg: "#F5EBFE", fg: "#7E22CE" },
  credit: { bg: "#FEF3F2", fg: "var(--app-danger-strong)" },
};

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  new: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)" },
  actioned: { bg: "#EEF4FF", fg: "#1849A9" },
  dismissed: { bg: "var(--app-surface-2)", fg: "var(--app-text-faint)" },
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function AiInsightsFeed() {
  const session = useSession();
  const [category, setCategory] = useState<AiInsightCategory | "all">("all");
  const [detail, setDetail] = useState<LiveAiInsight | null>(null);
  const queryClient = useQueryClient();

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["ai-insights-all", category],
    queryFn: () => fetchAiInsights({ category: category === "all" ? undefined : category }),
  });

  const now = useNow();
  const stats = useMemo(() => {
    const thisWeek = (data ?? []).filter((i) => now - new Date(i.createdAt).getTime() < WEEK_MS);
    return {
      insightsThisWeek: thisWeek.length,
      actionsTaken: thisWeek.filter((i) => i.status === "actioned").length,
      estimatedImpact: thisWeek.reduce((sum, i) => sum + (i.estimatedImpact != null ? Number(i.estimatedImpact) : 0), 0),
    };
  }, [data, now]);

  const actionMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "actioned" | "dismissed" }) => setInsightStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-insights-all"] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update this insight — please try again.");
    },
  });

  if (session.user.role === "staff") {
    return (
      <div className="rounded-[14px] p-5" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <PermissionLockCard description="AI insights are limited to owners and managers." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-[19px] font-extrabold tracking-tight" style={{ color: "var(--app-text)" }}>AI Insights</h2>
          <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Generated from your own data — every insight shows its source figure.</p>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <a
            href="/assistant/settings"
            className="rounded-[10px] px-3.5 py-2 text-[12.5px] font-semibold"
            style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)", background: "var(--app-surface)" }}
          >
            Insight settings
          </a>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-[10px] px-4 py-2 text-[12.5px] font-bold text-white"
            style={{ background: "var(--app-primary)" }}
          >
            Refresh insights
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(["all", ...Object.keys(AI_INSIGHT_CATEGORY_LABEL)] as (AiInsightCategory | "all")[]).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className="rounded-full px-3 py-1.5 text-[12px] font-semibold"
            style={category === c ? { background: "var(--app-sidebar-bg)", color: "#fff" } : { border: "1px solid var(--app-border)", color: "var(--app-text-faint)" }}
          >
            {c === "all" ? "All" : AI_INSIGHT_CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3.5">
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <p className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Insights this week</p>
          <p className="mt-1.5 text-[23px] font-extrabold tabular-nums" style={{ color: "var(--app-text)" }}>{stats.insightsThisWeek}</p>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <p className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Actioned</p>
          <p className="mt-1.5 text-[23px] font-extrabold tabular-nums" style={{ color: "var(--app-primary)" }}>{stats.actionsTaken}</p>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <p className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Estimated impact</p>
          <p className="mt-1.5 text-[23px] font-extrabold tabular-nums" style={{ color: "var(--app-text)" }}>
            {stats.estimatedImpact > 0 ? formatCurrency(stats.estimatedImpact, session.business.currency) : "—"}
          </p>
        </div>
      </div>

      <div className="rounded-[14px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        {isPending && (
          <div className="flex flex-col gap-2.5">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-[90px] animate-pulse rounded-[12px]" style={{ background: "var(--app-surface-2)" }} />)}
          </div>
        )}

        {isError && <ErrorBanner title="Couldn't load AI insights" onRetry={() => refetch()} />}

        {!isPending && !isError && data && data.length === 0 && (
          <EmptyState icon={Sparkles} title="No open insights" description="New observations from your real business data will appear here." />
        )}

        {data && data.length > 0 && (
          <div className="flex flex-col gap-3">
            {data.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                onAction={() => actionMutation.mutate({ id: insight.id, status: "actioned" })}
                onDismiss={() => actionMutation.mutate({ id: insight.id, status: "dismissed" })}
                onOpenDetail={() => setDetail(insight)}
                pending={actionMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>

      <InsightDetailDialog insight={detail} onClose={() => setDetail(null)} />
      <p className="text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>AI Recommendations are suggestions only — Noxtill never changes your data without you.</p>
    </div>
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
  const session = useSession();
  const tone = CATEGORY_COLOR[insight.category];
  const statusTone = STATUS_STYLE[insight.status] ?? STATUS_STYLE.new;
  return (
    <article
      className="rounded-[14px] p-[16px_18px]"
      style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", boxShadow: "0 1px 2px rgba(16,24,40,.04)", opacity: insight.status === "dismissed" ? 0.55 : 1 }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-[6px] px-2 py-1 text-[10.5px] font-extrabold uppercase tracking-wide" style={{ background: "var(--app-success-bg)", color: "var(--app-primary)" }}>
          AI Insight
        </span>
        <span className="text-[11px] font-bold" style={{ color: tone.fg }}>{AI_INSIGHT_CATEGORY_LABEL[insight.category]}</span>
        <span className="ms-auto rounded-full px-2.5 py-0.5 text-[10.5px] font-bold" style={{ background: statusTone.bg, color: statusTone.fg }}>
          {insight.status === "new" ? "New" : insight.status === "actioned" ? "Actioned" : "Dismissed"}
        </span>
      </div>
      <button onClick={onOpenDetail} className="text-start">
        <p className="mt-2.5 text-[13.5px] leading-relaxed" style={{ color: "var(--app-text)", maxWidth: "74ch" }}>{insight.observation}</p>
      </button>
      <div className="mt-2.5 rounded-[10px] p-[10px_12px]" style={{ background: "var(--app-surface-2)" }}>
        <span className="text-[10.5px] font-extrabold uppercase tracking-wide" style={{ color: "var(--app-text-disabled)" }}>Source data</span>
        <p className="mt-1 text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{insight.sourceFigure}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {insight.estimatedImpact != null && (
          <span className="text-[11.5px] font-bold" style={{ color: "var(--app-success-text)" }}>
            Est. impact {formatCurrency(Number(insight.estimatedImpact), session.business.currency)}
          </span>
        )}
        <div className="ms-auto flex gap-2">
          <button
            onClick={onOpenDetail}
            className="rounded-[9px] px-3 py-1.5 text-[12px] font-semibold"
            style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}
          >
            View detail
          </button>
          <button
            onClick={onDismiss}
            disabled={pending}
            className="flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[12px] font-semibold disabled:opacity-60"
            style={{ color: "var(--app-text-faint)" }}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Dismiss
          </button>
          <button
            onClick={onAction}
            disabled={pending}
            className="flex items-center gap-1.5 rounded-[9px] px-3.5 py-1.5 text-[12px] font-bold text-white disabled:opacity-60"
            style={{ background: "var(--app-primary)" }}
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
            Actioned
          </button>
        </div>
      </div>
    </article>
  );
}

function InsightDetailDialog({ insight, onClose }: { insight: LiveAiInsight | null; onClose: () => void }) {
  const session = useSession();
  if (!insight) return null;
  const tone = CATEGORY_COLOR[insight.category];
  return (
    <Dialog open={!!insight} onClose={onClose} title="Insight detail">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="rounded-[6px] px-2 py-0.5 text-[10.5px] font-bold" style={{ background: tone.bg, color: tone.fg }}>
            {AI_INSIGHT_CATEGORY_LABEL[insight.category]}
          </span>
          <span className="text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{formatDate(insight.createdAt)}</span>
        </div>
        <p className="text-[13px]" style={{ color: "var(--app-text)" }}>{insight.observation}</p>
        <div className="rounded-[10px] p-3.5" style={{ background: "var(--app-surface-2)", border: "1px solid var(--app-border)" }}>
          <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wide" style={{ color: "var(--app-text-disabled)" }}>
            The real figure this was generated from
          </p>
          <p className="text-[13px]" style={{ color: "var(--app-text)" }}>{insight.sourceFigure}</p>
        </div>
        {insight.estimatedImpact != null && (
          <div className="rounded-[10px] p-3.5" style={{ background: "var(--app-surface-2)", border: "1px solid var(--app-border)" }}>
            <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wide" style={{ color: "var(--app-text-disabled)" }}>Estimated impact</p>
            <p className="text-[13px]" style={{ color: "var(--app-text)" }}>{formatCurrency(Number(insight.estimatedImpact), session.business.currency)}</p>
          </div>
        )}
      </div>
    </Dialog>
  );
}

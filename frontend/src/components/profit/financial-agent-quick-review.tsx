"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { fetchFinancialAgentRuns, runFinancialAgent, type FinancialAgentRun } from "@/lib/profit-api";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";

export function FinancialAgentQuickReview({
  month,
  branchId,
}: {
  month: string;
  branchId?: string;
}) {
  const session = useSession();
  const queryClient = useQueryClient();
  const canRun = session.user.role === "owner" || session.user.role === "manager";
  const queryKey = ["financial-agent-runs", session.business.id] as const;
  const runsQuery = useQuery({
    queryKey,
    queryFn: fetchFinancialAgentRuns,
    enabled: canRun,
  });
  const runMutation = useMutation({
    mutationFn: () => runFinancialAgent({ month, period: "month", branchId }),
    onSuccess: (run) => {
      queryClient.setQueryData<FinancialAgentRun[]>(queryKey, (current = []) =>
        [run, ...current.filter((item) => item.id !== run.id)].slice(0, 10),
      );
      void queryClient.invalidateQueries({ queryKey });
      toast.success("Finance review saved. No journal or reconciliation records were changed.");
    },
    onError: (error) => toast.error(
      error instanceof ApiError ? error.message : "Could not run the Finance review.",
    ),
  });
  const latestRun = runsQuery.data?.[0];
  const latestRecommendation = latestRun?.recommendations[0];

  return (
    <section
      className="rounded-[15px] border p-4"
      style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}
      aria-label="Financial Intelligence Agent review"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-[14px] font-extrabold" style={{ color: "var(--app-text)" }}>
            Financial Intelligence Agent
          </h2>
          <p className="mb-0 mt-1 max-w-[760px] text-[11.5px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
            Review the canonical Profit Analytics snapshot for {month}. This is read-only: it does not post journals, accept statement matches or move money.
          </p>
        </div>
        {canRun && (
          <button
            type="button"
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)}
            className="rounded-lg px-3 py-2 text-[11px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--app-primary)" }}
          >
            {runMutation.isPending ? "Reviewing…" : "Run finance review"}
          </button>
        )}
      </div>

      {canRun && runsQuery.isPending ? (
        <p className="mb-0 mt-3 text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Loading saved reviews…</p>
      ) : runsQuery.isError ? (
        <p role="alert" className="mb-0 mt-3 text-[11.5px]" style={{ color: "var(--app-text-muted)" }}>
          {runsQuery.error instanceof ApiError ? runsQuery.error.message : "Saved Finance reviews are temporarily unavailable."}
        </p>
      ) : latestRun ? (
        <div className="mt-3 rounded-xl p-3" style={{ background: "var(--app-surface-2)" }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11.5px] font-bold" style={{ color: "var(--app-text)" }}>
              {latestRun.status === "completed" ? "Latest review saved" : `Latest run: ${latestRun.status}`}
            </span>
            <span className="text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>
              {new Date(latestRun.createdAt).toLocaleString()}
            </span>
          </div>
          {(latestRun.output.summary || latestRecommendation?.summary) && (
            <p className="mb-0 mt-1.5 text-[11.5px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
              {latestRun.output.summary ?? latestRecommendation?.summary}
            </p>
          )}
        </div>
      ) : (
        <p className="mb-0 mt-3 text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>
          No saved review yet. {canRun ? "Run one to save the period's source data and assumptions." : "An owner or manager can run a review."}
        </p>
      )}

      <Link href="/profit" className="mt-3 inline-flex text-[11px] font-bold" style={{ color: "var(--app-primary)" }}>
        Open full Finance review
      </Link>
    </section>
  );
}

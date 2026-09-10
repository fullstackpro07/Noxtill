"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { fetchAdSettings, updateAdSettings } from "@/lib/ads-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

/**
 * Advertising Settings (UPD-FE-129) — `autoPauseCostPerResult` here is real-enforced hourly by
 * the backend's `AdAutoPauseProcessor`, which pauses a real active campaign at the provider the
 * moment its own stored stats show a real cost-per-result over this threshold.
 */
export function AdvertisingSettingsView() {
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["ad-settings"], queryFn: fetchAdSettings });

  const [budgetCap, setBudgetCap] = useState("");
  const [budgetCapDirty, setBudgetCapDirty] = useState(false);
  const [autoPause, setAutoPause] = useState("");
  const [autoPauseDirty, setAutoPauseDirty] = useState(false);

  const currentBudgetCap = budgetCapDirty ? budgetCap : data?.defaultDailyBudgetCap != null ? String(data.defaultDailyBudgetCap) : "";
  const currentAutoPause = autoPauseDirty ? autoPause : data?.autoPauseCostPerResult != null ? String(data.autoPauseCostPerResult) : "";

  const mutation = useMutation({
    mutationFn: updateAdSettings,
    onSuccess: () => {
      toast.success("Advertising settings updated.");
      setBudgetCapDirty(false);
      setAutoPauseDirty(false);
      void queryClient.invalidateQueries({ queryKey: ["ad-settings"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update advertising settings."),
  });

  if (isError) return <ErrorBanner title="Couldn't load advertising settings" onRetry={() => refetch()} />;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-fg">Advertising Settings</h1>
        <p className="mt-0.5 text-sm text-fg-muted">Business-wide defaults and real, hourly-enforced auto-pause rules across every connected ad platform.</p>
      </div>

      {isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
            <p className="text-sm font-medium text-fg">Default daily budget cap</p>
            <p className="mt-0.5 text-xs text-fg-muted">A soft ceiling shown when creating a campaign. Leave blank for no cap.</p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <Input
                label="Amount ($/day)"
                type="number"
                min={1}
                value={currentBudgetCap}
                onChange={(e) => {
                  setBudgetCap(e.target.value);
                  setBudgetCapDirty(true);
                }}
                className="w-32"
              />
              {budgetCapDirty && (
                <Button
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ defaultDailyBudgetCap: currentBudgetCap === "" ? null : Number(currentBudgetCap) })}
                >
                  Save
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
            <p className="text-sm font-medium text-fg">Auto-pause by cost per result</p>
            <p className="mt-0.5 text-xs text-fg-muted">
              Real enforcement: every hour, any active campaign whose own real cost-per-result exceeds this is automatically paused — at the provider when connected, always locally.
              Leave blank to disable.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <Input
                label="Threshold ($/result)"
                type="number"
                min={0.01}
                step={0.01}
                value={currentAutoPause}
                onChange={(e) => {
                  setAutoPause(e.target.value);
                  setAutoPauseDirty(true);
                }}
                className="w-32"
              />
              {autoPauseDirty && (
                <Button
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ autoPauseCostPerResult: currentAutoPause === "" ? null : Number(currentAutoPause) })}
                >
                  Save
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
            <div>
              <p className="text-sm font-medium text-fg">Require approval before launch</p>
              <p className="mt-0.5 text-xs text-fg-muted">
                Every campaign is already created paused. This records the requirement; a manager still resumes it manually from All Campaigns — a distinct approval gate on top of that isn&apos;t built yet.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={data?.requireApproval ?? false}
              onClick={() => mutation.mutate({ requireApproval: !(data?.requireApproval ?? false) })}
              disabled={mutation.isPending}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${data?.requireApproval ? "bg-primary" : "bg-surface-2"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${data?.requireApproval ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { SkeletonCard, SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { fetchAiSettings, updateAiSettings, type AiFeatureToggles } from "@/lib/ai-settings-api";
import { formatCurrency } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const FEATURE_LABELS: Record<keyof AiFeatureToggles, string> = {
  voiceEntry: "Voice entry",
  photoDigitizer: "Photo digitizer",
  reviewReplies: "Review replies",
  campaignCopy: "Campaign copy",
  insights: "Insights",
  whatIf: "What-if simulator",
  assistant: "Assistant & Help",
};

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <span className="text-xs font-medium text-fg-faint">{label}</span>
      <p className="mt-1 font-display text-xl font-bold text-fg">{value}</p>
    </div>
  );
}

export function AiSettingsView({ currency }: { currency: string }) {
  const [showDisclosure, setShowDisclosure] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const queryClient = useQueryClient();

  const { data: settings, isPending, isError, refetch } = useQuery({
    queryKey: ["ai-settings"],
    queryFn: fetchAiSettings,
  });

  const toggleMutation = useMutation({
    mutationFn: (key: keyof AiFeatureToggles) =>
      updateAiSettings({ featureToggles: { [key]: !settings?.featureToggles[key] } }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["ai-settings"], updated);
      toast.success("AI Settings updated.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this — please try again."),
  });

  if (isError) {
    return <ErrorBanner title="Couldn't load AI Settings" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {isPending || !settings ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard label="AI spend this month" value={formatCurrency(settings.usageThisMonth.totalCostUsd, currency)} />
            <StatCard label="Monthly cost cap" value={formatCurrency(settings.aiMonthlyCostCapUsd, currency)} />
            <StatCard label="Rate limit" value={`${settings.aiRateLimitPerMinute}/min`} />
            <StatCard
              label="Queries this month"
              value={String(
                Object.values(settings.usageThisMonth.byFeature).reduce((s, f) => s + f.calls, 0) +
                  settings.usageThisMonth.other.calls,
              )}
            />
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-noxtill)] border border-primary/20 bg-primary/5 px-4 py-3">
        <button
          type="button"
          onClick={() => setShowDisclosure(true)}
          className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <Info className="h-4 w-4" aria-hidden />
          How Noxtill uses AI (required disclosure)
        </button>
        <Button size="sm" variant="outline" onClick={() => setConfiguring(true)}>
          <Settings2 className="h-3.5 w-3.5" aria-hidden />
          Cost cap & rate limit
        </Button>
      </div>

      {isPending || !settings ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          {Array.from({ length: 7 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                <th className="px-4 py-3 text-start">Feature</th>
                <th className="px-4 py-3 text-start">Usage this month</th>
                <th className="px-4 py-3 text-start">Cost this month</th>
                <th className="px-4 py-3 text-end">Enabled</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(FEATURE_LABELS) as (keyof AiFeatureToggles)[]).map((key) => {
                const usage = settings.usageThisMonth.byFeature[key];
                const enabled = settings.featureToggles[key];
                return (
                  <tr key={key} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-fg">{FEATURE_LABELS[key]}</td>
                    <td className="px-4 py-3 tabular-nums text-fg-muted">{usage.calls} queries</td>
                    <td className="px-4 py-3 tabular-nums text-fg-muted">{formatCurrency(usage.costUsd, currency)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={enabled}
                          onClick={() => toggleMutation.mutate(key)}
                          disabled={toggleMutation.isPending}
                          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${enabled ? "bg-whatsapp" : "bg-surface-2"}`}
                        >
                          <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {settings.usageThisMonth.other.calls > 0 && (
                <tr className="bg-surface-2/40">
                  <td className="px-4 py-3 text-fg-faint">Other AI usage</td>
                  <td className="px-4 py-3 tabular-nums text-fg-faint">{settings.usageThisMonth.other.calls} queries</td>
                  <td className="px-4 py-3 tabular-nums text-fg-faint">{formatCurrency(settings.usageThisMonth.other.costUsd, currency)}</td>
                  <td className="px-4 py-3 text-end text-xs text-fg-faint">not independently toggleable</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showDisclosure && settings && (
        <Dialog open onClose={() => setShowDisclosure(false)} title="How Noxtill uses AI">
          <p className="text-sm text-fg-muted">{settings.disclosureText}</p>
        </Dialog>
      )}

      {configuring && settings && (
        <RateLimitDialog
          current={{ aiMonthlyCostCapUsd: settings.aiMonthlyCostCapUsd, aiRateLimitPerMinute: settings.aiRateLimitPerMinute }}
          onClose={() => setConfiguring(false)}
        />
      )}
    </div>
  );
}

function RateLimitDialog({
  current,
  onClose,
}: {
  current: { aiMonthlyCostCapUsd: number; aiRateLimitPerMinute: number };
  onClose: () => void;
}) {
  const [costCap, setCostCap] = useState(String(current.aiMonthlyCostCapUsd));
  const [rateLimit, setRateLimit] = useState(String(current.aiRateLimitPerMinute));
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      updateAiSettings({
        aiMonthlyCostCapUsd: Number(costCap),
        aiRateLimitPerMinute: Number(rateLimit),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["ai-settings"], updated);
      toast.success("Limits updated.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this — please try again."),
  });

  const valid = Number(costCap) >= 0 && Number(rateLimit) >= 1;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Cost cap & rate limit"
      description="Applies across every AI feature for this business."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Monthly cost cap (USD)" type="number" min={0} step="0.01" value={costCap} onChange={(e) => setCostCap(e.target.value)} />
        <Input label="Rate limit (requests/min)" type="number" min={1} value={rateLimit} onChange={(e) => setRateLimit(e.target.value)} />
      </div>
    </Dialog>
  );
}

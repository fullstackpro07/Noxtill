"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonCard } from "@/components/shared/skeleton";
import { fetchMarketingOverview, suggestMarketingReallocation } from "@/lib/marketing-overview-api";
import { ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <span className="text-xs font-medium text-fg-faint">{label}</span>
        <span className="font-display text-xl font-bold tabular-nums text-fg">{value}</span>
      </CardContent>
    </Card>
  );
}

export function MarketingOverviewPanel({ currency }: { currency: string }) {
  const [aiOpen, setAiOpen] = useState(false);
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["marketing-overview"], queryFn: fetchMarketingOverview });

  if (isError) {
    return <ErrorBanner title="Couldn't load the marketing overview" onRetry={() => refetch()} />;
  }
  if (isPending || !data) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  const { totals, channels } = data;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label="Campaigns sent" value={String(totals.results)} />
        <StatTile label="Delivered" value={String(totals.delivered)} />
        <StatTile label="Redemptions" value={String(totals.redemptions)} />
        <StatTile label="Attributed revenue" value={formatCurrency(totals.revenue, currency)} />
        <StatTile label="Ad spend" value={formatCurrency(totals.spend, currency)} />
        <StatTile label="Blended cost/result" value={totals.blendedCostPerResult != null ? formatCurrency(totals.blendedCostPerResult, currency) : "—"} />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-fg">Channel ROI</p>
            <Button variant="outline" size="sm" onClick={() => setAiOpen(true)}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              AI reallocation ideas
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                  <th className="px-4 py-3 text-start">Channel</th>
                  <th className="px-4 py-3 text-start">Spend</th>
                  <th className="px-4 py-3 text-start">Results</th>
                  <th className="px-4 py-3 text-start">Delivered</th>
                  <th className="px-4 py-3 text-start">Cost/result</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((row) => (
                  <tr key={row.channel} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-fg">{row.channel}</td>
                    <td className="px-4 py-3 text-fg-muted">{formatCurrency(row.spend, currency)}</td>
                    <td className="px-4 py-3 text-fg-muted">{row.results}</td>
                    <td className="px-4 py-3 text-fg-muted">{row.delivered ?? "—"}</td>
                    <td className="px-4 py-3 text-fg-muted">{row.costPerResult != null ? formatCurrency(row.costPerResult, currency) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {aiOpen && <ReallocationDialog onClose={() => setAiOpen(false)} />}
    </div>
  );
}

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
      description="Grounded in your own real spend and results — not a generic tip."
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

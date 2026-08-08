"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { CampaignBuilder } from "./campaign-builder";
import { fetchCampaigns } from "@/lib/campaigns-api";
import { formatDate } from "@/lib/format";

export function CampaignsTab() {
  const [building, setBuilding] = useState(false);
  const { data: campaigns = [], isPending, isError, refetch } = useQuery({
    queryKey: ["campaigns"],
    queryFn: fetchCampaigns,
  });

  if (building) return <CampaignBuilder onDone={() => setBuilding(false)} />;

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setBuilding(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          New campaign
        </Button>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load campaigns" description="Check your connection and try again." onRetry={() => refetch()} />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                <th className="px-4 py-3 text-start">Message</th>
                <th className="px-4 py-3 text-start">Audience</th>
                <th className="px-4 py-3 text-start">Sent</th>
                <th className="px-4 py-3 text-start">Date</th>
              </tr>
            </thead>
            <tbody>
              {isPending ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td colSpan={4} className="px-4 py-3">
                      <SkeletonRow />
                    </td>
                  </tr>
                ))
              ) : campaigns.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-fg-faint">
                    No campaigns sent yet.
                  </td>
                </tr>
              ) : (
                campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                    <td className="max-w-64 truncate px-4 py-3 font-medium text-fg">{c.body}</td>
                    <td className="px-4 py-3 text-fg-muted">{c.segment}</td>
                    <td className="px-4 py-3 text-fg-muted">{c.sentCount}</td>
                    <td className="px-4 py-3 text-fg-muted">{formatDate(c.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

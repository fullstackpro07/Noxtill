"use client";

import { Badge } from "@/components/ui/badge";
import type { AdCampaignSummary } from "@/lib/google-ads";
import { formatCurrency } from "@/lib/format";

export function AdCampaignsTable({ campaigns, currency }: { campaigns: AdCampaignSummary[]; currency: string }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
            <th className="px-4 py-3 text-start">Campaign</th>
            <th className="px-4 py-3 text-start">Status</th>
            <th className="px-4 py-3 text-start">Spend</th>
            <th className="px-4 py-3 text-start">Clicks</th>
            <th className="px-4 py-3 text-start">Conversions</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => (
            <tr key={c.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
              <td className="px-4 py-3 font-medium text-fg">{c.name}</td>
              <td className="px-4 py-3">
                <Badge tone={c.status === "active" ? "success" : "neutral"} className="capitalize">
                  {c.status}
                </Badge>
              </td>
              <td className="px-4 py-3 text-fg-muted">{formatCurrency(c.spend, currency)}</td>
              <td className="px-4 py-3 text-fg-muted">{c.clicks}</td>
              <td className="px-4 py-3 text-fg-muted">{c.conversions}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

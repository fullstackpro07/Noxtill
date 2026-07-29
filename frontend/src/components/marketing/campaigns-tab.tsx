"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CampaignBuilder } from "./campaign-builder";
import { CAMPAIGNS } from "@/lib/campaigns";
import { formatDate } from "@/lib/format";

export function CampaignsTab() {
  const [building, setBuilding] = useState(false);

  if (building) return <CampaignBuilder onDone={() => setBuilding(false)} />;

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setBuilding(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          New campaign
        </Button>
      </div>
      <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
              <th className="px-4 py-3 text-start">Campaign</th>
              <th className="px-4 py-3 text-start">Audience</th>
              <th className="px-4 py-3 text-start">Sent</th>
              <th className="px-4 py-3 text-start">Delivered</th>
              <th className="px-4 py-3 text-start">Replied</th>
              <th className="px-4 py-3 text-start">Date</th>
            </tr>
          </thead>
          <tbody>
            {CAMPAIGNS.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                <td className="px-4 py-3 font-medium text-fg">{c.name}</td>
                <td className="px-4 py-3 text-fg-muted">{c.audience}</td>
                <td className="px-4 py-3 text-fg-muted">{c.sentCount}</td>
                <td className="px-4 py-3 text-fg-muted">{c.deliveredCount}</td>
                <td className="px-4 py-3 text-fg-muted">{c.repliedCount}</td>
                <td className="px-4 py-3 text-fg-muted">{formatDate(c.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import { Radio } from "lucide-react";
import { CHANNEL_STATS } from "@/lib/analytics";

export function ChannelStats() {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <p className="mb-3 flex items-center gap-1.5 text-sm font-medium text-fg">
        <Radio className="h-4 w-4 text-fg-faint" aria-hidden />
        Channels
      </p>
      <div className="flex flex-col gap-2.5">
        {CHANNEL_STATS.map((c) => {
          const rate = c.sent > 0 ? Math.round((c.delivered / c.sent) * 100) : 0;
          return (
            <div key={c.channel} className="flex items-center justify-between text-sm">
              <span className="text-fg">{c.channel}</span>
              <span className="text-fg-muted">
                {c.delivered}/{c.sent} <span className="text-fg-faint">({rate}%)</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

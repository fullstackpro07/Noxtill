"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { useDataFreshness } from "@/hooks/use-data-freshness";
import { useNow } from "@/hooks/use-now";
import { formatRelativeTime } from "@/lib/format";

const STATUS_STYLE = {
  live: { bg: "var(--app-success-bg, #E8F7EE)", fg: "var(--app-success-text, #0E8442)", border: "var(--app-success-border, #BFE7CF)" },
  delayed: { bg: "var(--app-warning-bg, #FEF6E7)", fg: "var(--app-warning-text, #B54708)", border: "var(--app-warning-border, #FDE3B3)" },
  offline: { bg: "#FEF3F2", fg: "var(--app-danger-strong, #B42318)", border: "#FDD9D6" },
} as const;

/** Real per-source sync status — lists every active query in the cache with its actual last-updated
 * time (no simulated per-module "sync" states, since the backend doesn't report one). */
export function DataStatusPill() {
  const [open, setOpen] = useState(false);
  const { status, label } = useDataFreshness();
  const style = STATUS_STYLE[status];
  const queryClient = useQueryClient();
  const now = useNow(15_000);

  const sources = queryClient
    .getQueryCache()
    .getAll()
    .filter((q) => q.state.dataUpdatedAt > 0)
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)
    .slice(0, 12);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-[7px] text-[11.5px] font-bold sm:flex"
        style={{ border: `1px solid ${style.border}`, background: style.bg, color: style.fg }}
      >
        <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: "currentColor" }} aria-hidden />
        {label}
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Data status">
        <div className="flex flex-col gap-2">
          {sources.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--app-text-faintest, #667085)" }}>Nothing loaded yet.</p>
          ) : (
            sources.map((q) => {
              const age = now - q.state.dataUpdatedAt;
              const stale = age > 5 * 60_000;
              return (
                <div
                  key={q.queryHash}
                  className="flex flex-wrap items-center gap-2.5 rounded-[10px] p-2.5"
                  style={{ border: "1px solid var(--app-border, #E6EAF0)" }}
                >
                  <span className="min-w-[140px] flex-1 truncate text-[12.5px] font-bold" style={{ color: "var(--app-text, #101828)" }}>
                    {Array.isArray(q.queryKey) ? q.queryKey.filter((k) => typeof k === "string" || typeof k === "number").join(" · ") : String(q.queryKey)}
                  </span>
                  <span className="text-[11px]" style={{ color: "var(--app-text-disabled, #98A2B3)" }}>synced {formatRelativeTime(age)}</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={stale ? { background: "var(--app-warning-bg, #FEF6E7)", color: "var(--app-warning-text, #B54708)" } : { background: "var(--app-success-bg, #E8F7EE)", color: "var(--app-success-text, #0E8442)" }}
                  >
                    {stale ? "Stale" : "Synced"}
                  </span>
                  {stale && (
                    <button
                      type="button"
                      onClick={() => queryClient.invalidateQueries({ queryKey: q.queryKey })}
                      className="flex items-center gap-1 text-[11px] font-bold"
                      style={{ color: "var(--app-primary, #12A150)" }}
                    >
                      <RefreshCw className="h-3 w-3" aria-hidden />
                      Retry
                    </button>
                  )}
                </div>
              );
            })
          )}
          <p className="mt-1 text-[11px]" style={{ color: "var(--app-text-disabled, #98A2B3)" }}>
            A delayed source keeps showing its last good figures rather than blanks.
          </p>
        </div>
      </Dialog>
    </>
  );
}

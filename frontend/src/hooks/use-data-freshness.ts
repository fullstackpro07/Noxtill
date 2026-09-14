"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useNow } from "./use-now";

export type DataFreshness = "live" | "delayed" | "offline";

/** Real freshness signal — the age of the most recently updated query anywhere in the cache.
 * Not a per-source sync status (the backend doesn't expose one), but a genuine measurement of
 * how current the data on screen actually is, recomputed every tick via `useNow`. */
export function useDataFreshness(): { status: DataFreshness; label: string } {
  const queryClient = useQueryClient();
  const now = useNow(15_000);

  const queries = queryClient.getQueryCache().getAll();
  const timestamps = queries.map((q) => q.state.dataUpdatedAt).filter((t) => t > 0);
  if (timestamps.length === 0) return { status: "offline", label: "No data yet" };

  const mostRecent = Math.max(...timestamps);
  const ageMs = now - mostRecent;
  const ageMin = Math.max(1, Math.round(ageMs / 60_000));
  const ago = ageMs < 30_000 ? "just now" : `updated ${ageMin} min ago`;

  if (ageMs < 15 * 60_000) return { status: "live", label: `Live · ${ago}` };
  if (ageMs < 60 * 60_000) return { status: "delayed", label: `Delayed · ${ago}` };
  return { status: "offline", label: `Offline · ${ago}` };
}

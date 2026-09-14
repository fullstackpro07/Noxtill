"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchActions } from "@/lib/action-center-api";

/** Real open-action count for the Action Center sidebar/tab badge — same data the Action Center page itself lists. */
export function useActionsOpenCount(): number {
  const { data } = useQuery({
    queryKey: ["action-center", "badge-count"],
    queryFn: () => fetchActions(),
    staleTime: 60_000,
  });
  return data?.counts.open ?? 0;
}

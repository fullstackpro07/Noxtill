"use client";

import { useQuery, useQueries } from "@tanstack/react-query";
import { fetchWidgetData } from "@/lib/widgets-api";
import { widgetByKey } from "@/lib/widgets";
import type { DashboardRange } from "@/store/dashboard-store";

/** staleTime matches the backend's own 60s in-process cache window (BE-067) — refetching sooner would just hit the same cached value. */
const WIDGET_STALE_TIME_MS = 60_000;

/** Only `rangeAware` widgets actually vary by range — passing `days` for anything else would just fragment the cache for no benefit. */
function rangeFor(key: string, days: DashboardRange): DashboardRange | undefined {
  return widgetByKey(key)?.rangeAware ? days : undefined;
}

export function useWidgetData(key: string, days: DashboardRange = 30) {
  const effectiveDays = rangeFor(key, days);
  return useQuery({
    queryKey: ["widget", key, effectiveDays],
    queryFn: () => fetchWidgetData(key, effectiveDays),
    staleTime: WIDGET_STALE_TIME_MS,
  });
}

export function useWidgetDataMany(keys: string[], days: DashboardRange = 30) {
  return useQueries({
    queries: keys.map((key) => {
      const effectiveDays = rangeFor(key, days);
      return {
        queryKey: ["widget", key, effectiveDays],
        queryFn: () => fetchWidgetData(key, effectiveDays),
        staleTime: WIDGET_STALE_TIME_MS,
      };
    }),
  });
}

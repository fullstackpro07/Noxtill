import { apiFetch } from "@/lib/api-client";
import type { DashboardRange } from "@/store/dashboard-store";

/**
 * GET /widgets/:key — real computed value from the backend, cached server-side for 60s per (business, key, days).
 * `days` only affects the ~11 "(this month)" widgets flagged `rangeAware` in the frontend's own registry — every
 * other widget is a snapshot or "today" widget by design and ignores it server-side too, so it's harmless to pass.
 */
export function fetchWidgetData(key: string, days?: DashboardRange): Promise<unknown> {
  const query = days ? `?days=${days}` : "";
  return apiFetch<unknown>(`/widgets/${key}${query}`);
}

import { DASHBOARD_LAYOUT_VERSION } from "@/lib/dashboard-rows";

interface DashboardConfig {
  layout?: string[];
  kpiExtras?: string[];
  layoutVersion?: number;
  [key: string]: unknown;
}

/** GET /dashboard/config — returns `{}` for a business that has never saved a layout; no server default. */
export function fetchDashboardConfig(): Promise<DashboardConfig> {
  return apiFetch<DashboardConfig>("/dashboard/config");
}

/**
 * PUT /dashboard/config — backend does zero shape validation on `config`, so this shape is a
 * frontend convention, not an enforced contract. `layoutVersion` lets the reader recognize and
 * ignore a config saved under an earlier, incompatible meaning of "layout" instead of applying it
 * and silently corrupting the current one. Returns the saved config back, unwrapped (same shape as GET).
 */
export function saveDashboardConfig(layout: string[], kpiExtras: string[]): Promise<DashboardConfig> {
  return apiFetch<DashboardConfig>("/dashboard/config", {
    method: "PUT",
    body: JSON.stringify({ config: { layout, kpiExtras, layoutVersion: DASHBOARD_LAYOUT_VERSION } }),
  });
}

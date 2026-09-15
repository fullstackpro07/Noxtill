import type { LucideIcon } from "lucide-react";
import { Gauge, Lightbulb, LineChart, Trophy, LayoutGrid, Sparkles, Rocket } from "lucide-react";

export type DashboardRowKey =
  | "kpi"
  | "insights"
  | "overview"
  | "products"
  | "quick"
  | "intelligence"
  | "getting-started";

export interface DashboardRowDef {
  key: DashboardRowKey;
  title: string;
  module: string;
  icon: LucideIcon;
  /** "outer" rows are full-width, above the main/sidebar split; "inner" rows sit inside the main
   * column next to the fixed sidebar. Reordering only ever happens within the same scope, so the
   * page's structural nesting (which the pixel-exact design itself defines) is never disturbed. */
  scope: "outer" | "inner";
}

/** Customize Dashboard, row-level (fix-it v2): each entry is one whole, pixel-exact row copied
 * verbatim from the design — reordering swaps entire rows' positions; the cards *inside* a row
 * (e.g. Business Health's fixed 292px column beside the flexible Business Overview chart) never
 * get rearranged, since that inner layout is literal design markup, not driven by this list. */
export const DASHBOARD_ROWS: DashboardRowDef[] = [
  { key: "kpi", title: "KPI Row (6 metrics)", module: "Dashboard", icon: Gauge, scope: "outer" },
  { key: "insights", title: "Opportunities, Needs Attention & Business Health", module: "Dashboard", icon: Lightbulb, scope: "outer" },
  { key: "overview", title: "Business Overview chart & Health Score", module: "Profit & Analytics", icon: LineChart, scope: "inner" },
  { key: "products", title: "Top Products, Recent Orders & Top Channels", module: "Products", icon: Trophy, scope: "inner" },
  { key: "quick", title: "Quick Actions", module: "Dashboard", icon: LayoutGrid, scope: "inner" },
  { key: "intelligence", title: "Business Intelligence", module: "Dashboard", icon: Sparkles, scope: "inner" },
  { key: "getting-started", title: "Getting Started", module: "Dashboard", icon: Rocket, scope: "inner" },
];

export const DEFAULT_DASHBOARD_ROW_LAYOUT: DashboardRowKey[] = DASHBOARD_ROWS.map((r) => r.key);

/** Bumped whenever what a "layout" array is allowed to contain changes shape (generic tiles →
 * bespoke sections → whole rows, each incompatible with the last). Saved alongside `layout` on the
 * server so a stale config from an earlier schema is recognized and ignored on load instead of
 * silently corrupting the current one. */
export const DASHBOARD_LAYOUT_VERSION = 3;

export function dashboardRowByKey(key: string): DashboardRowDef | undefined {
  return DASHBOARD_ROWS.find((r) => r.key === key);
}

export const DASHBOARD_ROW_MODULES: string[] = Array.from(new Set(DASHBOARD_ROWS.map((r) => r.module)));

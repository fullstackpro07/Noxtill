"use client";

import { useWidgetData } from "@/hooks/use-widget-data";
import { widgetByKey, type WidgetDef } from "@/lib/widgets";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { KpiCard } from "./kpi-row";

/** Real value + one-line detail for every widget kind the registry defines — same computation the
 * old (deleted) widget-card.tsx used, just rendered as a KpiRow-style tile instead of a separate
 * grid. Never fabricates: an unrecognized/missing shape falls through to "—". */
function formatWidgetValue(widget: WidgetDef, data: unknown, currency: string): { value: string; recs?: string } {
  switch (widget.kind) {
    case "currency": {
      const { revenue, total, orders } = (data ?? {}) as { revenue?: number; total?: number; orders?: number };
      const amount = revenue ?? total ?? 0;
      return { value: formatCurrency(amount, currency), recs: orders !== undefined ? `${formatNumber(orders)} orders` : undefined };
    }
    case "currencyPair": {
      const { revenue, grossProfit } = (data ?? {}) as { revenue?: number; grossProfit?: number };
      return { value: formatCurrency(revenue ?? 0, currency), recs: grossProfit !== undefined ? `Profit ${formatCurrency(grossProfit, currency)}` : undefined };
    }
    case "count": {
      const { count } = (data ?? {}) as { count?: number };
      return { value: formatNumber(count ?? 0) };
    }
    case "percent": {
      const { rate } = (data ?? {}) as { rate?: number };
      return { value: formatPercent(rate ?? 0) };
    }
    case "average": {
      const { average } = (data ?? {}) as { average?: number | null };
      return { value: average == null ? "—" : average.toFixed(1) };
    }
    case "productList": {
      const items = (data ?? []) as { name: string; units: number; revenue: number }[];
      if (items.length === 0) return { value: "—", recs: "No sales yet" };
      return { value: formatCurrency(items[0].revenue, currency), recs: items[0].name };
    }
    case "leaderboard": {
      const items = (data ?? []) as { name: string; total: number }[];
      if (items.length === 0) return { value: "—", recs: "No sales yet" };
      return { value: formatCurrency(items[0].total, currency), recs: items[0].name };
    }
    case "competitorList": {
      const items = (data ?? []) as { platformRef: string; rating: number | null }[];
      if (items.length === 0) return { value: "—", recs: "No competitors tracked" };
      return { value: items[0].rating == null ? "—" : items[0].rating.toFixed(1), recs: items[0].platformRef };
    }
    case "quota": {
      const { used, quota, percent } = (data ?? {}) as { used?: number; quota?: number; percent?: number };
      return { value: `${formatNumber(used ?? 0)} / ${formatNumber(quota ?? 0)}`, recs: percent !== undefined ? `${Math.round(percent)}% used` : undefined };
    }
    case "channelBreakdown": {
      const breakdown = (data ?? {}) as Record<string, number>;
      const total = Object.values(breakdown).reduce((sum, n) => sum + n, 0);
      return { value: formatNumber(total), recs: "messages sent" };
    }
    default:
      return { value: "—" };
  }
}

export function KpiExtraCard({ widgetKey, currency }: { widgetKey: string; currency: string }) {
  const widget = widgetByKey(widgetKey);
  const { data, isPending } = useWidgetData(widgetKey);
  if (!widget) return null;

  if (isPending) {
    return <KpiCard label={widget.title} value={null} placeholder="Loading…" />;
  }
  const { value, recs } = formatWidgetValue(widget, data, currency);
  return <KpiCard label={widget.title} value={value} recs={recs} />;
}

"use client";

import { WidgetCard } from "./widget-card";
import { SkeletonCard } from "@/components/shared/skeleton";
import { InlineError } from "@/components/shared/error-states";
import { widgetByKey } from "@/lib/widgets";
import { useWidgetData } from "@/hooks/use-widget-data";
import type { DashboardRange } from "@/store/dashboard-store";

function WidgetGridCell({ widgetKey, currency, range }: { widgetKey: string; currency: string; range: DashboardRange }) {
  const widget = widgetByKey(widgetKey);
  const { data, isPending, isError } = useWidgetData(widgetKey, range);

  if (!widget) return null;
  if (isPending) return <SkeletonCard />;
  if (isError) {
    return (
      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
        <InlineError message={`Couldn't load ${widget.title.toLowerCase()}`} />
      </div>
    );
  }

  return <WidgetCard widget={widget} data={data} currency={currency} />;
}

/** 4-across on desktop, 2 on mobile (FE-007). Each widget fetches and caches its own data independently (INT-002). */
export function WidgetGridView({ layout, currency, range }: { layout: string[]; currency: string; range: DashboardRange }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {layout.map((key) => (
        <WidgetGridCell key={key} widgetKey={key} currency={currency} range={range} />
      ))}
    </div>
  );
}

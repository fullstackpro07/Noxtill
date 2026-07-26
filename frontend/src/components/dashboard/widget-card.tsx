import { Star, X, GripVertical } from "lucide-react";
import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { WidgetDef } from "@/lib/widgets";

interface WidgetCardProps {
  widget: WidgetDef;
  data: unknown;
  currency: string;
  editing?: boolean;
  onRemove?: () => void;
  dragHandleAttributes?: DraggableAttributes;
  dragHandleListeners?: DraggableSyntheticListeners;
  style?: React.CSSProperties;
  className?: string;
}

function WidgetBody({ widget, data, currency }: { widget: WidgetDef; data: unknown; currency: string }) {
  switch (widget.kind) {
    case "currency": {
      const { revenue, total, orders } = data as { revenue?: number; total?: number; orders?: number };
      const amount = revenue ?? total ?? 0;
      return (
        <div>
          <p className="font-display text-2xl font-bold text-fg">{formatCurrency(amount, currency)}</p>
          {orders !== undefined && <p className="mt-0.5 text-xs text-fg-faint">{orders} orders</p>}
        </div>
      );
    }
    case "currencyPair": {
      const { revenue, grossProfit } = data as { revenue: number; grossProfit: number };
      return (
        <div className="flex items-end gap-4">
          <div>
            <p className="font-display text-2xl font-bold text-fg">{formatCurrency(revenue, currency)}</p>
            <p className="mt-0.5 text-xs text-fg-faint">Revenue</p>
          </div>
          <div>
            <p className="font-display text-lg font-semibold text-whatsapp">{formatCurrency(grossProfit, currency)}</p>
            <p className="mt-0.5 text-xs text-fg-faint">Gross profit</p>
          </div>
        </div>
      );
    }
    case "count": {
      const { count } = data as { count: number };
      return <p className="font-display text-2xl font-bold text-fg">{formatNumber(count)}</p>;
    }
    case "percent": {
      const { rate } = data as { rate: number };
      return <p className="font-display text-2xl font-bold text-fg">{formatPercent(rate)}</p>;
    }
    case "average": {
      const { average } = data as { average: number };
      const isRating = widget.key === "reviews_average";
      return (
        <div className="flex items-center gap-1.5">
          <p className="font-display text-2xl font-bold text-fg">{average.toFixed(1)}</p>
          {isRating && <Star className="h-4 w-4 fill-accent text-accent" aria-hidden />}
        </div>
      );
    }
    case "quota": {
      const { used, quota, percent } = data as { used: number; quota: number; percent: number };
      return (
        <div>
          <p className="font-display text-lg font-bold text-fg">
            {formatNumber(used)} <span className="text-sm font-normal text-fg-faint">/ {formatNumber(quota)}</span>
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className={cn("h-full rounded-full", percent >= 95 ? "bg-destructive" : percent >= 80 ? "bg-accent" : "bg-primary")}
              style={{ width: `${Math.min(100, percent)}%` }}
            />
          </div>
        </div>
      );
    }
    case "productList": {
      const items = data as { name: string; units: number; revenue: number }[];
      return (
        <ul className="space-y-1.5">
          {items.slice(0, 3).map((item) => (
            <li key={item.name} className="flex items-center justify-between text-sm">
              <span className="truncate text-fg-muted">{item.name}</span>
              <span className="shrink-0 font-medium text-fg">{formatCurrency(item.revenue, currency)}</span>
            </li>
          ))}
        </ul>
      );
    }
    case "leaderboard": {
      const items = data as { name: string; total: number }[];
      return (
        <ul className="space-y-1.5">
          {items.slice(0, 3).map((item, i) => (
            <li key={item.name} className="flex items-center gap-2 text-sm">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-fg-muted">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-fg-muted">{item.name}</span>
              <span className="shrink-0 font-medium text-fg">{formatCurrency(item.total, currency)}</span>
            </li>
          ))}
        </ul>
      );
    }
    case "competitorList": {
      const items = data as { platformRef: string; rating: number; reviewsCount: number }[];
      return (
        <ul className="space-y-1.5">
          {items.slice(0, 3).map((item) => (
            <li key={item.platformRef} className="flex items-center justify-between text-sm">
              <span className="min-w-0 flex-1 truncate text-fg-muted">{item.platformRef}</span>
              <span className="flex shrink-0 items-center gap-1 font-medium text-fg">
                <Star className="h-3 w-3 fill-accent text-accent" aria-hidden />
                {item.rating.toFixed(1)}
              </span>
            </li>
          ))}
        </ul>
      );
    }
    case "channelBreakdown": {
      const breakdown = data as Record<string, number>;
      const total = Object.values(breakdown).reduce((a, b) => a + b, 0) || 1;
      return (
        <div className="space-y-1.5">
          {Object.entries(breakdown).map(([channel, count]) => (
            <div key={channel} className="flex items-center gap-2 text-xs">
              <span className="w-16 shrink-0 capitalize text-fg-faint">{channel}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(count / total) * 100}%` }} />
              </div>
              <span className="w-8 shrink-0 text-right font-medium text-fg">{count}</span>
            </div>
          ))}
        </div>
      );
    }
    default:
      return null;
  }
}

export function WidgetCard({
  widget,
  data,
  currency,
  editing,
  onRemove,
  dragHandleAttributes,
  dragHandleListeners,
  style,
  className,
}: WidgetCardProps) {
  const Icon = widget.icon;
  return (
    <Card style={style} className={cn("relative flex flex-col gap-3 p-4", editing && "select-none", className)}>
      {editing && (
        <>
          <button
            type="button"
            aria-label="Remove widget"
            onClick={onRemove}
            className="absolute -end-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-[var(--shadow-sm)]"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Drag to reorder"
            className="absolute -start-2 -top-2 flex h-6 w-6 cursor-grab items-center justify-center rounded-full bg-surface-2 text-fg-faint shadow-[var(--shadow-sm)] active:cursor-grabbing"
            {...dragHandleAttributes}
            {...dragHandleListeners}
          >
            <GripVertical className="h-3.5 w-3.5" aria-hidden />
          </button>
        </>
      )}
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/8 text-primary">
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
        <p className="truncate text-xs font-medium text-fg-muted">{widget.title}</p>
      </div>
      <WidgetBody widget={widget} data={data} currency={currency} />
    </Card>
  );
}

"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { WidgetCard } from "./widget-card";
import { Skeleton } from "@/components/shared/skeleton";
import { widgetByKey } from "@/lib/widgets";
import { useWidgetData } from "@/hooks/use-widget-data";
import type { DashboardRange } from "@/store/dashboard-store";

export function SortableWidgetCard({
  id,
  currency,
  range,
  onRemove,
}: {
  id: string;
  currency: string;
  range: DashboardRange;
  onRemove: () => void;
}) {
  const widget = widgetByKey(id);
  const { data, isPending } = useWidgetData(id, range);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  if (!widget) return null;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
    >
      {isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <WidgetCard
          widget={widget}
          data={data}
          currency={currency}
          editing
          onRemove={onRemove}
          dragHandleAttributes={attributes}
          dragHandleListeners={listeners}
        />
      )}
    </div>
  );
}

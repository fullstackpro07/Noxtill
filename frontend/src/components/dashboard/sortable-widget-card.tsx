"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { WidgetCard } from "./widget-card";
import { widgetByKey, getMockWidgetData } from "@/lib/widgets";

export function SortableWidgetCard({ id, currency, onRemove }: { id: string; currency: string; onRemove: () => void }) {
  const widget = widgetByKey(id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  if (!widget) return null;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
    >
      <WidgetCard
        widget={widget}
        data={getMockWidgetData(id)}
        currency={currency}
        editing
        onRemove={onRemove}
        dragHandleAttributes={attributes}
        dragHandleListeners={listeners}
      />
    </div>
  );
}

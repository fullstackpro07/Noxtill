"use client";

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { SortableWidgetCard } from "./sortable-widget-card";
import { useDashboardStore } from "@/store/dashboard-store";

export function WidgetGridCustomize({ currency }: { currency: string }) {
  const draftLayout = useDashboardStore((s) => s.draftLayout) ?? [];
  const reorderDraft = useDashboardStore((s) => s.reorderDraft);
  const removeWidget = useDashboardStore((s) => s.removeWidget);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = draftLayout.indexOf(String(active.id));
    const newIndex = draftLayout.indexOf(String(over.id));
    reorderDraft(arrayMove(draftLayout, oldIndex, newIndex));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={draftLayout} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 gap-4 pt-2 lg:grid-cols-4">
          {draftLayout.map((key) => (
            <SortableWidgetCard key={key} id={key} currency={currency} onRemove={() => removeWidget(key)} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

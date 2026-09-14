"use client";

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ChevronUp, ChevronDown, X } from "lucide-react";
import { widgetByKey, widgetSizeLabel, CATEGORY_LABELS } from "@/lib/widgets";
import { useDashboardStore } from "@/store/dashboard-store";

/** Exact match for the design's "Live layout preview" — a plain reorderable row list (grip, name +
 * module · size, up/down arrows, remove), not a live-data preview grid. Drag-and-drop is layered on
 * via dnd-kit for smoother reordering; the up/down buttons are the same real `moveDraftWidget`
 * action, just keyboard/tap-friendly. */
export function WidgetGridCustomize() {
  const draftLayout = useDashboardStore((s) => s.draftLayout) ?? [];
  const reorderDraft = useDashboardStore((s) => s.reorderDraft);
  const moveDraftWidget = useDashboardStore((s) => s.moveDraftWidget);
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
    <section className="rounded-[14px] p-[18px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
      <div className="mb-3.5 flex items-center gap-2.5">
        <h3 className="text-[15px] font-bold" style={{ color: "var(--app-text)" }}>Live layout preview</h3>
        <span className="text-[11.5px]" style={{ color: "var(--app-text-faintest)" }}>Order here is the order on your Overview screen</span>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={draftLayout} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2.5">
            {draftLayout.map((key, i) => (
              <WidgetRow
                key={key}
                id={key}
                isFirst={i === 0}
                isLast={i === draftLayout.length - 1}
                onMoveUp={() => moveDraftWidget(key, -1)}
                onMoveDown={() => moveDraftWidget(key, 1)}
                onRemove={() => removeWidget(key)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  );
}

function WidgetRow({
  id,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  id: string;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const widget = widgetByKey(id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  if (!widget) return null;

  const arrowBtnStyle: React.CSSProperties = {
    border: "1px solid var(--app-border)",
    borderRadius: 8,
    color: "var(--app-text-faint)",
    background: "var(--app-surface)",
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, background: "#FCFDFD", border: "1px solid var(--app-border)" }}
      className="flex items-center gap-3 rounded-[12px] p-[12px_14px]"
    >
      <span {...attributes} {...listeners} className="cursor-grab" style={{ color: "var(--app-text-disabled)" }}>
        <GripVertical className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-bold" style={{ color: "var(--app-text)" }}>{widget.title}</span>
        <span className="mt-0.5 block text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>
          {CATEGORY_LABELS[widget.category]} · {widgetSizeLabel(widget)}
        </span>
      </span>
      <button type="button" onClick={onMoveUp} disabled={isFirst} aria-label="Move up" className="flex h-[30px] w-[30px] items-center justify-center disabled:opacity-40" style={arrowBtnStyle}>
        <ChevronUp className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button type="button" onClick={onMoveDown} disabled={isLast} aria-label="Move down" className="flex h-[30px] w-[30px] items-center justify-center disabled:opacity-40" style={arrowBtnStyle}>
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button type="button" onClick={onRemove} aria-label="Remove widget" className="flex h-[30px] w-[30px] items-center justify-center" style={{ ...arrowBtnStyle, color: "var(--app-text-disabled)" }}>
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

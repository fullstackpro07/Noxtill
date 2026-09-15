"use client";

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ChevronUp, ChevronDown, X } from "lucide-react";
import { DASHBOARD_ROWS, dashboardRowByKey, type DashboardRowKey } from "@/lib/dashboard-rows";
import { widgetByKey } from "@/lib/widgets";
import { useDashboardStore } from "@/store/dashboard-store";

const OUTER_KEYS = new Set(DASHBOARD_ROWS.filter((r) => r.scope === "outer").map((r) => r.key));
const INNER_KEYS = new Set(DASHBOARD_ROWS.filter((r) => r.scope === "inner").map((r) => r.key));

/** Row-level Customize Dashboard (fix-it v2): the design's exact rows (KPI Row, Opportunities/
 * Needs Attention/Business Health, Business Overview/Health Score, ...) are reordered as whole
 * units, in two independent lists matching the page's own structure — "Top of page" rows are
 * full-width above the main/sidebar split, "Main area" rows sit in the left column beside the
 * fixed sidebar. Moving a row within its own list changes its real position on Overview; the two
 * lists never mix, since crossing between them would require restructuring the sidebar layout the
 * design itself doesn't show. A separate "Extra KPI cards" list manages small metric tiles
 * appended to the end of the KPI Row (Add Widget → "KPI Cards" tab). */
export function WidgetGridCustomize() {
  const draftLayout = useDashboardStore((s) => s.draftLayout) ?? [];
  const draftKpiExtras = useDashboardStore((s) => s.draftKpiExtras) ?? [];
  const reorderDraft = useDashboardStore((s) => s.reorderDraft);
  const removeWidget = useDashboardStore((s) => s.removeWidget);
  const removeKpiExtra = useDashboardStore((s) => s.removeKpiExtra);

  const outerRows = draftLayout.filter((k): k is DashboardRowKey => OUTER_KEYS.has(k as DashboardRowKey));
  const innerRows = draftLayout.filter((k): k is DashboardRowKey => INNER_KEYS.has(k as DashboardRowKey));

  function moveWithinScope(scopeRows: DashboardRowKey[], key: string, direction: -1 | 1) {
    const i = scopeRows.indexOf(key as DashboardRowKey);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= scopeRows.length) return;
    const next = scopeRows.slice();
    [next[i], next[j]] = [next[j], next[i]];
    applyScopeOrder(scopeRows === outerRows ? next : outerRows, scopeRows === outerRows ? innerRows : next);
  }

  function applyScopeOrder(nextOuter: DashboardRowKey[], nextInner: DashboardRowKey[]) {
    // Absolute interleaving in the stored array doesn't matter — the Overview page filters into
    // outer/inner separately and renders each in its own relative order, so concatenating is safe.
    reorderDraft([...nextOuter, ...nextInner]);
  }

  return (
    <div className="flex flex-col gap-4">
      <RowList
        title="Top of page"
        hint="Full-width rows, above everything else"
        rows={outerRows}
        onMove={(key, dir) => moveWithinScope(outerRows, key, dir)}
        onReorder={(next) => applyScopeOrder(next, innerRows)}
        onRemove={removeWidget}
      />
      <RowList
        title="Main area"
        hint="Rows in the main column, beside the fixed sidebar"
        rows={innerRows}
        onMove={(key, dir) => moveWithinScope(innerRows, key, dir)}
        onReorder={(next) => applyScopeOrder(outerRows, next)}
        onRemove={removeWidget}
      />

      {draftKpiExtras.length > 0 && (
        <section className="rounded-[14px] p-[18px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="mb-3.5 flex items-center gap-2.5">
            <h3 className="text-[15px] font-bold" style={{ color: "var(--app-text)" }}>Extra KPI cards</h3>
            <span className="text-[11.5px]" style={{ color: "var(--app-text-faintest)" }}>Appended to the end of the KPI row</span>
          </div>
          <div className="flex flex-col gap-2.5">
            {draftKpiExtras.map((key) => {
              const widget = widgetByKey(key);
              if (!widget) return null;
              return (
                <div key={key} className="flex items-center gap-3 rounded-[12px] p-[12px_14px]" style={{ background: "#FCFDFD", border: "1px solid var(--app-border)" }}>
                  <span className="min-w-0 flex-1 text-[13px] font-bold" style={{ color: "var(--app-text)" }}>{widget.title}</span>
                  <button
                    type="button"
                    onClick={() => removeKpiExtra(key)}
                    aria-label="Remove widget"
                    className="flex h-[30px] w-[30px] items-center justify-center"
                    style={{ border: "1px solid var(--app-border)", borderRadius: 8, color: "var(--app-text-disabled)", background: "var(--app-surface)" }}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function RowList({
  title,
  hint,
  rows,
  onMove,
  onReorder,
  onRemove,
}: {
  title: string;
  hint: string;
  rows: DashboardRowKey[];
  onMove: (key: string, direction: -1 | 1) => void;
  onReorder: (next: DashboardRowKey[]) => void;
  onRemove: (key: string) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.indexOf(String(active.id) as DashboardRowKey);
    const newIndex = rows.indexOf(String(over.id) as DashboardRowKey);
    onReorder(arrayMove(rows, oldIndex, newIndex));
  }

  return (
    <section className="rounded-[14px] p-[18px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
      <div className="mb-3.5 flex items-center gap-2.5">
        <h3 className="text-[15px] font-bold" style={{ color: "var(--app-text)" }}>{title}</h3>
        <span className="text-[11.5px]" style={{ color: "var(--app-text-faintest)" }}>{hint}</span>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={rows} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2.5">
            {rows.map((key, i) => (
              <RowItem
                key={key}
                id={key}
                isFirst={i === 0}
                isLast={i === rows.length - 1}
                onMoveUp={() => onMove(key, -1)}
                onMoveDown={() => onMove(key, 1)}
                onRemove={() => onRemove(key)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  );
}

function RowItem({
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
  const row = dashboardRowByKey(id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  if (!row) return null;

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
        <span className="block text-[13px] font-bold" style={{ color: "var(--app-text)" }}>{row.title}</span>
        <span className="mt-0.5 block text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>{row.module}</span>
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

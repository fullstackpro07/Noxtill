"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CATEGORY_LABELS, WIDGETS, type WidgetCategory } from "@/lib/widgets";
import { useDashboardStore } from "@/store/dashboard-store";

/** Stable reference so the `?? []` fallback never triggers a fresh useMemo dependency on every render. */
const EMPTY_LAYOUT: string[] = [];

const CATEGORY_ORDER: WidgetCategory[] = [
  "sales",
  "inventory",
  "credit",
  "bookings",
  "reviews",
  "marketing",
  "staff",
  "messaging",
];

export function AddWidgetDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const draftLayout = useDashboardStore((s) => s.draftLayout) ?? EMPTY_LAYOUT;
  const addWidget = useDashboardStore((s) => s.addWidget);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const available = WIDGETS.filter((w) => !draftLayout.includes(w.key) && w.title.toLowerCase().includes(q));
    return CATEGORY_ORDER.map((category) => ({
      category,
      widgets: available.filter((w) => w.category === category),
    })).filter((group) => group.widgets.length > 0);
  }, [query, draftLayout]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[#1c231e]/45" />
      <div className="animate-sheet-in absolute inset-y-0 end-0 flex w-full max-w-sm flex-col border-s border-border bg-surface shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-display text-base font-semibold text-fg">Add a widget</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-fg-faint hover:bg-surface-2"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="border-b border-border p-4">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search widgets…"
            leadingSlot={<Search className="h-4 w-4" aria-hidden />}
            autoFocus
          />
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {grouped.length === 0 ? (
            <p className="py-10 text-center text-sm text-fg-faint">
              {draftLayout.length === WIDGETS.length ? "Every widget is already on your dashboard." : "No widgets match your search."}
            </p>
          ) : (
            grouped.map(({ category, widgets }) => (
              <div key={category} className="mb-5 last:mb-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-faint">
                  {CATEGORY_LABELS[category]}
                </p>
                <div className="flex flex-col gap-1">
                  {widgets.map((widget) => {
                    const Icon = widget.icon;
                    return (
                      <button
                        key={widget.key}
                        type="button"
                        onClick={() => addWidget(widget.key)}
                        className="flex items-center gap-3 rounded-[var(--radius-sm)] px-2.5 py-2 text-start transition-colors hover:bg-surface-2"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/8 text-primary">
                          <Icon className="h-4 w-4" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-fg">{widget.title}</span>
                        <Plus className="h-4 w-4 shrink-0 text-fg-faint" aria-hidden />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

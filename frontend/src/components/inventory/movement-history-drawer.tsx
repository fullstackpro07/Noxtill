"use client";

import { createPortal } from "react-dom";
import { X, ArrowDownCircle, ArrowUpCircle, AlertTriangle } from "lucide-react";
import type { InventoryItem, MovementType } from "@/lib/inventory";
import { formatDate } from "@/lib/format";

const MOVEMENT_ICON: Record<MovementType, typeof ArrowDownCircle> = {
  purchase: ArrowDownCircle,
  sale: ArrowUpCircle,
  wastage: AlertTriangle,
};

const MOVEMENT_TONE: Record<MovementType, string> = {
  purchase: "text-whatsapp",
  sale: "text-fg-muted",
  wastage: "text-destructive",
};

export function MovementHistoryDrawer({ item, onClose }: { item: InventoryItem | null; onClose: () => void }) {
  if (!item || typeof document === "undefined") return null;

  const sorted = [...item.movements].sort((a, b) => b.date.localeCompare(a.date));

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[#1c231e]/45" />
      <div className="animate-sheet-in absolute inset-y-0 end-0 flex w-full max-w-md flex-col border-s border-border bg-surface shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-display text-base font-semibold text-fg">{item.name}</h2>
            <p className="text-xs text-fg-faint">Movement history</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-fg-faint hover:bg-surface-2"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex flex-col gap-3">
            {sorted.map((m) => {
              const Icon = MOVEMENT_ICON[m.type];
              return (
                <div key={m.id} className="flex items-start gap-3">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${MOVEMENT_TONE[m.type]}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium capitalize text-fg">{m.type}</p>
                      <span className={`text-sm font-medium tabular-nums ${m.qtyChange > 0 ? "text-whatsapp" : "text-destructive"}`}>
                        {m.qtyChange > 0 ? "+" : ""}
                        {m.qtyChange}
                      </span>
                    </div>
                    <p className="text-xs text-fg-muted">{m.note}</p>
                    <p className="text-xs text-fg-faint">{formatDate(m.date)}</p>
                  </div>
                </div>
              );
            })}
            {sorted.length === 0 && <p className="py-8 text-center text-sm text-fg-faint">No movements recorded yet.</p>}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

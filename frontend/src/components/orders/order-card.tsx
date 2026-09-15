"use client";

import { useDraggable } from "@dnd-kit/core";
import type { LiveOrder } from "@/lib/orders-api";
import { formatCurrency, formatRelativeTime } from "@/lib/format";
import { toast } from "@/lib/toast";

const TYPE_BADGE: Record<string, { bg: string; fg: string }> = {
  counter: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)" },
  online: { bg: "#EEF4FF", fg: "#2563EB" },
  dine_in: { bg: "#FFF1E6", fg: "#F97316" },
  takeaway: { bg: "#E6FBF7", fg: "#0D9488" },
  delivery: { bg: "#F3E8FF", fg: "#9333EA" },
};
const TYPE_LABEL: Record<string, string> = { counter: "Counter", online: "Online", dine_in: "Dine-in", takeaway: "Takeaway", delivery: "Delivery" };

/** A card is "late" once it's spent more than 15 minutes in its current status — a client-side
 * heuristic (there's no per-order "promise time" in the schema), using `updatedAt`-adjacent
 * `createdAt` as the only real timestamp available on `LiveOrder` today. */
const LATE_THRESHOLD_MS = 15 * 60_000;

export function OrderCard({ order, now, currency, onOpen }: { order: LiveOrder; now: number; currency: string; onOpen: (order: LiveOrder) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: order.id });
  const ageMs = now - new Date(order.createdAt).getTime();
  const late = order.status !== "completed" && order.status !== "cancelled" && ageMs > LATE_THRESHOLD_MS;
  const type = TYPE_BADGE[order.orderType] ?? { bg: "var(--app-surface-2)", fg: "var(--app-text-faint)" };

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(order)}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        background: "var(--app-surface)",
        border: `1px solid ${late ? "#FDD9D6" : "var(--app-border)"}`,
        boxShadow: isDragging ? "0 6px 18px rgba(16,24,40,.09)" : "0 1px 2px rgba(16,24,40,.05)",
        opacity: isDragging ? 0.6 : 1,
      }}
      className="cursor-grab touch-none rounded-[12px] p-3"
    >
      <div className="flex items-center gap-2">
        <span className="text-[12.5px] font-extrabold" style={{ color: "var(--app-success-text)" }}>#{order.orderNo}</span>
        <span className="ms-auto rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: type.bg, color: type.fg }}>{TYPE_LABEL[order.orderType] ?? order.orderType}</span>
      </div>
      <div className="mt-1.5 text-[12px]" style={{ color: "var(--app-text-faint)" }}>{order.customerName}</div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>{order.items.reduce((n, i) => n + i.qty, 0)} items</span>
        <span className="ms-auto text-[13px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(order.total, currency)}</span>
      </div>
      <div className="mt-2 flex items-center gap-2 pt-2" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
        <span className="text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>{formatRelativeTime(ageMs)}</span>
        {late && <span className="rounded-full px-2 py-0.5 text-[10px] font-extrabold" style={{ background: "#FEE4E2", color: "var(--app-danger-strong)" }}>Over 15 min</span>}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            toast.error("Delay notifications aren't connected to a messaging channel yet.");
          }}
          className="ms-auto text-[11px] font-bold"
          style={{ color: "var(--app-text-faint)" }}
        >
          Delay notice
        </button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { KanbanColumn } from "./kanban-column";
import { OrderDetailDrawer } from "./order-detail-drawer";
import { ChangeStatusModal, CancelOrderModal, PrintOrderModal } from "./order-action-modals";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonCard } from "@/components/shared/skeleton";
import { useSession } from "@/lib/session";
import { useNow } from "@/hooks/use-now";
import { fetchStaffList } from "@/lib/staff-api";
import { ORDER_STATUS_COLUMNS, ORDER_STATUS_TRANSITIONS, type OrderStatus } from "@/lib/orders";
import { fetchOrders, updateOrderStatus, type LiveOrder } from "@/lib/orders-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 42 };
const COLUMN_VISIBILITY_KEY = "nx-order-board-columns";

function loadVisibleColumns(): Set<string> {
  if (typeof window === "undefined") return new Set(ORDER_STATUS_COLUMNS.map((c) => c.key));
  try {
    const raw = window.localStorage.getItem(COLUMN_VISIBILITY_KEY);
    if (!raw) return new Set(ORDER_STATUS_COLUMNS.map((c) => c.key));
    const parsed = JSON.parse(raw) as string[];
    return new Set(parsed);
  } catch {
    return new Set(ORDER_STATUS_COLUMNS.map((c) => c.key));
  }
}

export function OrderKanbanBoard() {
  const session = useSession();
  const now = useNow(30_000);
  const queryClient = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const [typeFilter, setTypeFilter] = useState("all");
  const [staffFilter, setStaffFilter] = useState("all");
  const [ageFilter, setAgeFilter] = useState<"any" | "over" | "under">("any");
  const [colsOpen, setColsOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => loadVisibleColumns());
  const [viewing, setViewing] = useState<LiveOrder | null>(null);
  const [changingStatus, setChangingStatus] = useState<LiveOrder | null>(null);
  const [cancelling, setCancelling] = useState<LiveOrder | null>(null);
  const [printing, setPrinting] = useState<LiveOrder | null>(null);

  useEffect(() => {
    window.localStorage.setItem(COLUMN_VISIBILITY_KEY, JSON.stringify(Array.from(visibleColumns)));
  }, [visibleColumns]);

  const { data: orders = [], isPending, isError, refetch } = useQuery({
    queryKey: ["orders", "board"],
    queryFn: () => fetchOrders(),
    refetchInterval: 20_000,
  });
  const { data: staff } = useQuery({ queryKey: ["staff-roster"], queryFn: () => fetchStaffList(), staleTime: 5 * 60_000 });

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (typeFilter !== "all" && o.orderType !== typeFilter) return false;
      if (staffFilter !== "all" && o.staffName !== staff?.find((s) => s.userId === staffFilter)?.name) return false;
      const ageMin = (now - new Date(o.createdAt).getTime()) / 60_000;
      if (ageFilter === "over" && ageMin <= 15) return false;
      if (ageFilter === "under" && ageMin > 15) return false;
      return true;
    });
  }, [orders, typeFilter, staffFilter, ageFilter, staff, now]);

  const statusMutation = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: OrderStatus; reason?: string }) => updateOrderStatus(id, status, reason),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ["orders", "board"] });
      const previous = queryClient.getQueryData<LiveOrder[]>(["orders", "board"]);
      queryClient.setQueryData<LiveOrder[]>(["orders", "board"], (prev) => prev?.map((o) => (o.id === id ? { ...o, status } : o)));
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["orders", "board"], context.previous);
      toast.error(err instanceof ApiError ? err.message : "Couldn't update this order's status.");
    },
    onSuccess: (updated) => {
      toast.success(`Order #${updated.orderNo} moved to ${updated.status.replace("_", " ")}.`);
      setChangingStatus(null);
      setCancelling(null);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const newStatus = over.id as OrderStatus;
    const order = orders.find((o) => o.id === active.id);
    if (!order || order.status === newStatus) return;
    if (!ORDER_STATUS_TRANSITIONS[order.status].includes(newStatus)) {
      toast.error(`Can't move a ${order.status.replace("_", " ")} order to ${newStatus.replace("_", " ")}.`);
      return;
    }
    statusMutation.mutate({ id: order.id, status: newStatus });
  }

  if (isError) {
    return (
      <main className="px-[22px] pb-[26px] pt-4">
        <ErrorBanner title="Couldn't load orders" description="Check your connection and try again." onRetry={() => refetch()} />
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Order Board</h2>
        <span className="flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <span className="h-[7px] w-[7px] rounded-full" style={{ background: "var(--app-primary)" }} />
          <span className="text-[11.5px] font-bold" style={{ color: "var(--app-success-text)" }}>Auto-refreshing</span>
        </span>
        <div className="ms-auto flex flex-wrap gap-2">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Order type" style={selectStyle}>
            <option value="all">All types</option>
            <option value="counter">Counter</option>
            <option value="online">Online</option>
            <option value="dine_in">Dine-in</option>
            <option value="takeaway">Takeaway</option>
            <option value="delivery">Delivery</option>
          </select>
          {staff && staff.length > 0 && (
            <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} aria-label="Staff" style={selectStyle}>
              <option value="all">All staff</option>
              {staff.map((s) => (
                <option key={s.userId} value={s.userId}>{s.name}</option>
              ))}
            </select>
          )}
          <select value={ageFilter} onChange={(e) => setAgeFilter(e.target.value as typeof ageFilter)} aria-label="Age" style={selectStyle}>
            <option value="any">Any age</option>
            <option value="over">Over 15 min</option>
            <option value="under">Under 15 min</option>
          </select>
          <button type="button" onClick={() => setColsOpen(true)} style={{ ...selectStyle, fontWeight: 700 }}>Column Settings</button>
        </div>
      </div>

      {isPending ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="grid gap-3.5" style={{ gridTemplateColumns: `repeat(${Math.max(1, ORDER_STATUS_COLUMNS.filter((c) => visibleColumns.has(c.key)).length)},minmax(0,1fr))` }}>
            {ORDER_STATUS_COLUMNS.filter((c) => visibleColumns.has(c.key)).map((column) => (
              <KanbanColumn
                key={column.key}
                status={column.key}
                label={column.label}
                orders={filtered.filter((o) => o.status === column.key)}
                now={now}
                currency={session.business.currency}
                onOpen={setViewing}
              />
            ))}
          </div>
        </DndContext>
      )}

      <OrderDetailDrawer
        order={viewing}
        currency={session.business.currency}
        onClose={() => setViewing(null)}
        onPrint={() => setPrinting(viewing)}
        onCancel={() => setCancelling(viewing)}
        onChangeStatus={() => setChangingStatus(viewing)}
      />
      <ChangeStatusModal order={changingStatus} onClose={() => setChangingStatus(null)} applying={statusMutation.isPending} onApply={(status, reason) => changingStatus && statusMutation.mutate({ id: changingStatus.id, status, reason })} />
      <CancelOrderModal order={cancelling} currency={session.business.currency} onClose={() => setCancelling(null)} cancelling={statusMutation.isPending} onCancel={(reason) => cancelling && statusMutation.mutate({ id: cancelling.id, status: "cancelled", reason })} />
      <PrintOrderModal order={printing} currency={session.business.currency} businessName={session.business.name} onClose={() => setPrinting(null)} />

      {colsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-5" style={{ background: "rgba(10,27,42,.38)" }} onClick={() => setColsOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-[380px] max-w-full rounded-[18px]" style={{ background: "var(--app-surface)", boxShadow: "0 30px 80px rgba(10,27,42,.32)" }}>
            <div className="flex items-center gap-3 p-[17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
              <h3 className="flex-1 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>Column Settings</h3>
            </div>
            <div className="flex flex-col gap-2 p-[17px]">
              <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>Choose which fulfilment stages appear on the board. Saved on this device.</p>
              {ORDER_STATUS_COLUMNS.map((c) => (
                <label key={c.key} className="flex items-center gap-2.5 rounded-[11px] p-[11px]" style={{ border: "1px solid var(--app-border)" }}>
                  <input
                    type="checkbox"
                    checked={visibleColumns.has(c.key)}
                    onChange={(e) =>
                      setVisibleColumns((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(c.key);
                        else next.delete(c.key);
                        return next.size > 0 ? next : prev;
                      })
                    }
                    style={{ accentColor: "var(--app-primary)" }}
                  />
                  <span className="text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>{c.label}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2.5 p-[14px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
              <button type="button" onClick={() => setColsOpen(false)} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>Done</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

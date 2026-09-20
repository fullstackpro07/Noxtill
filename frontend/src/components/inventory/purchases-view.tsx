"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchPurchaseOrders,
  sendPurchaseOrder,
  confirmPurchaseOrder,
  cancelPurchaseOrder,
  type PurchaseOrder,
  type PurchaseOrderStatus,
} from "@/lib/purchase-orders-api";
import { formatCurrency, formatDate } from "@/lib/format";
import { useInventoryDrawer, useInventorySearch, useRegisterExport } from "@/components/inventory/inventory-drawer-context";
import { INV, KpiTile, KpiSkeleton, filterSelectStyle, primaryBtnStyle, EmptyBlock, chipStyle, type Tone } from "@/components/inventory/inventory-ui";
import { canManagePurchasesByDefaultRole } from "@/components/inventory/inventory-classification";
import { PackageCheck } from "lucide-react";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { useSession } from "@/lib/session";

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  confirmed: "Confirmed",
  partially_received: "Partially received",
  received: "Received",
  cancelled: "Cancelled",
};
const STATUS_TONE: Record<PurchaseOrderStatus, Tone> = {
  draft: "neutral",
  sent: "amber",
  confirmed: "blue",
  partially_received: "blue",
  received: "green",
  cancelled: "red",
};
const SPEND_COLORS = ["#0E8442", "#3538CD", "#B54708", "#7E22CE", "#B42318", "#475467"];

/** Plain helper (not inlined in the hook callback) so the impure `Date.now()` read isn't flagged as happening during render. */
function rangeStartFor(days: number | null): Date | null {
  return days == null ? null : new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function poNumber(order: PurchaseOrder, all: PurchaseOrder[]): string {
  const sorted = [...all].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const idx = sorted.findIndex((o) => o.id === order.id);
  return `PO-${String(idx + 1).padStart(4, "0")}`;
}

export function PurchasesView({ currency }: { currency: string }) {
  const session = useSession();
  const canManage = canManagePurchasesByDefaultRole(session.user.role);
  const [status, setStatus] = useState<PurchaseOrderStatus | "all">("all");
  const [supplier, setSupplier] = useState("all");
  const [range, setRange] = useState<"month" | "90" | "all">("month");
  const { query } = useInventorySearch();
  const { openPo, openReceive } = useInventoryDrawer();
  const queryClient = useQueryClient();

  const { data: orders = [], isPending, isError, error, refetch } = useQuery({ queryKey: ["purchase-orders"], queryFn: () => fetchPurchaseOrders(), enabled: canManage });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
  }

  const sendMutation = useMutation({
    mutationFn: (id: string) => sendPurchaseOrder(id),
    onSuccess: () => {
      invalidate();
      toast.success("Sent — a real WhatsApp preview went to the supplier.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send this order — please try again."),
  });
  const confirmMutation = useMutation({
    mutationFn: (id: string) => confirmPurchaseOrder(id),
    onSuccess: () => {
      invalidate();
      toast.success("Marked as confirmed by the supplier.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't confirm this order — please try again."),
  });
  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelPurchaseOrder(id),
    onSuccess: () => {
      invalidate();
      toast.success("Order cancelled.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't cancel this order — please try again."),
  });

  const suppliers = useMemo(() => [...new Set(orders.map((o) => o.supplier.name))].sort(), [orders]);

  const rangeDays = range === "all" ? null : range === "month" ? 30 : 90;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rangeStart = rangeStartFor(rangeDays);
    return orders.filter((o) => {
      if (status !== "all" && o.status !== status) return false;
      if (supplier !== "all" && o.supplier.name !== supplier) return false;
      if (rangeStart && new Date(o.createdAt) < rangeStart) return false;
      if (q && !o.supplier.name.toLowerCase().includes(q) && !poNumber(o, orders).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [orders, status, supplier, rangeDays, query]);

  const thisMonth = new Date().toISOString().slice(0, 7);
  const ordersThisMonth = orders.filter((o) => o.createdAt.slice(0, 7) === thisMonth);
  const spendThisMonth = ordersThisMonth.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.qtyOrdered * i.unitCost, 0), 0);
  const pendingCount = orders.filter((o) => o.status === "sent" || o.status === "confirmed" || o.status === "partially_received").length;

  const receivedOrders = orders.filter((o) => o.receivedAt);
  const avgLeadDays =
    receivedOrders.length > 0
      ? Math.round(receivedOrders.reduce((sum, o) => sum + (new Date(o.receivedAt!).getTime() - new Date(o.createdAt).getTime()) / (24 * 60 * 60 * 1000), 0) / receivedOrders.length)
      : null;

  const spendBySupplier = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders) {
      const total = o.items.reduce((s, i) => s + i.qtyOrdered * i.unitCost, 0);
      map.set(o.supplier.name, (map.get(o.supplier.name) ?? 0) + total);
    }
    const maxVal = Math.max(1, ...map.values());
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value], i) => ({ name, value, pct: Math.round((value / maxVal) * 100), color: SPEND_COLORS[i % SPEND_COLORS.length] }));
  }, [orders]);

  const spendTrend = useMemo(() => {
    const months: { key: string; label: string }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) });
    }
    const sums = months.map((m) => orders.filter((o) => o.createdAt.slice(0, 7) === m.key).reduce((s, o) => s + o.items.reduce((x, i) => x + i.qtyOrdered * i.unitCost, 0), 0));
    const max = Math.max(1, ...sums);
    return months.map((m, i) => ({ ...m, pct: Math.round((sums[i] / max) * 100), value: sums[i] }));
  }, [orders]);

  useRegisterExport(() => {
    const header = ["PO #", "Supplier", "Items", "Qty", "Total cost", "Ordered", "Received", "Status"];
    const rows = filtered.map((o) => {
      const totalQty = o.items.reduce((s, i) => s + i.qtyOrdered, 0);
      const totalCost = o.items.reduce((s, i) => s + i.qtyOrdered * i.unitCost, 0);
      return [poNumber(o, orders), o.supplier.name, o.items.length, totalQty, totalCost, formatDate(o.createdAt), o.receivedAt ? formatDate(o.receivedAt) : "", STATUS_LABEL[o.status]];
    });
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "purchase-orders.csv";
    link.click();
    URL.revokeObjectURL(url);
  });

  if (!canManage) {
    return (
      <main style={{ padding: "16px 22px 26px" }}>
        <div style={{ background: "#fff", border: "1px solid #FDE3B3", borderRadius: 16, padding: "48px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: "#93370D" }}>Purchases are owner and manager only</div>
          <div style={{ fontSize: 12.5, color: "#B54708", marginTop: 5 }}>Purchase orders are a real financial commitment to a supplier, so this screen is restricted. Ask the owner for access.</div>
        </div>
      </main>
    );
  }

  if (isError) {
    return (
      <div style={{ margin: 22, background: "#fff", border: "1px solid #FDD9D6", borderRadius: 16, padding: "48px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: "#B42318" }}>{error instanceof ApiError ? error.message : "Couldn't load purchase orders"}</div>
        <button type="button" onClick={() => refetch()} style={{ marginTop: 15, border: 0, background: INV.primary, borderRadius: 12, padding: "12px 22px", fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46 }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <main style={{ padding: "16px 22px 26px", display: "flex", flexDirection: "column", gap: 15 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <select value={status} onChange={(e) => setStatus(e.target.value as PurchaseOrderStatus | "all")} aria-label="Status" style={filterSelectStyle}>
          <option value="all">All statuses</option>
          {(Object.keys(STATUS_LABEL) as PurchaseOrderStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select value={supplier} onChange={(e) => setSupplier(e.target.value)} aria-label="Supplier" style={filterSelectStyle}>
          <option value="all">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={range} onChange={(e) => setRange(e.target.value as "month" | "90" | "all")} aria-label="Date" style={filterSelectStyle}>
          <option value="month">This month</option>
          <option value="90">Last 90 days</option>
          <option value="all">All time</option>
        </select>
        <div style={{ marginLeft: "auto" }}>
          <button type="button" onClick={() => openPo()} style={primaryBtnStyle}>
            New Purchase
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14 }}>
        {isPending ? (
          <KpiSkeleton count={4} />
        ) : (
          <>
            <KpiTile label="Purchases This Month" value={String(ordersThisMonth.length)} />
            <KpiTile label="Total Spend" value={formatCurrency(spendThisMonth, currency)} tone="green" />
            <KpiTile label="Average Lead Time" value={avgLeadDays != null ? `${avgLeadDays}d` : "No receipts yet"} />
            <KpiTile label="Pending Deliveries" value={String(pendingCount)} tone="amber" />
          </>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "340px minmax(0,1fr)", gap: 15, alignItems: "start" }}>
        <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, padding: 17 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Spend by supplier</h3>
          {spendBySupplier.length === 0 ? (
            <div style={{ fontSize: 12.5, color: INV.textFaint }}>No purchase orders yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {spendBySupplier.map((b) => (
                <div key={b.name}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#344054" }}>{b.name}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: "#101828", whiteSpace: "nowrap" }}>{formatCurrency(b.value, currency)}</span>
                  </div>
                  <div style={{ height: 9, borderRadius: 6, background: "#F2F4F7", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 6, background: b.color, width: `${b.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, padding: 17, minWidth: 0 }}>
          <h3 style={{ margin: "0 0 6px", fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Spend trend</h3>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 100, marginTop: 10 }}>
            {spendTrend.map((m) => (
              <div key={m.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ width: "100%", maxWidth: 34, height: Math.max(4, m.pct), borderRadius: 5, background: "#BFE7CF" }} title={formatCurrency(m.value, currency)} />
                <span style={{ fontSize: 10.5, color: "#667085", fontWeight: 600 }}>{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, overflow: "hidden" }}>
        {isPending ? null : filtered.length === 0 ? (
          <EmptyBlock icon={PackageCheck} iconBg="#F2F4F7" iconColor="#98A2B3" title="Record your first purchase to track costs accurately" action={<button type="button" onClick={() => openPo()} style={primaryBtnStyle}>New Purchase</button>} />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1180 }}>
              <thead>
                <tr style={{ background: "#FAFBFC" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>PO #</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Supplier</th>
                  <th style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Items</th>
                  <th style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Qty</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Total cost</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Ordered</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Received</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Status</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => {
                  const totalQty = o.items.reduce((s, i) => s + i.qtyOrdered, 0);
                  const totalCost = o.items.reduce((s, i) => s + i.qtyOrdered * i.unitCost, 0);
                  const canReceive = o.status === "confirmed" || o.status === "partially_received";
                  return (
                    <tr key={o.id} style={{ borderTop: "1px solid #F2F4F7" }}>
                      <td style={{ padding: "11px 17px", fontSize: 12.5, fontWeight: 800, color: "#0E8442" }}>{poNumber(o, orders)}</td>
                      <td style={{ padding: 11, fontSize: 12, color: "#475467" }}>{o.supplier.name}</td>
                      <td style={{ padding: 11, fontSize: 12.5, color: "#475467", textAlign: "center" }}>{o.items.length}</td>
                      <td style={{ padding: 11, fontSize: 12.5, color: "#475467", textAlign: "center" }}>{totalQty}</td>
                      <td style={{ padding: 11, fontSize: 12.5, fontWeight: 700, color: "#101828", textAlign: "right" }}>{formatCurrency(totalCost, currency)}</td>
                      <td style={{ padding: 11, fontSize: 12, color: "#667085", whiteSpace: "nowrap" }}>{formatDate(o.createdAt)}</td>
                      <td style={{ padding: 11, fontSize: 12, color: "#98A2B3", whiteSpace: "nowrap" }}>{o.receivedAt ? formatDate(o.receivedAt) : "—"}</td>
                      <td style={{ padding: 11 }}>
                        <span style={chipStyle(STATUS_TONE[o.status])}>{STATUS_LABEL[o.status]}</span>
                      </td>
                      <td style={{ padding: "11px 17px", textAlign: "right" }}>
                        <span style={{ display: "inline-flex", gap: 7, justifyContent: "flex-end", flexWrap: "wrap" }}>
                          {o.status === "draft" && (
                            <button type="button" onClick={() => sendMutation.mutate(o.id)} disabled={sendMutation.isPending} style={{ border: `1px solid ${INV.border}`, background: "#fff", borderRadius: 9, padding: "8px 11px", fontSize: 11.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 40 }}>
                              Send PO
                            </button>
                          )}
                          {o.status === "sent" && (
                            <button type="button" onClick={() => confirmMutation.mutate(o.id)} disabled={confirmMutation.isPending} style={{ border: `1px solid ${INV.border}`, background: "#fff", borderRadius: 9, padding: "8px 11px", fontSize: 11.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 40 }}>
                              Confirm
                            </button>
                          )}
                          {(o.status === "draft" || o.status === "sent") && (
                            <button type="button" onClick={() => cancelMutation.mutate(o.id)} style={{ border: `1px solid ${INV.border}`, background: "#fff", borderRadius: 9, padding: "8px 11px", fontSize: 11.5, fontWeight: 700, color: "#B42318", cursor: "pointer", minHeight: 40 }}>
                              Cancel
                            </button>
                          )}
                          {canReceive && (
                            <button type="button" onClick={() => openReceive(o.id)} style={{ border: 0, background: INV.primary, borderRadius: 9, padding: "8px 13px", fontSize: 11.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 40 }}>
                              Mark Received
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Send, Check, PackageCheck, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonCard, SkeletonRow } from "@/components/shared/skeleton";
import {
  fetchPurchaseOrders,
  createPurchaseOrder,
  sendPurchaseOrder,
  confirmPurchaseOrder,
  receivePurchaseOrder,
  cancelPurchaseOrder,
  type PurchaseOrder,
  type PurchaseOrderStatus,
} from "@/lib/purchase-orders-api";
import { fetchSuppliers } from "@/lib/suppliers-api";
import { fetchProducts } from "@/lib/products-api";
import { formatCurrency, formatDate } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const STATUS_TONE: Record<PurchaseOrderStatus, "primary" | "success" | "neutral" | "danger" | "warning"> = {
  draft: "neutral",
  sent: "warning",
  confirmed: "primary",
  partially_received: "primary",
  received: "success",
  cancelled: "danger",
};

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <span className="text-xs font-medium text-fg-faint">{label}</span>
      <p className="mt-1 font-display text-xl font-bold text-fg">{value}</p>
    </div>
  );
}

export function PurchasesView({ currency }: { currency: string }) {
  const [creating, setCreating] = useState(false);
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  const queryClient = useQueryClient();

  const { data: orders = [], isPending, isError, refetch } = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: () => fetchPurchaseOrders(),
  });

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

  const thisMonth = new Date().toISOString().slice(0, 7);
  const ordersThisMonth = orders.filter((o) => o.createdAt.slice(0, 7) === thisMonth);
  const spendThisMonth = ordersThisMonth.reduce(
    (sum, o) => sum + o.items.reduce((s, i) => s + i.qtyOrdered * i.unitCost, 0),
    0,
  );
  const pendingCount = orders.filter((o) => o.status === "sent" || o.status === "confirmed" || o.status === "partially_received").length;

  if (isError) {
    return <ErrorBanner title="Couldn't load purchase orders" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {isPending ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard label="Purchases this month" value={String(ordersThisMonth.length)} />
            <StatCard label="Spend this month" value={formatCurrency(spendThisMonth, currency)} />
            <StatCard label="Pending" value={String(pendingCount)} />
          </>
        )}
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          New purchase order
        </Button>
      </div>

      {isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <EmptyState icon={Plus} title="No purchase orders yet" description="Build a draft, send it to a supplier, then receive stock when it arrives." action={{ label: "New purchase order", onClick: () => setCreating(true) }} />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                <th className="px-4 py-3 text-start">Supplier</th>
                <th className="px-4 py-3 text-start">Items</th>
                <th className="px-4 py-3 text-start">Total</th>
                <th className="px-4 py-3 text-start">Status</th>
                <th className="px-4 py-3 text-start">Created</th>
                <th className="px-4 py-3 text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const total = o.items.reduce((s, i) => s + i.qtyOrdered * i.unitCost, 0);
                return (
                  <tr key={o.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                    <td className="px-4 py-3 font-medium text-fg">{o.supplier.name}</td>
                    <td className="px-4 py-3 text-fg-muted">{o.items.map((i) => `${i.qtyOrdered}x ${i.product.name}`).join(", ")}</td>
                    <td className="px-4 py-3 text-fg-muted">{formatCurrency(total, currency)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[o.status]}>{o.status.replace(/_/g, " ")}</Badge>
                    </td>
                    <td className="px-4 py-3 text-fg-muted">{formatDate(o.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {o.status === "draft" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => sendMutation.mutate(o.id)} disabled={sendMutation.isPending}>
                              <Send className="h-3.5 w-3.5" aria-hidden />
                              Send
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => cancelMutation.mutate(o.id)}>
                              <X className="h-3.5 w-3.5" aria-hidden />
                            </Button>
                          </>
                        )}
                        {o.status === "sent" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => confirmMutation.mutate(o.id)} disabled={confirmMutation.isPending}>
                              <Check className="h-3.5 w-3.5" aria-hidden />
                              Confirm
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => cancelMutation.mutate(o.id)}>
                              <X className="h-3.5 w-3.5" aria-hidden />
                            </Button>
                          </>
                        )}
                        {(o.status === "confirmed" || o.status === "partially_received") && (
                          <Button size="sm" variant="outline" onClick={() => setReceiving(o)}>
                            <PackageCheck className="h-3.5 w-3.5" aria-hidden />
                            Receive
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {creating && <CreatePurchaseOrderDialog onClose={() => setCreating(false)} />}
      {receiving && <ReceiveDialog order={receiving} onClose={() => setReceiving(null)} />}
    </div>
  );
}

function CreatePurchaseOrderDialog({ onClose }: { onClose: () => void }) {
  const [supplierId, setSupplierId] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<{ productId: string; qty: string; unitCost: string }[]>([{ productId: "", qty: "1", unitCost: "" }]);
  const queryClient = useQueryClient();

  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: fetchSuppliers });
  const { data: products = [] } = useQuery({ queryKey: ["products", "active"], queryFn: () => fetchProducts({ active: true }) });

  function updateLine(i: number, patch: Partial<{ productId: string; qty: string; unitCost: string }>) {
    setLines((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  const validLines = lines.filter((l) => l.productId && Number(l.qty) > 0 && l.unitCost !== "");
  const valid = supplierId !== "" && validLines.length > 0;

  const mutation = useMutation({
    mutationFn: () =>
      createPurchaseOrder({
        supplierId,
        note: note.trim() || undefined,
        items: validLines.map((l) => ({ productId: l.productId, qty: Number(l.qty), unitCost: Number(l.unitCost) })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success("Draft purchase order created.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't create this order — please try again."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="New purchase order"
      description="Created as a draft — nothing is sent until you approve it."
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending}>
            {mutation.isPending ? "Creating…" : "Save draft"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Select label="Supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">Select…</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <div className="flex flex-col gap-2">
          {lines.map((line, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select value={line.productId} onChange={(e) => updateLine(i, { productId: e.target.value })} className="flex-1">
                <option value="">Product…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              <Input type="number" min={1} value={line.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} className="w-20" placeholder="Qty" />
              <Input type="number" min={0} step="0.01" value={line.unitCost} onChange={(e) => updateLine(i, { unitCost: e.target.value })} className="w-24" placeholder="Cost" />
              <Button variant="ghost" size="sm" onClick={() => setLines((rows) => rows.filter((_, idx) => idx !== i))} aria-label="Remove line">
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          ))}
        </div>
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setLines((rows) => [...rows, { productId: "", qty: "1", unitCost: "" }])}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add line
        </Button>
        <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Dialog>
  );
}

function ReceiveDialog({ order, onClose }: { order: PurchaseOrder; onClose: () => void }) {
  const outstanding = useMemo(() => order.items.filter((i) => i.qtyReceived < i.qtyOrdered), [order]);
  const [qtyByItem, setQtyByItem] = useState<Record<string, string>>(
    Object.fromEntries(outstanding.map((i) => [i.id, String(i.qtyOrdered - i.qtyReceived)])),
  );
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      receivePurchaseOrder(
        order.id,
        outstanding
          .map((i) => ({ itemId: i.id, qtyReceived: Number(qtyByItem[i.id] ?? 0) }))
          .filter((l) => l.qtyReceived > 0),
      ),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast.success(updated.status === "received" ? "Fully received — stock updated." : "Partially received — stock updated.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't record this receipt — please try again."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Receive — ${order.supplier.name}`}
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Recording…" : "Record receipt"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2.5">
        {outstanding.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-fg">{item.product.name}</p>
              <p className="text-xs text-fg-faint">
                {item.qtyReceived} of {item.qtyOrdered} received so far
              </p>
            </div>
            <Input
              type="number"
              min={0}
              max={item.qtyOrdered - item.qtyReceived}
              value={qtyByItem[item.id] ?? "0"}
              onChange={(e) => setQtyByItem((prev) => ({ ...prev, [item.id]: e.target.value }))}
              className="w-24"
            />
          </div>
        ))}
      </div>
    </Dialog>
  );
}

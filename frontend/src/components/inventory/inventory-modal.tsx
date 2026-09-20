"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { fetchInventory, fetchWaitlist, addToWaitlist, notifyWaitlist } from "@/lib/inventory-api";
import { createStockCount, applyStockCount } from "@/lib/stock-count-api";
import { updateLowStockThreshold } from "@/lib/inventory-api";
import { fetchPurchaseOrder, receivePurchaseOrder } from "@/lib/purchase-orders-api";
import { searchCustomers, type CustomerSearchResult } from "@/lib/customers-api";
import { useInventoryDrawer } from "@/components/inventory/inventory-drawer-context";
import { INV, InventoryModalShell, fieldLabelStyle, fieldInputStyle } from "@/components/inventory/inventory-ui";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { useMemo } from "react";

export function InventoryModal() {
  const { modal, close } = useInventoryDrawer();
  if (!modal) return null;

  const title = modal.mode === "adjust" ? "Adjust Stock" : modal.mode === "thresholds" ? "Edit Threshold" : modal.mode === "waitlist" ? "Back-in-Stock Waitlist" : "Receive Order";

  return (
    <InventoryModalShell title={title} onClose={close}>
      {modal.mode === "adjust" && <AdjustBody productId={modal.productId} />}
      {modal.mode === "thresholds" && <ThresholdsBody productIds={modal.productIds} />}
      {modal.mode === "waitlist" && <WaitlistBody productId={modal.productId} />}
      {modal.mode === "receive" && <ReceiveBody orderId={modal.orderId} />}
    </InventoryModalShell>
  );
}

function ModalFooter({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 9, padding: 17, borderTop: "1px solid #F0F2F5" }}>{children}</div>;
}

function AdjustBody({ productId }: { productId: string }) {
  const { close } = useInventoryDrawer();
  const queryClient = useQueryClient();
  const { data: items = [] } = useQuery({ queryKey: ["inventory"], queryFn: fetchInventory });
  const item = items.find((i) => i.id === productId);
  // `null` means "not yet edited" — the displayed value then derives from `item` (which may still
  // be loading on first render), rather than syncing a copy of it into state via an effect.
  const [editedQty, setEditedQty] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const countedQty = editedQty ?? (item ? String(item.stockQty) : "");

  const valid = item != null && countedQty.trim() !== "" && Number(countedQty) >= 0 && Number(countedQty) !== item.stockQty;
  const delta = item ? Number(countedQty || 0) - item.stockQty : 0;

  const mutation = useMutation({
    mutationFn: async () => {
      const count = await createStockCount({ note: note.trim() || "Manual stock adjustment", lines: [{ productId, countedQty: Number(countedQty) }] });
      return applyStockCount(count.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      queryClient.invalidateQueries({ queryKey: ["stock-counts"] });
      toast.success("Stock adjusted.");
      close();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't adjust this stock — please try again."),
  });

  if (!item) return <div style={{ padding: 17, fontSize: 12.5, color: INV.textFaint }}>Loading…</div>;

  return (
    <>
      <div style={{ padding: 17, display: "flex", flexDirection: "column", gap: 13 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A" }}>{item.name}</div>
          <div style={{ fontSize: 12, color: INV.textFaint, marginTop: 3 }}>
            Currently on hand: <strong style={{ color: "#101828" }}>{item.stockQty}</strong>
          </div>
        </div>
        <div>
          <label style={fieldLabelStyle}>New counted quantity</label>
          <input
            type="number"
            min={0}
            value={countedQty}
            onChange={(e) => setEditedQty(e.target.value)}
            style={{ ...fieldInputStyle, fontSize: 18, fontWeight: 800 }}
          />
        </div>
        {item && countedQty.trim() !== "" && Number(countedQty) !== item.stockQty && (
          <div style={{ background: delta > 0 ? "#F7FCF9" : "#FEF3F2", border: `1px solid ${delta > 0 ? "#D5EFE0" : "#FDD9D6"}`, borderRadius: 11, padding: "11px 13px", fontSize: 12.5, fontWeight: 700, color: delta > 0 ? "#0E8442" : "#B42318" }}>
            {delta > 0 ? "+" : ""}
            {delta} units — {item.stockQty} → {countedQty}
          </div>
        )}
        <div>
          <label style={fieldLabelStyle}>Note</label>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why is this changing?" style={{ width: "100%", border: `1px solid ${INV.border}`, borderRadius: 11, padding: 11, fontSize: 13, fontFamily: "inherit", resize: "vertical" }} />
        </div>
        <div style={{ fontSize: 11, color: INV.textFaint, lineHeight: 1.5 }}>Recorded as a single-product stock count, applied immediately — it shows up in Stock Count history and posts a real adjustment movement.</div>
      </div>
      <ModalFooter>
        <button type="button" onClick={close} style={{ border: `1px solid ${INV.border}`, background: "#fff", borderRadius: 11, padding: "12px 16px", fontSize: 12.5, fontWeight: 700, color: INV.textSubtle, cursor: "pointer", minHeight: 46 }}>
          Cancel
        </button>
        <button type="button" onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending} style={{ flex: 1, border: 0, background: INV.primary, borderRadius: 11, padding: 12, fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46, opacity: !valid || mutation.isPending ? 0.6 : 1 }}>
          {mutation.isPending ? "Applying…" : "Apply Adjustment"}
        </button>
      </ModalFooter>
    </>
  );
}

function ThresholdsBody({ productIds }: { productIds: string[] }) {
  const { close } = useInventoryDrawer();
  const queryClient = useQueryClient();
  const [threshold, setThreshold] = useState("5");

  const mutation = useMutation({
    mutationFn: () => Promise.all(productIds.map((id) => updateLowStockThreshold(id, Number(threshold)))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["low-stock"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast.success(`Updated threshold for ${productIds.length} product${productIds.length === 1 ? "" : "s"}.`);
      close();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update these thresholds — please try again."),
  });

  return (
    <>
      <div style={{ padding: 17, display: "flex", flexDirection: "column", gap: 13 }}>
        <div style={{ fontSize: 12.5, color: INV.textMuted }}>
          Editing threshold for <strong style={{ color: "#101828" }}>{productIds.length}</strong> product{productIds.length === 1 ? "" : "s"}.
        </div>
        <div>
          <label style={fieldLabelStyle}>Low-stock threshold</label>
          <input type="number" min={0} value={threshold} onChange={(e) => setThreshold(e.target.value)} style={{ ...fieldInputStyle, fontSize: 18, fontWeight: 800 }} />
        </div>
      </div>
      <ModalFooter>
        <button type="button" onClick={close} style={{ border: `1px solid ${INV.border}`, background: "#fff", borderRadius: 11, padding: "12px 16px", fontSize: 12.5, fontWeight: 700, color: INV.textSubtle, cursor: "pointer", minHeight: 46 }}>
          Cancel
        </button>
        <button type="button" onClick={() => mutation.mutate()} disabled={Number(threshold) < 0 || mutation.isPending} style={{ flex: 1, border: 0, background: INV.primary, borderRadius: 11, padding: 12, fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46, opacity: mutation.isPending ? 0.6 : 1 }}>
          {mutation.isPending ? "Saving…" : "Save"}
        </button>
      </ModalFooter>
    </>
  );
}

function WaitlistBody({ productId }: { productId: string }) {
  const { close } = useInventoryDrawer();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const { data: items = [] } = useQuery({ queryKey: ["inventory"], queryFn: fetchInventory });
  const item = items.find((i) => i.id === productId);
  const { data: waitlist = [] } = useQuery({ queryKey: ["waitlist", productId], queryFn: () => fetchWaitlist(productId) });
  const { data: results = [] } = useQuery({ queryKey: ["customer-search", query], queryFn: () => searchCustomers(query), enabled: query.trim().length > 0 });

  const addMutation = useMutation({
    mutationFn: (customerId: string) => addToWaitlist(productId, customerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["waitlist", productId] });
      queryClient.invalidateQueries({ queryKey: ["low-stock"] });
      setQuery("");
      toast.success("Added to the waitlist.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't add this customer — please try again."),
  });
  const notifyMutation = useMutation({
    mutationFn: () => notifyWaitlist(productId),
    onSuccess: (result) => toast.success(`Notified ${result.notifiedCount} waiting customer${result.notifiedCount === 1 ? "" : "s"}.`),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't notify the waitlist — please try again."),
  });

  return (
    <>
      <div style={{ padding: 17, display: "flex", flexDirection: "column", gap: 13 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A" }}>{item?.name ?? "…"}</div>
          <div style={{ fontSize: 12, color: INV.textFaint, marginTop: 3 }}>
            {waitlist.length} customer{waitlist.length === 1 ? "" : "s"} waiting to be notified.
          </div>
        </div>
        <div>
          <label style={fieldLabelStyle}>Add a customer</label>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a customer to add…" style={fieldInputStyle} />
          {results.length > 0 && (
            <div style={{ border: `1px solid ${INV.borderStrong}`, borderRadius: 11, marginTop: 7, overflow: "hidden" }}>
              {results.map((c: CustomerSearchResult) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => addMutation.mutate(c.id)}
                  style={{ width: "100%", display: "flex", justifyContent: "space-between", padding: "10px 12px", border: 0, borderBottom: "1px solid #F0F2F5", background: "#fff", cursor: "pointer", textAlign: "left" }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{c.name}</span>
                  <span style={{ fontSize: 11.5, color: INV.textFaint }}>{c.phone}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {waitlist.length === 0 ? (
            <div style={{ fontSize: 12.5, color: INV.textFaint }}>No one waiting yet.</div>
          ) : (
            waitlist.map((w) => (
              <div key={w.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: `1px solid ${INV.border}`, borderRadius: 10, padding: "9px 12px" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{w.customer.name}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: w.notifiedAt ? "#0E8442" : INV.textFaint }}>{w.notifiedAt ? "Notified" : "Waiting"}</span>
              </div>
            ))
          )}
        </div>
      </div>
      <ModalFooter>
        <button type="button" onClick={close} style={{ border: `1px solid ${INV.border}`, background: "#fff", borderRadius: 11, padding: "12px 16px", fontSize: 12.5, fontWeight: 700, color: INV.textSubtle, cursor: "pointer", minHeight: 46 }}>
          Close
        </button>
        <button
          type="button"
          onClick={() => notifyMutation.mutate()}
          disabled={!item || item.stockQty <= 0 || waitlist.length === 0 || notifyMutation.isPending}
          title={item && item.stockQty <= 0 ? "Restock before notifying" : undefined}
          style={{ flex: 1, border: 0, background: INV.primary, borderRadius: 11, padding: 12, fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46, opacity: !item || item.stockQty <= 0 || waitlist.length === 0 || notifyMutation.isPending ? 0.6 : 1 }}
        >
          <UserPlus size={14} style={{ display: "inline", marginRight: 5, verticalAlign: -2 }} />
          {notifyMutation.isPending ? "Notifying…" : "Notify Waitlist"}
        </button>
      </ModalFooter>
    </>
  );
}

function ReceiveBody({ orderId }: { orderId: string }) {
  const { close } = useInventoryDrawer();
  const queryClient = useQueryClient();
  const { data: order } = useQuery({ queryKey: ["purchase-order", orderId], queryFn: () => fetchPurchaseOrder(orderId) });
  const outstanding = useMemo(() => order?.items.filter((i) => i.qtyReceived < i.qtyOrdered) ?? [], [order]);
  const [qtyByItem, setQtyByItem] = useState<Record<string, string>>({});

  const lines = order ? outstanding.map((i) => ({ id: i.id, value: qtyByItem[i.id] ?? String(i.qtyOrdered - i.qtyReceived) })) : [];

  const mutation = useMutation({
    mutationFn: () =>
      receivePurchaseOrder(
        orderId,
        lines.map((l) => ({ itemId: l.id, qtyReceived: Number(l.value || 0) })).filter((l) => l.qtyReceived > 0),
      ),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast.success(updated.status === "received" ? "Fully received — stock updated." : "Partially received — stock updated.");
      close();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't record this receipt — please try again."),
  });

  if (!order) return <div style={{ padding: 17, fontSize: 12.5, color: INV.textFaint }}>Loading…</div>;

  return (
    <>
      <div style={{ padding: 17, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 12, color: INV.textFaint }}>{order.supplier.name}</div>
        {outstanding.map((item) => (
          <div key={item.id} style={{ border: `1px solid ${INV.border}`, borderRadius: 11, padding: 11, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{item.product.name}</div>
              <div style={{ fontSize: 11, color: INV.textFaint, marginTop: 2 }}>
                {item.qtyReceived} of {item.qtyOrdered} received so far
              </div>
            </div>
            <input
              type="number"
              min={0}
              max={item.qtyOrdered - item.qtyReceived}
              value={qtyByItem[item.id] ?? String(item.qtyOrdered - item.qtyReceived)}
              onChange={(e) => setQtyByItem((prev) => ({ ...prev, [item.id]: e.target.value }))}
              style={{ width: 88, border: `1px solid ${INV.border}`, borderRadius: 9, padding: 9, fontSize: 13, fontWeight: 800, textAlign: "center" }}
            />
          </div>
        ))}
      </div>
      <ModalFooter>
        <button type="button" onClick={close} style={{ border: `1px solid ${INV.border}`, background: "#fff", borderRadius: 11, padding: "12px 16px", fontSize: 12.5, fontWeight: 700, color: INV.textSubtle, cursor: "pointer", minHeight: 46 }}>
          Cancel
        </button>
        <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} style={{ flex: 1, border: 0, background: INV.primary, borderRadius: 11, padding: 12, fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46, opacity: mutation.isPending ? 0.6 : 1 }}>
          {mutation.isPending ? "Recording…" : "Record Receipt"}
        </button>
      </ModalFooter>
    </>
  );
}

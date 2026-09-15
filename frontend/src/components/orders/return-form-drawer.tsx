"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SlideDrawer } from "@/components/dashboard/slide-drawer";
import { createReturn } from "@/lib/returns-api";
import { fetchSalesHistory, fetchSalesHistoryDetail, type LiveSalesHistoryRow } from "@/lib/sales-history-api";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";

const fieldLabel: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", marginBottom: 5 };
const fieldStyle: React.CSSProperties = { width: "100%", border: "1px solid var(--app-border)", borderRadius: 11, padding: 12, fontSize: 13, fontWeight: 700, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 48 };
const REASONS = ["Damaged item", "Wrong item", "Changed mind", "Late delivery"];

/** New Return, pixel-matched to the design's 3-step `dReturn` drawer — real order lookup by
 * number against Sales History, real per-item quantity selection, real reason/restock/refund
 * method feeding `POST /returns`. */
export function ReturnFormDrawer({ open, onClose, currency }: { open: boolean; onClose: () => void; currency: string }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [orderQuery, setOrderQuery] = useState("");
  const [selected, setSelected] = useState<LiveSalesHistoryRow | null>(null);
  const [qtyByProduct, setQtyByProduct] = useState<Record<string, number>>({});
  const [reason, setReason] = useState(REASONS[0]);
  const [restock, setRestock] = useState(true);
  const [refundMethod, setRefundMethod] = useState<"cash" | "card" | "online" | "credit" | "store_credit">("cash");
  const queryClient = useQueryClient();

  const { data: sales } = useQuery({ queryKey: ["sales-history", {}], queryFn: () => fetchSalesHistory({}), enabled: open });
  const matches = useMemo(() => {
    if (!sales || !orderQuery.trim()) return [];
    return sales.filter((s) => String(s.orderNo).includes(orderQuery.trim()) || s.customerName?.toLowerCase().includes(orderQuery.trim().toLowerCase())).slice(0, 6);
  }, [sales, orderQuery]);

  const { data: detail } = useQuery({
    queryKey: ["sales-history-detail", selected?.id],
    queryFn: () => fetchSalesHistoryDetail(selected!.id),
    enabled: selected != null,
  });
  const returnable = (detail?.order?.items ?? []).filter((i) => i.productId != null);

  function reset() {
    setStep(1);
    setOrderQuery("");
    setSelected(null);
    setQtyByProduct({});
    setReason(REASONS[0]);
    setRestock(true);
    setRefundMethod("cash");
  }
  function handleClose() {
    reset();
    onClose();
  }

  const mutation = useMutation({
    mutationFn: () =>
      createReturn({
        orderId: selected!.id,
        reason,
        refundMethod,
        restock,
        items: returnable.filter((i) => (qtyByProduct[i.productId as string] ?? 0) > 0).map((i) => ({ productId: i.productId as string, qty: qtyByProduct[i.productId as string] })),
      }),
    onSuccess: () => {
      toast.success("Return submitted for approval.");
      queryClient.invalidateQueries({ queryKey: ["returns"] });
      handleClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't submit this return — please try again."),
  });

  const anySelected = returnable.some((i) => (qtyByProduct[i.productId as string] ?? 0) > 0);

  return (
    <SlideDrawer open={open} onClose={handleClose} title="New Return">
      <div className="flex flex-col gap-3.5">
        <div className="flex gap-1.5">
          {[1, 2, 3].map((s) => (
            <span key={s} className="h-[5px] flex-1 rounded-[4px]" style={{ background: s <= step ? "var(--app-primary)" : "var(--app-surface-2)" }} />
          ))}
        </div>

        {step === 1 && (
          <div className="flex flex-col gap-3">
            <div className="text-[13.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Step 1 · Find the original order</div>
            <input
              value={orderQuery}
              onChange={(e) => setOrderQuery(e.target.value)}
              placeholder="Order number or customer name"
              style={fieldStyle}
            />
            {matches.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelected(s)}
                className="rounded-[12px] p-[13px] text-start"
                style={{ border: selected?.id === s.id ? "1px solid var(--app-primary)" : "1px solid var(--app-border)", background: selected?.id === s.id ? "var(--app-page-bg, #F7FCF9)" : "var(--app-surface)" }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[12.5px] font-extrabold" style={{ color: "var(--app-success-text)" }}>#{s.orderNo}</span>
                  <span className="ms-auto text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>{s.customerName ?? "Walk-in"}</span>
                </div>
                <div className="mt-1 text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>{s.itemsCount} items · {formatCurrency(s.total, currency)}</div>
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-3">
            <div className="text-[13.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Step 2 · Select items and quantity</div>
            {returnable.length === 0 ? (
              <p className="text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No returnable line items on this sale.</p>
            ) : (
              returnable.map((item) => (
                <div key={item.productId} className="flex items-center gap-2.5 rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
                  <input
                    type="checkbox"
                    checked={(qtyByProduct[item.productId as string] ?? 0) > 0}
                    onChange={(e) => setQtyByProduct((q) => ({ ...q, [item.productId as string]: e.target.checked ? item.qty : 0 }))}
                    aria-label={`Select ${item.name}`}
                    style={{ accentColor: "var(--app-primary)" }}
                  />
                  <span className="flex-1 text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{item.name}</span>
                  <input
                    type="number"
                    min={0}
                    max={item.qty}
                    value={qtyByProduct[item.productId as string] ?? 0}
                    onChange={(e) => setQtyByProduct((q) => ({ ...q, [item.productId as string]: Math.min(item.qty, Math.max(0, Number(e.target.value))) }))}
                    aria-label={`Quantity for ${item.name}`}
                    className="w-[70px] rounded-[9px] p-2 text-center text-[13px] font-bold"
                    style={{ border: "1px solid var(--app-border)" }}
                  />
                  <span className="text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(item.price, currency)}</span>
                </div>
              ))
            )}
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-3">
            <div className="text-[13.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Step 3 · Reason, restock and refund</div>
            <label className="block">
              <span style={fieldLabel}>REASON</span>
              <select value={reason} onChange={(e) => setReason(e.target.value)} style={fieldStyle}>
                {REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-3 rounded-[12px] p-[13px]" style={{ border: "1px solid var(--app-border)" }}>
              <span className="flex-1">
                <span className="block text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>Restock returned items</span>
                <span className="block text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Adds the units back to Inventory</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={restock}
                onClick={() => setRestock((v) => !v)}
                className="relative h-[22px] w-10 shrink-0 rounded-full"
                style={{ background: restock ? "var(--app-primary)" : "var(--app-border-strong)" }}
              >
                <span className="absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white transition-all" style={{ left: restock ? 20 : 2 }} />
              </button>
            </div>
            <label className="block">
              <span style={fieldLabel}>REFUND METHOD</span>
              <select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as typeof refundMethod)} style={fieldStyle}>
                <option value="cash">Cash</option>
                <option value="card">Card reversal</option>
                <option value="online">Online reversal</option>
                <option value="store_credit">Store credit</option>
              </select>
            </label>
          </div>
        )}

        <div className="flex gap-2.5 border-t pt-3.5" style={{ borderColor: "var(--app-surface-2)" }}>
          <button type="button" onClick={() => (step === 1 ? handleClose() : setStep((s) => (s - 1) as typeof step))} className="rounded-[11px] px-4 py-3 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
            {step === 1 ? "Cancel" : "Back"}
          </button>
          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s + 1) as typeof step)}
              disabled={(step === 1 && !selected) || (step === 2 && !anySelected)}
              className="flex-1 rounded-[11px] px-4 py-3 text-[13px] font-extrabold text-white disabled:opacity-50"
              style={{ background: "var(--app-primary)" }}
            >
              Continue
            </button>
          ) : (
            <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="flex-1 rounded-[11px] px-4 py-3 text-[13px] font-extrabold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>
              {mutation.isPending ? "Submitting…" : "Review & approve"}
            </button>
          )}
        </div>
      </div>
    </SlideDrawer>
  );
}

"use client";

import { useState } from "react";
import { PosModalShell } from "@/components/pos/pos-modal-shell";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import type { LiveOrder } from "@/lib/orders-api";
import type { OrderStatus } from "@/lib/orders";

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];
const CANCEL_REASONS = ["Customer cancelled", "Out of stock", "Payment failed", "Duplicate order"];

const cancelBtn: React.CSSProperties = { background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" };
const primaryBtn: React.CSSProperties = { background: "var(--app-primary)", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff" };
const dangerBtn: React.CSSProperties = { background: "var(--app-danger-strong)", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff" };
const fieldLabel: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", marginBottom: 5 };
const selectStyle: React.CSSProperties = { width: "100%", border: "1px solid var(--app-border)", borderRadius: 11, padding: 12, fontSize: 13, fontWeight: 700, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 48 };

export function ChangeStatusModal({
  order,
  onClose,
  onApply,
  applying,
}: {
  order: LiveOrder | null;
  onClose: () => void;
  onApply: (status: OrderStatus, reason?: string) => void;
  applying: boolean;
}) {
  const [status, setStatus] = useState<OrderStatus>("pending");
  const [reason, setReason] = useState(CANCEL_REASONS[0]);

  return (
    <PosModalShell
      open={order != null}
      onClose={onClose}
      title="Change Status"
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
          <button type="button" onClick={() => onApply(status, status === "cancelled" ? reason : undefined)} disabled={applying} style={{ ...primaryBtn, opacity: applying ? 0.6 : 1 }}>
            {applying ? "Updating…" : "Update Status"}
          </button>
        </>
      }
    >
      {order && (
        <div className="flex flex-col gap-3 p-[17px]">
          <div className="flex justify-between">
            <span className="text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Current status</span>
            <span className="text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{order.status.replace("_", " ")}</span>
          </div>
          <label className="block">
            <span style={fieldLabel}>NEW STATUS</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)} style={selectStyle}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
          {status === "cancelled" && (
            <label className="block">
              <span style={fieldLabel}>CANCELLATION REASON</span>
              <select value={reason} onChange={(e) => setReason(e.target.value)} style={selectStyle}>
                {CANCEL_REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </PosModalShell>
  );
}

export function CancelOrderModal({
  order,
  currency,
  onClose,
  onCancel,
  cancelling,
}: {
  order: LiveOrder | null;
  currency: string;
  onClose: () => void;
  onCancel: (reason: string) => void;
  cancelling: boolean;
}) {
  const [reason, setReason] = useState(CANCEL_REASONS[0]);

  return (
    <PosModalShell
      open={order != null}
      onClose={onClose}
      title="Cancel Order"
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelBtn}>Keep Order</button>
          <button type="button" onClick={() => onCancel(reason)} disabled={cancelling} style={{ ...dangerBtn, opacity: cancelling ? 0.6 : 1 }}>
            {cancelling ? "Cancelling…" : "Cancel Order"}
          </button>
        </>
      }
    >
      {order && (
        <div className="flex flex-col gap-3 p-[17px]">
          <div className="rounded-[12px] p-[13px]" style={{ background: "var(--app-surface-2)" }}>
            <div className="flex justify-between p-[4px_0] text-[12.5px]"><span style={{ color: "var(--app-text-faintest)" }}>Order</span><span className="font-extrabold" style={{ color: "var(--app-text)" }}>#{order.orderNo}</span></div>
            <div className="flex justify-between p-[4px_0] text-[12.5px]"><span style={{ color: "var(--app-text-faintest)" }}>Customer</span><span className="font-bold" style={{ color: "var(--app-text-muted)" }}>{order.customerName}</span></div>
            <div className="flex justify-between p-[4px_0] text-[12.5px]"><span style={{ color: "var(--app-text-faintest)" }}>Total</span><span className="font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(order.total, currency)}</span></div>
          </div>
          <label className="block">
            <span style={fieldLabel}>REASON</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)} style={selectStyle}>
              {CANCEL_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
        </div>
      )}
    </PosModalShell>
  );
}

export function PrintOrderModal({ order, currency, businessName, onClose }: { order: LiveOrder | null; currency: string; businessName: string; onClose: () => void }) {
  return (
    <PosModalShell
      open={order != null}
      onClose={onClose}
      title="Print"
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelBtn}>Close</button>
          <button type="button" onClick={() => window.print()} style={primaryBtn}>Print</button>
        </>
      }
    >
      {order && (
        <div className="p-[17px]">
          <div className="rounded-[12px] p-4" style={{ border: "1px solid var(--app-border)", fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace" }}>
            <div className="text-center text-[13px] font-extrabold" style={{ color: "var(--app-text)" }}>{businessName}</div>
            <div className="my-2.5 border-t border-dashed" style={{ borderColor: "var(--app-border-strong)" }} />
            <div className="flex justify-between text-[11.5px]" style={{ color: "var(--app-text-faint)" }}><span>#{order.orderNo}</span><span>{formatDate(order.createdAt)} {formatTime(order.createdAt)}</span></div>
            <div className="mt-1 flex justify-between text-[11.5px]" style={{ color: "var(--app-text-faint)" }}><span>{order.customerName}</span><span>{order.orderType}</span></div>
            <div className="my-2.5 border-t border-dashed" style={{ borderColor: "var(--app-border-strong)" }} />
            <div className="flex justify-between text-[13px] font-extrabold" style={{ color: "var(--app-text)" }}><span>TOTAL</span><span>{formatCurrency(order.total, currency)}</span></div>
          </div>
          <div className="mt-3 inline-block rounded-full px-[10px] py-[3px] text-[11px] font-bold" style={{ background: "var(--app-warning-bg)", color: "var(--app-warning-text)" }}>
            Printer: Not Connected
          </div>
        </div>
      )}
    </PosModalShell>
  );
}

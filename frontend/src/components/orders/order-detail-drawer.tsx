"use client";

import { SlideDrawer } from "@/components/dashboard/slide-drawer";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import type { LiveOrder } from "@/lib/orders-api";

const STATUS_BADGE: Record<string, { bg: string; fg: string }> = {
  pending: { bg: "var(--app-warning-bg)", fg: "var(--app-warning-text)" },
  confirmed: { bg: "#EEF4FF", fg: "#3538CD" },
  in_progress: { bg: "#E8F1FE", fg: "#1849A9" },
  completed: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)" },
  cancelled: { bg: "#FEF3F2", fg: "var(--app-danger-strong)" },
  draft: { bg: "var(--app-surface-2)", fg: "var(--app-text-faint)" },
};
const PAY_BADGE: Record<string, { bg: string; fg: string }> = {
  paid: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)" },
  unpaid: { bg: "#FEF3F2", fg: "var(--app-danger-strong)" },
  partial: { bg: "var(--app-warning-bg)", fg: "var(--app-warning-text)" },
  refunded: { bg: "var(--app-surface-2)", fg: "var(--app-text-faint)" },
};

function Pill({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return <span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: bg, color: fg }}>{label}</span>;
}

export function OrderDetailDrawer({
  order,
  currency,
  branchName,
  onClose,
  onPrint,
  onCancel,
  onChangeStatus,
}: {
  order: LiveOrder | null;
  currency: string;
  branchName?: string;
  onClose: () => void;
  onPrint: () => void;
  onCancel: () => void;
  onChangeStatus: () => void;
}) {
  return (
    <SlideDrawer open={order != null} onClose={onClose} title={order ? `Order #${order.orderNo}` : "Order"}>
      {order && (
        <div className="flex flex-col gap-[15px]">
          <div className="flex flex-wrap items-center gap-2">
            <Pill label={order.status.replace("_", " ")} {...(STATUS_BADGE[order.status] ?? STATUS_BADGE.pending)} />
            <Pill label={order.paymentStatus} {...PAY_BADGE[order.paymentStatus]} />
            <span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: "var(--app-surface-2)", color: "var(--app-text-faint)" }}>{order.orderType}</span>
            <span className="ms-auto text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>{formatDate(order.createdAt)} {formatTime(order.createdAt)}</span>
          </div>

          <div className="flex items-baseline gap-2.5 rounded-[13px] p-[14px]" style={{ background: "var(--app-success-bg)", border: "1px solid var(--app-success-border)" }}>
            <span className="text-[12px] font-bold" style={{ color: "var(--app-success-text)" }}>Order total</span>
            <span className="ms-auto text-[25px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.8px" }}>{formatCurrency(order.total, currency)}</span>
          </div>

          <div>
            <div className="mb-1.5 text-[10.5px] font-extrabold uppercase" style={{ color: "var(--app-text-disabled)", letterSpacing: ".4px" }}>Customer</div>
            <div className="flex justify-between p-[6px_0]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}><span className="text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Name</span><span className="text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{order.customerName}</span></div>
            <div className="flex justify-between p-[6px_0]"><span className="text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Handled by</span><span className="text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{order.staffName ?? "—"}</span></div>
          </div>

          <div>
            <div className="mb-1.5 text-[10.5px] font-extrabold uppercase" style={{ color: "var(--app-text-disabled)", letterSpacing: ".4px" }}>Items</div>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="pb-1.5 text-start text-[10.5px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Product</th>
                  <th className="pb-1.5 text-end text-[10.5px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Qty</th>
                  <th className="pb-1.5 text-end text-[10.5px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--app-surface-2)" }}>
                    <td className="p-[8px_0] text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{item.name}</td>
                    <td className="p-[8px_0] text-end text-[12px]" style={{ color: "var(--app-text-faint)" }}>{item.qty}</td>
                    <td className="p-[8px_0] text-end text-[12px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(item.price * item.qty, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <div className="mb-1.5 text-[10.5px] font-extrabold uppercase" style={{ color: "var(--app-text-disabled)", letterSpacing: ".4px" }}>Payment</div>
            <div className="flex justify-between p-[6px_0]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}><span className="text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Method</span><span className="text-[12.5px] font-bold capitalize" style={{ color: "var(--app-text)" }}>{order.paymentMethod}</span></div>
            <div className="flex justify-between p-[6px_0]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}><span className="text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Tax</span><span className="text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{formatCurrency(order.tax, currency)}</span></div>
            <div className="flex justify-between p-[6px_0]"><span className="text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Balance</span><span className="text-[12.5px] font-bold" style={{ color: order.balance > 0 ? "var(--app-danger-strong)" : "var(--app-text)" }}>{formatCurrency(order.balance, currency)}</span></div>
          </div>

          <div>
            <div className="mb-1.5 text-[10.5px] font-extrabold uppercase" style={{ color: "var(--app-text-disabled)", letterSpacing: ".4px" }}>Fulfilment &amp; notes</div>
            <p className="m-0 text-[12.5px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
              {order.orderType} order{branchName ? `, prepared at ${branchName}` : ""}.{order.cancelReason ? ` Cancelled — ${order.cancelReason}.` : ""}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-[9px] pt-[14px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
            <button type="button" onClick={onPrint} className="rounded-[11px] p-[11px] text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Print</button>
            <button type="button" onClick={onClose} className="rounded-[11px] p-[11px] text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Close</button>
            <button
              type="button"
              onClick={onCancel}
              disabled={order.status === "completed" || order.status === "cancelled"}
              className="rounded-[11px] p-[11px] text-[12.5px] font-bold disabled:opacity-40"
              style={{ border: "1px solid var(--app-border)", color: "var(--app-danger-strong)" }}
            >
              Cancel Order
            </button>
            <button
              type="button"
              onClick={onChangeStatus}
              disabled={order.status === "completed" || order.status === "cancelled"}
              className="rounded-[11px] p-[11px] text-[12.5px] font-extrabold text-white disabled:opacity-40"
              style={{ background: "var(--app-primary)" }}
            >
              Change Status
            </button>
          </div>
        </div>
      )}
    </SlideDrawer>
  );
}

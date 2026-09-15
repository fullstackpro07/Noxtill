"use client";

import { useState } from "react";
import { CreditCard, Landmark } from "lucide-react";
import { PosModalShell } from "./pos-modal-shell";
import { formatCurrency } from "@/lib/format";
import type { PosCustomer } from "./customer-drawer";

const btnCancel: React.CSSProperties = {
  background: "var(--app-surface)",
  border: "1px solid var(--app-border)",
  borderRadius: 11,
  padding: "11px 18px",
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--app-text-muted)",
};
const btnPrimary: React.CSSProperties = {
  background: "var(--app-primary)",
  border: 0,
  borderRadius: 11,
  padding: "11px 22px",
  fontSize: 13,
  fontWeight: 800,
  color: "#fff",
};
const btnDanger: React.CSSProperties = { ...btnPrimary, background: "var(--app-danger-strong)" };

export function DiscountModal({
  open,
  onClose,
  subtotal,
  currency,
  onApply,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  subtotal: number;
  currency: string;
  onApply: (amount: number) => void;
  onRemove: () => void;
}) {
  const [type, setType] = useState<"amount" | "percent">("amount");
  const [draft, setDraft] = useState("");
  const value = Number(draft) || 0;
  const amount = Math.min(type === "percent" ? subtotal * (Math.min(value, 100) / 100) : value, subtotal);
  const after = Math.max(0, subtotal - amount);
  const error = value < 0 ? "Discount can't be negative." : type === "percent" && value > 100 ? "Percent can't exceed 100." : null;

  return (
    <PosModalShell
      open={open}
      onClose={onClose}
      title="Apply Discount"
      footer={
        <>
          <button onClick={onClose} style={btnCancel}>Cancel</button>
          <button onClick={() => { onApply(amount); onClose(); }} disabled={!!error || value <= 0} style={{ ...btnPrimary, opacity: !!error || value <= 0 ? 0.6 : 1 }}>Apply</button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5 p-[17px]">
        <div className="flex gap-1 rounded-[11px] p-1" style={{ background: "var(--app-surface-2)" }}>
          <button
            onClick={() => setType("amount")}
            className="flex-1 rounded-[8px] p-2.5 text-[12.5px] font-bold"
            style={{ background: type === "amount" ? "#fff" : "transparent", color: type === "amount" ? "var(--app-primary-hover, #0E8442)" : "var(--app-text-faint)" }}
          >
            Amount ({currency})
          </button>
          <button
            onClick={() => setType("percent")}
            className="flex-1 rounded-[8px] p-2.5 text-[12.5px] font-bold"
            style={{ background: type === "percent" ? "#fff" : "transparent", color: type === "percent" ? "var(--app-primary-hover, #0E8442)" : "var(--app-text-faint)" }}
          >
            Percent (%)
          </button>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>DISCOUNT VALUE</span>
          <input
            type="number"
            min={0}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            className="w-full rounded-[11px] p-[13px] text-[16px] font-bold"
            style={{ border: "1px solid var(--app-border)" }}
          />
        </label>
        <div className="rounded-[12px] p-[13px]" style={{ background: "var(--app-surface-2)", border: "1px solid var(--app-border)" }}>
          <div className="flex justify-between py-[3px] text-[12.5px]"><span style={{ color: "var(--app-text-faint)" }}>Original total</span><span className="font-bold" style={{ color: "var(--app-text-muted)" }}>{formatCurrency(subtotal, currency)}</span></div>
          <div className="flex justify-between py-[3px] text-[12.5px]"><span style={{ color: "var(--app-text-faint)" }}>Discount</span><span className="font-bold" style={{ color: "var(--app-danger-strong)" }}>−{formatCurrency(amount, currency)}</span></div>
          <div className="mt-1.5 flex justify-between border-t border-dashed pt-1.5" style={{ borderColor: "var(--app-border-strong)" }}><span className="text-[13px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>New total</span><span className="text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(after, currency)}</span></div>
        </div>
        {error && <div role="alert" className="rounded-[10px] p-[10px_12px] text-[12px]" style={{ background: "#FEF3F2", border: "1px solid #FDD9D6", color: "var(--app-danger-strong)" }}>{error}</div>}
        <button onClick={() => { onRemove(); onClose(); }} className="me-auto bg-transparent text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>Remove discount</button>
      </div>
    </PosModalShell>
  );
}

export function CashPaymentModal({
  open,
  onClose,
  total,
  currency,
  onComplete,
  completing,
}: {
  open: boolean;
  onClose: () => void;
  total: number;
  currency: string;
  onComplete: (amountReceived: number) => void;
  completing: boolean;
}) {
  const [received, setReceived] = useState("");
  const amt = Number(received) || 0;
  const change = amt - total;
  const short = received.trim().length > 0 && amt < total;
  const quick = [total, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500, Math.ceil(total / 1000) * 1000].filter((v, i, arr) => arr.indexOf(v) === i);

  return (
    <PosModalShell
      open={open}
      onClose={onClose}
      title="Cash Payment"
      footer={
        <>
          <button onClick={onClose} style={btnCancel}>Cancel</button>
          <button onClick={() => onComplete(amt)} disabled={short || completing} style={{ ...btnPrimary, opacity: short || completing ? 0.6 : 1 }}>
            {completing ? "Completing…" : "Complete Sale"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5 p-[17px]">
        <div className="flex items-baseline gap-2.5 rounded-[13px] p-[14px]" style={{ background: "var(--app-success-bg)", border: "1px solid var(--app-success-border)" }}>
          <span className="text-[12.5px] font-bold" style={{ color: "var(--app-primary-hover, #0E8442)" }}>Total due</span>
          <span className="ms-auto text-[24px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.6px" }}>{formatCurrency(total, currency)}</span>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>AMOUNT RECEIVED</span>
          <input
            type="number"
            min={0}
            value={received}
            onChange={(e) => setReceived(e.target.value)}
            autoFocus
            className="w-full rounded-[11px] p-[13px] text-[18px] font-extrabold"
            style={{ border: "1px solid var(--app-border)" }}
          />
        </label>
        <div className="grid grid-cols-4 gap-2">
          {quick.map((v) => (
            <button key={v} onClick={() => setReceived(String(v))} className="rounded-[10px] p-[11px_4px] text-[12px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
              {formatCurrency(v, currency)}
            </button>
          ))}
        </div>
        <div className="flex items-baseline justify-between rounded-[12px] p-[13px]" style={{ background: "var(--app-surface-2)", border: "1px solid var(--app-border)" }}>
          <span className="text-[12.5px] font-bold" style={{ color: "var(--app-text-faint)" }}>Change</span>
          <span className="text-[20px] font-extrabold" style={{ color: change < 0 ? "var(--app-danger-strong)" : "var(--app-text)" }}>{formatCurrency(Math.max(0, change), currency)}</span>
        </div>
        {short && <div role="alert" className="rounded-[10px] p-[10px_12px] text-[12px]" style={{ background: "#FEF3F2", border: "1px solid #FDD9D6", color: "var(--app-danger-strong)" }}>Amount received is less than total.</div>}
      </div>
    </PosModalShell>
  );
}

export function TerminalPaymentModal({
  open,
  onClose,
  method,
  total,
  currency,
  onComplete,
  completing,
}: {
  open: boolean;
  onClose: () => void;
  method: "card" | "online";
  total: number;
  currency: string;
  onComplete: () => void;
  completing: boolean;
}) {
  const Icon = method === "card" ? CreditCard : Landmark;
  return (
    <PosModalShell
      open={open}
      onClose={onClose}
      title={method === "card" ? "Card Payment" : "Online Payment"}
      footer={
        <>
          <button onClick={onClose} style={btnCancel}>Cancel</button>
          <button onClick={onComplete} disabled={completing} style={{ ...btnPrimary, opacity: completing ? 0.6 : 1 }}>
            {completing ? "Completing…" : "Complete Sale"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5 p-[17px]">
        <div className="flex items-baseline gap-2.5 rounded-[13px] p-[14px]" style={{ background: "var(--app-success-bg)", border: "1px solid var(--app-success-border)" }}>
          <span className="text-[12.5px] font-bold" style={{ color: "var(--app-primary-hover, #0E8442)" }}>Total due</span>
          <span className="ms-auto text-[24px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.6px" }}>{formatCurrency(total, currency)}</span>
        </div>
        <div className="rounded-[13px] p-[22px] text-center" style={{ border: "1px solid var(--app-border)" }}>
          <Icon className="mx-auto h-[34px] w-[34px]" style={{ color: "var(--app-text-disabled)" }} aria-hidden />
          <div className="mt-[11px] text-[14px] font-extrabold" style={{ color: "var(--app-text)" }}>Confirm payment manually</div>
          <div className="mt-1 text-[12px]" style={{ color: "var(--app-text-faintest)" }}>Mark this sale as paid once you&apos;ve taken payment on your own {method === "card" ? "card machine" : "payment link"}.</div>
          <div className="mt-[11px] inline-block rounded-full px-[10px] py-[3px] text-[11px] font-bold" style={{ background: "var(--app-warning-bg)", color: "var(--app-warning-text)" }}>
            {method === "card" ? "No terminal connected — record manually" : "No gateway connected — record manually"}
          </div>
        </div>
      </div>
    </PosModalShell>
  );
}

export function CreditPaymentModal({
  open,
  onClose,
  customer,
  total,
  currency,
  onComplete,
  completing,
  onChooseCustomer,
}: {
  open: boolean;
  onClose: () => void;
  customer: PosCustomer | null;
  total: number;
  currency: string;
  onComplete: () => void;
  completing: boolean;
  onChooseCustomer: () => void;
}) {
  const projected = (customer?.creditBalance ?? 0) + total;
  return (
    <PosModalShell
      open={open}
      onClose={onClose}
      title="Credit Sale"
      footer={
        <>
          <button onClick={onClose} style={btnCancel}>Cancel</button>
          <button onClick={onComplete} disabled={!customer || completing} style={{ ...btnPrimary, opacity: !customer || completing ? 0.6 : 1 }}>
            {completing ? "Completing…" : "Complete Sale on Credit"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 p-[17px]">
        {!customer ? (
          <div className="rounded-[13px] p-5 text-center" style={{ background: "#FEF3F2", border: "1px dashed #FDD9D6" }}>
            <div className="text-[13.5px] font-extrabold" style={{ color: "var(--app-danger-strong)" }}>Select a customer to use Credit.</div>
            <div className="mt-1.5 text-[12px]" style={{ color: "var(--app-warning-text)" }}>Credit sales must be attached to a customer ledger.</div>
            <button onClick={onChooseCustomer} className="mt-[13px] rounded-[11px] px-[18px] py-[11px] text-[12.5px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>Choose customer</button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-[11px] rounded-[13px] p-[13px]" style={{ border: "1px solid var(--app-border)" }}>
              <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full text-[12px] font-extrabold" style={{ background: "var(--app-surface-2)", color: "var(--app-text-muted)" }}>
                {customer.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
              </span>
              <span className="flex-1">
                <span className="block text-[13px] font-bold" style={{ color: "var(--app-text)" }}>{customer.name}</span>
                <span className="block text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>{customer.phone}</span>
              </span>
            </div>
            <div className="rounded-[12px] p-[13px]" style={{ background: "var(--app-surface-2)", border: "1px solid var(--app-border)" }}>
              <div className="flex justify-between py-1 text-[12.5px]"><span style={{ color: "var(--app-text-faint)" }}>Current credit balance</span><span className="font-bold" style={{ color: "var(--app-text-muted)" }}>{formatCurrency(customer.creditBalance, currency)}</span></div>
              <div className="flex justify-between py-1 text-[12.5px]"><span style={{ color: "var(--app-text-faint)" }}>This sale on credit</span><span className="font-bold" style={{ color: "var(--app-text-muted)" }}>{formatCurrency(total, currency)}</span></div>
              <div className="mt-1.5 flex justify-between border-t border-dashed pt-1.5" style={{ borderColor: "var(--app-border-strong)" }}><span className="text-[13px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>New projected balance</span><span className="text-[16px] font-extrabold" style={{ color: "var(--app-danger-strong)" }}>{formatCurrency(projected, currency)}</span></div>
            </div>
            <div className="rounded-[11px] p-[11px_13px] text-[12px] leading-relaxed" style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", color: "#93370D" }}>
              Confirm before finalizing — this adds to the customer&apos;s credit rather than collecting payment now.
            </div>
          </>
        )}
      </div>
    </PosModalShell>
  );
}

export function HoldModal({
  open,
  onClose,
  itemCount,
  onHold,
  holding,
}: {
  open: boolean;
  onClose: () => void;
  itemCount: string;
  onHold: (reference: string, note: string) => void;
  holding: boolean;
}) {
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  return (
    <PosModalShell
      open={open}
      onClose={onClose}
      title="Hold Sale"
      footer={
        <>
          <button onClick={onClose} style={btnCancel}>Cancel</button>
          <button onClick={() => onHold(reference, note)} disabled={holding} style={{ ...btnPrimary, opacity: holding ? 0.6 : 1 }}>{holding ? "Holding…" : "Hold Sale"}</button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5 p-[17px]">
        <p className="m-0 text-[13px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>Park this sale so the counter is free. Nothing is lost — {itemCount} and any customer stay attached.</p>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>REFERENCE (OPTIONAL)</span>
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. Table 4, blue shirt" className="w-full rounded-[11px] p-3 text-[13.5px]" style={{ border: "1px solid var(--app-border)" }} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>NOTE (OPTIONAL)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything the next cashier should know" className="w-full rounded-[11px] p-3 text-[13.5px]" style={{ border: "1px solid var(--app-border)" }} />
        </label>
      </div>
    </PosModalShell>
  );
}

export function ClearSaleModal({ open, onClose, onClear }: { open: boolean; onClose: () => void; onClear: () => void }) {
  return (
    <PosModalShell
      open={open}
      onClose={onClose}
      title="Clear Sale"
      footer={
        <>
          <button onClick={onClose} style={btnCancel}>Cancel</button>
          <button onClick={() => { onClear(); onClose(); }} style={btnDanger}>Clear Sale</button>
        </>
      }
    >
      <p className="m-0 p-[17px] text-[13px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>All current items will be removed. This cannot be undone.</p>
    </PosModalShell>
  );
}

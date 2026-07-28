"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Printer } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import type { Order } from "@/lib/orders";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";
import { fakeQrCells } from "@/lib/fake-qr";

const TAX_RATE = 0.085;

function FakeQr({ seed }: { seed: string }) {
  const cells = fakeQrCells(seed);
  return (
    <div className="grid h-16 w-16 grid-cols-7 gap-px rounded bg-fg p-1.5">
      {cells.map((on, i) => (
        <span key={i} className={on ? "bg-bg" : "bg-fg"} />
      ))}
    </div>
  );
}

function InvoiceLines({ order, currency }: { order: Order; currency: string }) {
  const subtotal = order.total;
  const tax = subtotal * TAX_RATE;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-start text-xs uppercase tracking-wide text-fg-faint">
          <th className="py-1.5 text-start">Item</th>
          <th className="py-1.5 text-end">Qty</th>
          <th className="py-1.5 text-end">Price</th>
        </tr>
      </thead>
      <tbody>
        {order.items.map((item) => (
          <tr key={item.productId} className="border-b border-border/60">
            <td className="py-1.5 text-fg">{item.name}</td>
            <td className="py-1.5 text-end text-fg-muted">{item.qty}</td>
            <td className="py-1.5 text-end text-fg">{formatCurrency(item.price * item.qty, currency)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={2} className="pt-2 text-fg-muted">
            Subtotal
          </td>
          <td className="pt-2 text-end text-fg">{formatCurrency(subtotal, currency)}</td>
        </tr>
        <tr>
          <td colSpan={2} className="text-fg-muted">
            Tax (8.5%)
          </td>
          <td className="text-end text-fg">{formatCurrency(tax, currency)}</td>
        </tr>
        <tr>
          <td colSpan={2} className="pt-1.5 font-semibold text-fg">
            Total
          </td>
          <td className="pt-1.5 text-end font-display text-base font-bold text-fg">
            {formatCurrency(subtotal + tax, currency)}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

function A4Invoice({ order, currency }: { order: Order; currency: string }) {
  return (
    <div className="mx-auto w-full max-w-md overflow-hidden rounded-[var(--radius-noxtill)] border border-border bg-surface">
      <div className="bg-primary px-6 py-5 text-primary-foreground">
        <p className="font-display text-lg font-bold">Sunset Hair Studio</p>
        <p className="text-xs opacity-80">Invoice #{order.orderNo}</p>
      </div>
      <div className="p-6">
        <div className="mb-4 flex items-center justify-between text-sm">
          <span className="text-fg-muted">Billed to</span>
          <span className="font-medium text-fg">{order.customerName}</span>
        </div>
        <InvoiceLines order={order} currency={currency} />
        <div className="mt-5 flex items-center justify-between">
          <FakeQr seed={order.id} />
          <p className="text-xs text-fg-faint">Scan to view online</p>
        </div>
      </div>
    </div>
  );
}

function ThermalReceipt({ order, currency }: { order: Order; currency: string }) {
  const subtotal = order.total;
  const tax = subtotal * TAX_RATE;
  return (
    <div className="mx-auto w-[280px] rounded-sm border border-border bg-surface p-3 font-mono text-xs leading-relaxed text-fg">
      <p className="text-center font-bold">SUNSET HAIR STUDIO</p>
      <p className="text-center text-fg-faint">Order #{order.orderNo}</p>
      <div className="my-1.5 border-t border-dashed border-border" />
      {order.items.map((item) => (
        <div key={item.productId} className="flex justify-between gap-2">
          <span className="truncate">
            {item.qty}x {item.name}
          </span>
          <span className="shrink-0 tabular-nums">{formatCurrency(item.price * item.qty, currency)}</span>
        </div>
      ))}
      <div className="my-1.5 border-t border-dashed border-border" />
      <div className="flex justify-between">
        <span>Subtotal</span>
        <span className="tabular-nums">{formatCurrency(subtotal, currency)}</span>
      </div>
      <div className="flex justify-between">
        <span>Tax</span>
        <span className="tabular-nums">{formatCurrency(tax, currency)}</span>
      </div>
      <div className="my-1.5 border-t border-dashed border-border" />
      <div className="flex justify-between font-bold">
        <span>TOTAL</span>
        <span className="tabular-nums">{formatCurrency(subtotal + tax, currency)}</span>
      </div>
      <div className="mt-3 flex justify-center">
        <FakeQr seed={order.id} />
      </div>
      <p className="mt-2 text-center text-fg-faint">Thank you!</p>
    </div>
  );
}

export function InvoicePreviewDialog({
  order,
  currency,
  onClose,
}: {
  order: Order | null;
  currency: string;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<"a4" | "thermal">("a4");

  if (!order || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[#1c231e]/45 backdrop-blur-[2px]" />
      <div className="animate-stagger-in relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-[var(--radius-noxtill)] border border-border bg-surface shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <Tabs
            items={[
              { key: "a4", label: "A4" },
              { key: "thermal", label: "80mm thermal" },
            ]}
            value={format}
            onChange={(k) => setFormat(k as "a4" | "thermal")}
            className="w-64"
          />
          <button
            onClick={onClose}
            aria-label="Close"
            className="ms-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-fg-faint hover:bg-surface-2"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto bg-surface-2/40 p-6">
          {format === "a4" ? <A4Invoice order={order} currency={currency} /> : <ThermalReceipt order={order} currency={currency} />}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="outline" onClick={() => toast.info("PDF generation wires up in INT-003.")}>
            <Printer className="h-4 w-4" aria-hidden />
            Print / Download
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Trash2 } from "lucide-react";
import { SlideDrawer } from "@/components/dashboard/slide-drawer";
import { CustomerDrawer, type PosCustomer } from "@/components/pos/customer-drawer";
import { fetchProducts } from "@/lib/products-api";
import { fetchBusinessProfile } from "@/lib/businesses-api";
import { createOrder } from "@/lib/orders-api";
import { createDraftOrder } from "@/lib/draft-orders-api";
import { useSession } from "@/lib/session";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";

const ORDER_TYPES: { value: string; label: string }[] = [
  { value: "counter", label: "Counter" },
  { value: "online", label: "Online" },
  { value: "dine_in", label: "Dine-in" },
  { value: "takeaway", label: "Takeaway" },
  { value: "delivery", label: "Delivery" },
];
const PAYMENT_OPTIONS: { value: "unpaid" | "cash" | "card" | "online" | "credit"; label: string }[] = [
  { value: "unpaid", label: "Unpaid" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "online", label: "Online" },
  { value: "credit", label: "Credit" },
];

const fieldLabel: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", marginBottom: 5 };
const fieldStyle: React.CSSProperties = { width: "100%", border: "1px solid var(--app-border)", borderRadius: 11, padding: 12, fontSize: 13, fontWeight: 700, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 48 };

interface DraftLine {
  productId: string;
  name: string;
  price: number;
  qty: number;
}

/** "New Order" drawer, pixel-matched to the design's `dNew` state — a real product picker (not
 * the design's single hardcoded line item) feeding the real `POST /orders` (commit) or
 * `POST /orders/draft` (park) endpoints. */
export function OrderFormDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const session = useSession();
  const queryClient = useQueryClient();
  const [customer, setCustomer] = useState<PosCustomer | null>(null);
  const [customerDrawerOpen, setCustomerDrawerOpen] = useState(false);
  const [orderType, setOrderType] = useState("counter");
  const [productQuery, setProductQuery] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [discount, setDiscount] = useState("0");
  const [payment, setPayment] = useState<"unpaid" | "cash" | "card" | "online" | "credit">("unpaid");
  const [notes, setNotes] = useState("");

  const { data: products = [] } = useQuery({ queryKey: ["products", "active"], queryFn: () => fetchProducts({ active: true }) });
  const { data: businessProfile } = useQuery({ queryKey: ["business-profile"], queryFn: fetchBusinessProfile, staleTime: 5 * 60_000 });

  const matches = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return [];
    return products.filter((p) => p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q)).slice(0, 6);
  }, [products, productQuery]);

  function addLine(product: { id: string; name: string; price: number }) {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) return prev.map((l) => (l.productId === product.id ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { productId: product.id, name: product.name, price: product.price, qty: 1 }];
    });
    setProductQuery("");
  }
  function updateQty(productId: string, qty: number) {
    setLines((prev) => (qty <= 0 ? prev.filter((l) => l.productId !== productId) : prev.map((l) => (l.productId === productId ? { ...l, qty } : l))));
  }

  const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  const taxRate = businessProfile?.taxRate ?? 0;

  function reset() {
    setCustomer(null);
    setOrderType("counter");
    setProductQuery("");
    setLines([]);
    setDiscount("0");
    setPayment("unpaid");
    setNotes("");
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createOrder({
        orderType: orderType as "counter" | "online" | "dine_in" | "takeaway" | "delivery",
        customerId: customer?.id,
        items: lines.map((l) => ({ productId: l.productId, qty: l.qty })),
        discount: Number(discount) || 0,
        paymentMethod: payment,
        notes: notes.trim() || undefined,
      }),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders-summary"] });
      toast.success(`Order ${order.orderNo} created.`);
      reset();
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't create this order — please try again."),
  });

  const draftMutation = useMutation({
    mutationFn: () =>
      createDraftOrder({
        orderType: orderType as "counter" | "online" | "dine_in" | "takeaway" | "delivery",
        customerId: customer?.id,
        items: lines.map((l) => ({ productId: l.productId, qty: l.qty })),
        discount: Number(discount) || 0,
        note: notes.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Saved as a draft — find it in Draft Orders.");
      reset();
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this draft — please try again."),
  });

  return (
    <SlideDrawer open={open} onClose={onClose} title="New Order">
      <div className="flex flex-col gap-[13px]">
        <label className="block">
          <span style={fieldLabel}>CUSTOMER</span>
          <button type="button" onClick={() => setCustomerDrawerOpen(true)} style={{ ...fieldStyle, textAlign: "left" }}>
            {customer?.name ?? "Walk-in customer"}
          </button>
        </label>

        <label className="block">
          <span style={fieldLabel}>ORDER TYPE</span>
          <select value={orderType} onChange={(e) => setOrderType(e.target.value)} style={fieldStyle}>
            {ORDER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>

        <div className="rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
          <div className="mb-2 text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>ITEMS</div>
          {lines.length > 0 && (
            <div className="mb-2 flex flex-col gap-2">
              {lines.map((l) => (
                <div key={l.productId} className="flex items-center gap-2.5">
                  <span className="flex-1 text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{l.name}</span>
                  <input
                    type="number"
                    min={0}
                    value={l.qty}
                    onChange={(e) => updateQty(l.productId, Number(e.target.value))}
                    aria-label={`Quantity for ${l.name}`}
                    className="w-[70px] rounded-[9px] p-2 text-center text-[13px] font-bold"
                    style={{ border: "1px solid var(--app-border)" }}
                  />
                  <span className="w-[76px] text-end text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(l.price * l.qty, session.business.currency)}</span>
                  <button type="button" onClick={() => updateQty(l.productId, 0)} aria-label={`Remove ${l.name}`} style={{ color: "var(--app-border-strong)" }}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-[10px] top-[11px] h-3.5 w-3.5" style={{ color: "var(--app-text-disabled)" }} aria-hidden />
            <input
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              placeholder="Search products to add…"
              aria-label="Search products"
              className="w-full rounded-[10px] py-2.5 ps-8 pe-2 text-[12.5px]"
              style={{ border: "1px dashed var(--app-border-strong)" }}
            />
            {matches.length > 0 && (
              <div className="absolute inset-x-0 top-[38px] z-10 overflow-hidden rounded-[10px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", boxShadow: "0 14px 34px rgba(16,24,40,.16)" }}>
                {matches.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addLine({ id: p.id, name: p.name, price: p.price })}
                    className="flex w-full items-center justify-between px-3 py-2 text-start text-[12.5px] font-semibold"
                    style={{ color: "var(--app-text-muted)" }}
                  >
                    {p.name}
                    <span style={{ color: "var(--app-text-disabled)" }}>{formatCurrency(p.price, session.business.currency)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <label className="block">
            <span style={fieldLabel}>DISCOUNT</span>
            <input type="number" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} style={{ ...fieldStyle, minHeight: 46 }} />
          </label>
          <label className="block">
            <span style={fieldLabel}>TAX</span>
            <input value={taxRate > 0 ? `${taxRate}% configured` : "Not configured"} readOnly style={{ ...fieldStyle, minHeight: 46, color: "var(--app-text-disabled)", background: "var(--app-surface-2)" }} />
          </label>
        </div>

        <label className="block">
          <span style={fieldLabel}>PAYMENT</span>
          <select value={payment} onChange={(e) => setPayment(e.target.value as typeof payment)} style={fieldStyle}>
            {PAYMENT_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span style={fieldLabel}>NOTES</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the team should know" style={{ ...fieldStyle, minHeight: 46, fontWeight: 500 }} />
        </label>

        <div className="flex items-center justify-between rounded-[12px] p-3" style={{ background: "var(--app-surface-2)" }}>
          <span className="text-[12.5px] font-bold" style={{ color: "var(--app-text-faint)" }}>Subtotal</span>
          <span className="text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(subtotal, session.business.currency)}</span>
        </div>

        <div className="flex gap-2.5 border-t pt-3.5" style={{ borderColor: "var(--app-surface-2)" }}>
          <button type="button" onClick={onClose} className="rounded-[11px] px-4 py-3 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Cancel</button>
          <button
            type="button"
            onClick={() => draftMutation.mutate()}
            disabled={lines.length === 0 || draftMutation.isPending}
            className="rounded-[11px] px-4 py-3 text-[12.5px] font-bold disabled:opacity-50"
            style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}
          >
            {draftMutation.isPending ? "Saving…" : "Save Draft"}
          </button>
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={lines.length === 0 || createMutation.isPending}
            className="flex-1 rounded-[11px] px-4 py-3 text-[13px] font-extrabold text-white disabled:opacity-50"
            style={{ background: "var(--app-primary)" }}
          >
            {createMutation.isPending ? "Creating…" : "Create Order"}
          </button>
        </div>
      </div>

      <CustomerDrawer open={customerDrawerOpen} onClose={() => setCustomerDrawerOpen(false)} currency={session.business.currency} onPick={setCustomer} />
    </SlideDrawer>
  );
}

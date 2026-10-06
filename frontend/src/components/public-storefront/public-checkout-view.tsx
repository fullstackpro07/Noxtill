"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import {
  createPublicOrder,
  fetchPublicOrderingMenu,
  type PublicOrderInput,
  type PublicOrderResult,
} from "@/lib/public-ordering-api";

function formatMoney(amount: number, currency: string, locale: string) {
  try {
    return new Intl.NumberFormat(locale || undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function PublicCheckoutView({ businessSlug }: { businessSlug: string }) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [fulfillment, setFulfillment] = useState<"takeaway" | "delivery">("takeaway");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryZoneId, setDeliveryZoneId] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [submittedOrder, setSubmittedOrder] = useState<PublicOrderResult | null>(null);
  const checkoutRequestRef = useRef<{ fingerprint: string; key: string } | null>(null);

  const menuQuery = useQuery({
    queryKey: ["public-ordering-menu", businessSlug],
    queryFn: () => fetchPublicOrderingMenu(businessSlug),
    retry: 1,
  });
  const menu = menuQuery.data;
  const selectedItems = useMemo(
    () => menu?.products.filter((product) => (quantities[product.id] ?? 0) > 0) ?? [],
    [menu?.products, quantities],
  );
  const itemSubtotal = selectedItems.reduce(
    (sum, product) => sum + product.sellingPrice * quantities[product.id],
    0,
  );

  const orderMutation = useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: PublicOrderInput; idempotencyKey: string }) =>
      createPublicOrder(businessSlug, input, idempotencyKey),
    onSuccess: setSubmittedOrder,
  });

  function updateQuantity(productId: string, delta: number) {
    setQuantities((current) => {
      const next = Math.max(0, (current[productId] ?? 0) + delta);
      if (next === 0) {
        const nextQuantities = { ...current };
        delete nextQuantities[productId];
        return nextQuantities;
      }
      return { ...current, [productId]: next };
    });
  }

  function submitOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!menu || selectedItems.length === 0) return;
    const input: PublicOrderInput = {
      items: selectedItems.map((product) => ({
        productId: product.id,
        qty: quantities[product.id],
      })),
      orderType: fulfillment,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      ...(fulfillment === "delivery"
        ? {
            deliveryAddress: deliveryAddress.trim(),
            ...(deliveryZoneId ? { deliveryZoneId } : {}),
            ...(deliveryNote.trim() ? { deliveryNote: deliveryNote.trim() } : {}),
          }
        : {}),
    };
    const fingerprint = JSON.stringify(input);
    if (checkoutRequestRef.current?.fingerprint !== fingerprint) {
      checkoutRequestRef.current = { fingerprint, key: crypto.randomUUID() };
    }
    orderMutation.mutate({ input, idempotencyKey: checkoutRequestRef.current.key });
  }

  if (menuQuery.isPending) {
    return <main className="mx-auto max-w-6xl p-6 text-fg-muted">Loading store…</main>;
  }
  if (menuQuery.isError || !menu) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <section className="rounded-2xl border border-border bg-surface p-8">
          <h1 className="text-xl font-bold text-fg">Store unavailable</h1>
          <p className="mt-2 text-sm text-fg-muted">This store could not be loaded. Check the store link and try again.</p>
        </section>
      </main>
    );
  }

  if (submittedOrder) {
    return (
      <main className="mx-auto max-w-2xl p-5 md:p-8">
        <section className="rounded-2xl border border-border bg-surface p-7 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
            <ShoppingBag className="h-6 w-6" aria-hidden />
          </div>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.15em] text-primary">Order request received</p>
          <h1 className="mt-2 text-2xl font-bold text-fg">{menu.business.name}</h1>
          <p className="mt-3 text-sm text-fg-muted">Order #{submittedOrder.orderNo} is pending business confirmation.</p>
          <p className="mt-2 text-xl font-bold text-fg">{formatMoney(submittedOrder.total, submittedOrder.currency, menu.business.locale)}</p>
          <p className="mt-4 rounded-xl bg-surface-muted p-3 text-sm text-fg-muted">
            No online payment was collected. The business will confirm the payment arrangement with you.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-6 p-4 md:p-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section>
        <header className="mb-5 rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Order online</p>
          <h1 className="mt-2 text-2xl font-bold text-fg md:text-3xl">{menu.business.name}</h1>
          <p className="mt-2 text-sm text-fg-muted">Choose available items and send an order request to the business.</p>
        </header>

        {menu.products.length === 0 ? (
          <section className="rounded-2xl border border-border bg-surface p-8 text-center">
            <h2 className="font-semibold text-fg">No items are listed right now</h2>
            <p className="mt-2 text-sm text-fg-muted">Please check back later.</p>
          </section>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {menu.products.map((product) => {
              const quantity = quantities[product.id] ?? 0;
              return (
                <article key={product.id} className="flex min-h-36 flex-col justify-between rounded-2xl border border-border bg-surface p-4 shadow-sm">
                  <div>
                    <p className="text-xs font-medium text-fg-faint">{product.category ?? (product.kind === "service" ? "Service" : "Product")}</p>
                    <h2 className="mt-1 font-semibold text-fg">{product.name}</h2>
                    <p className="mt-2 text-base font-bold text-fg">{formatMoney(product.sellingPrice, menu.business.currency, menu.business.locale)}</p>
                  </div>
                  {product.available ? (
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-xs text-success">Available</span>
                      <div className="flex items-center gap-2">
                        {quantity > 0 && <button type="button" onClick={() => updateQuantity(product.id, -1)} aria-label={`Remove one ${product.name}`} className="rounded-lg border border-border p-2 text-fg"><Minus className="h-4 w-4" aria-hidden /></button>}
                        {quantity > 0 && <span className="min-w-5 text-center text-sm font-semibold text-fg">{quantity}</span>}
                        <button type="button" onClick={() => updateQuantity(product.id, 1)} aria-label={`Add one ${product.name}`} className="rounded-lg bg-primary p-2 text-white"><Plus className="h-4 w-4" aria-hidden /></button>
                      </div>
                    </div>
                  ) : <p className="mt-4 text-xs font-medium text-fg-muted">Currently unavailable</p>}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <aside className="h-fit rounded-2xl border border-border bg-surface p-5 shadow-sm lg:sticky lg:top-5">
        <h2 className="text-lg font-bold text-fg">Your order</h2>
        {selectedItems.length === 0 ? (
          <p className="mt-3 rounded-xl bg-surface-muted p-4 text-sm text-fg-muted">Your cart is empty. Add an available item to continue.</p>
        ) : (
          <>
            <ul className="mt-3 divide-y divide-border">
              {selectedItems.map((product) => (
                <li key={product.id} className="flex justify-between gap-3 py-3 text-sm">
                  <span className="text-fg">{quantities[product.id]} × {product.name}</span>
                  <span className="shrink-0 font-medium text-fg">{formatMoney(product.sellingPrice * quantities[product.id], menu.business.currency, menu.business.locale)}</span>
                </li>
              ))}
            </ul>
            <p className="flex justify-between border-t border-border pt-3 text-sm font-semibold text-fg"><span>Items subtotal</span><span>{formatMoney(itemSubtotal, menu.business.currency, menu.business.locale)}</span></p>
            <p className="mt-2 text-xs text-fg-muted">Final tax and delivery charges are recalculated by the server when you submit.</p>
          </>
        )}

        <form onSubmit={submitOrder} className="mt-5 grid gap-3">
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-semibold text-fg">Fulfillment</legend>
            <label className="flex items-center gap-2 text-sm text-fg"><input type="radio" name="fulfillment" checked={fulfillment === "takeaway"} onChange={() => setFulfillment("takeaway")} />Pickup</label>
            {menu.checkout.deliveryAvailable && <label className="flex items-center gap-2 text-sm text-fg"><input type="radio" name="fulfillment" checked={fulfillment === "delivery"} onChange={() => setFulfillment("delivery")} />Delivery</label>}
          </fieldset>
          {fulfillment === "delivery" && (
            <>
              <label className="grid gap-1 text-xs font-medium text-fg-muted">Delivery address
                <textarea required maxLength={1000} value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg" />
              </label>
              {menu.deliveryZones.length > 0 && <label className="grid gap-1 text-xs font-medium text-fg-muted">Delivery zone{menu.checkout.deliveryRequiresZone ? " (required)" : ""}
                <select required={menu.checkout.deliveryRequiresZone} value={deliveryZoneId} onChange={(event) => setDeliveryZoneId(event.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg"><option value="">{menu.checkout.deliveryRequiresZone ? "Choose a zone" : "No zone selected"}</option>{menu.deliveryZones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}{zone.fee?.flatAmount !== null && zone.fee?.flatAmount !== undefined ? ` · ${formatMoney(zone.fee.flatAmount, menu.business.currency, menu.business.locale)}` : ""}</option>)}</select>
              </label>}
              <label className="grid gap-1 text-xs font-medium text-fg-muted">Delivery note (optional)
                <input maxLength={500} value={deliveryNote} onChange={(event) => setDeliveryNote(event.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg" />
              </label>
            </>
          )}
          <label className="grid gap-1 text-xs font-medium text-fg-muted">Your name
            <input required maxLength={191} value={customerName} onChange={(event) => setCustomerName(event.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg" />
          </label>
          <label className="grid gap-1 text-xs font-medium text-fg-muted">Phone
            <input required type="tel" maxLength={50} value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg" />
          </label>
          <div className="rounded-xl bg-surface-muted p-3 text-xs leading-5 text-fg-muted">
            Online payment is not configured. This submits an unpaid order request; the business will confirm payment with you.
          </div>
          {orderMutation.isError && <p role="alert" className="text-sm text-danger">{orderMutation.error instanceof Error ? orderMutation.error.message : "Your order could not be submitted. Please try again."}</p>}
          <button type="submit" disabled={selectedItems.length === 0 || orderMutation.isPending || (fulfillment === "delivery" && menu.checkout.deliveryRequiresZone && !deliveryZoneId)} className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {orderMutation.isPending ? "Submitting…" : "Submit unpaid order request"}
          </button>
        </form>
      </aside>
    </main>
  );
}

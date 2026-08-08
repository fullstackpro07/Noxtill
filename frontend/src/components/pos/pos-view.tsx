"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Plus, Minus, Trash2, Banknote, CreditCard, Wallet, HandCoins, Barcode, ShoppingCart, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/shared/skeleton";
import { InlineError } from "@/components/shared/error-states";
import { fetchProducts } from "@/lib/products-api";
import { createSale, type CreateSaleInput } from "@/lib/orders-api";
import { searchCustomers, fetchDebtors } from "@/lib/customers-api";
import { ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const CUSTOMER_SEARCH_DEBOUNCE_MS = 300;

interface CustomerMatch {
  id: string;
  name: string;
  phone: string;
  creditBalance: number;
}

interface CartLine {
  productId: string;
  name: string;
  price: number;
  qty: number;
}

type PaymentMethod = "cash" | "card" | "wallet" | "credit";

const PAYMENT_METHODS: { key: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { key: "cash", label: "Cash", icon: Banknote },
  { key: "card", label: "Card", icon: CreditCard },
  { key: "wallet", label: "Wallet", icon: Wallet },
  { key: "credit", label: "Credit", icon: HandCoins },
];

function CartPanel({
  cart,
  onIncrement,
  onDecrement,
  onRemove,
  currency,
  customerQuery,
  onCustomerQueryChange,
  customer,
  paymentMethod,
  onPaymentMethodChange,
  onConfirm,
  confirming,
  total,
}: {
  cart: CartLine[];
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onRemove: (id: string) => void;
  currency: string;
  customerQuery: string;
  onCustomerQueryChange: (v: string) => void;
  customer: CustomerMatch | undefined;
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (m: PaymentMethod) => void;
  onConfirm: () => void;
  confirming: boolean;
  total: number;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-4">
        <Input
          value={customerQuery}
          onChange={(e) => onCustomerQueryChange(e.target.value)}
          placeholder="Customer name or phone (optional)"
          leadingSlot={<Search className="h-4 w-4" aria-hidden />}
        />
        {customerQuery.trim() && (
          <p className="mt-1.5 text-xs text-fg-muted">
            {customer ? (
              <>
                {customer.name} ·{" "}
                <span className={customer.creditBalance > 0 ? "font-medium text-destructive" : "text-whatsapp"}>
                  {customer.creditBalance > 0 ? `owes ${formatCurrency(customer.creditBalance, currency)}` : "no balance"}
                </span>
              </>
            ) : (
              "No match — sale will record as a new/walk-in customer."
            )}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {cart.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <ShoppingCart className="h-6 w-6 text-fg-faint" aria-hidden />
            <p className="text-sm text-fg-faint">Tap a tile to add it to the sale.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {cart.map((line) => (
              <div key={line.productId} className="flex items-center gap-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{line.name}</p>
                  <p className="text-xs text-fg-faint">{formatCurrency(line.price, currency)} each</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => onDecrement(line.productId)}
                    aria-label="Decrease quantity"
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-border-strong text-fg-muted hover:bg-surface-2"
                  >
                    <Minus className="h-3 w-3" aria-hidden />
                  </button>
                  <span className="w-5 text-center text-sm tabular-nums text-fg">{line.qty}</span>
                  <button
                    onClick={() => onIncrement(line.productId)}
                    aria-label="Increase quantity"
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-border-strong text-fg-muted hover:bg-surface-2"
                  >
                    <Plus className="h-3 w-3" aria-hidden />
                  </button>
                  <button
                    onClick={() => onRemove(line.productId)}
                    aria-label={`Remove ${line.name}`}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-fg-faint hover:bg-destructive/8 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border p-4">
        <div className="mb-3 grid grid-cols-4 gap-1.5">
          {PAYMENT_METHODS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => onPaymentMethodChange(key)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-[var(--radius-sm)] border px-2 py-2.5 text-xs font-medium transition-colors",
                paymentMethod === key ? "border-primary bg-primary/8 text-primary" : "border-border text-fg-muted hover:bg-surface-2",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>

        {paymentMethod === "credit" && customer && customer.creditBalance > 0 && (
          <p className="mb-3 rounded-[var(--radius-sm)] bg-destructive/6 px-3 py-2 text-xs text-destructive">
            This will add to an existing balance of {formatCurrency(customer.creditBalance, currency)}.
          </p>
        )}

        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-fg-muted">Total</span>
          <span className="font-display text-xl font-bold text-fg">{formatCurrency(total, currency)}</span>
        </div>

        <Button className="w-full" size="lg" disabled={cart.length === 0 || confirming} onClick={onConfirm}>
          {confirming ? "Recording…" : "Confirm sale"}
        </Button>
      </div>
    </div>
  );
}

export function PosView({ currency }: { currency: string }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [barcodeQuery, setBarcodeQuery] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [debouncedCustomerQuery, setDebouncedCustomerQuery] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedCustomerQuery(customerQuery), CUSTOMER_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [customerQuery]);

  const {
    data: products = [],
    isPending: productsPending,
    isError: productsError,
  } = useQuery({ queryKey: ["products", "active"], queryFn: () => fetchProducts({ active: true }) });

  const { data: customerMatches = [] } = useQuery({
    queryKey: ["customer-search", debouncedCustomerQuery],
    queryFn: () => searchCustomers(debouncedCustomerQuery),
    enabled: debouncedCustomerQuery.trim().length > 0,
  });
  const { data: debtors = [] } = useQuery({
    queryKey: ["debtors"],
    queryFn: fetchDebtors,
    staleTime: 30_000,
  });

  const firstMatch = customerMatches[0];
  const customer: CustomerMatch | undefined = firstMatch
    ? {
        id: firstMatch.id,
        name: firstMatch.name,
        phone: firstMatch.phone,
        creditBalance: debtors.find((d) => d.customerId === firstMatch.id)?.balance ?? 0,
      }
    : undefined;

  const saleMutation = useMutation({
    mutationFn: (payload: CreateSaleInput) => createSale(payload),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["products", "active"] });
      toast.success(`Sale #${order.orderNo} recorded — ${formatCurrency(order.total, currency)} via ${paymentMethod}.`);
      setCart([]);
      setCustomerQuery("");
      setMobileCartOpen(false);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't complete this sale — please try again.");
    },
  });

  const total = cart.reduce((sum, l) => sum + l.price * l.qty, 0);

  function addToCart(productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === productId);
      if (existing) return prev.map((l) => (l.productId === productId ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { productId, name: product.name, price: product.price, qty: 1 }];
    });
  }

  function increment(id: string) {
    setCart((prev) => prev.map((l) => (l.productId === id ? { ...l, qty: l.qty + 1 } : l)));
  }

  function decrement(id: string) {
    setCart((prev) =>
      prev.flatMap((l) => (l.productId === id ? (l.qty > 1 ? [{ ...l, qty: l.qty - 1 }] : []) : [l])),
    );
  }

  function remove(id: string) {
    setCart((prev) => prev.filter((l) => l.productId !== id));
  }

  function handleBarcodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const bySku = products.find((p) => p.sku?.toLowerCase() === barcodeQuery.trim().toLowerCase());
    if (bySku) {
      addToCart(bySku.id);
      setBarcodeQuery("");
    } else {
      toast.error(`No product found for "${barcodeQuery}".`);
    }
  }

  function handleConfirm() {
    saleMutation.mutate({
      items: cart.map((l) => ({ productId: l.productId, qty: l.qty })),
      payment: { method: paymentMethod === "wallet" ? "online" : paymentMethod },
      ...(customer ? { customerId: customer.id } : customerQuery.trim() ? { customerPhone: customerQuery.trim() } : {}),
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-display text-2xl font-bold text-fg">Fast Sale</h1>
            <form onSubmit={handleBarcodeSubmit} className="w-56">
              <Input
                value={barcodeQuery}
                onChange={(e) => setBarcodeQuery(e.target.value)}
                placeholder="Scan or type SKU…"
                leadingSlot={<Barcode className="h-4 w-4" aria-hidden />}
              />
            </form>
          </div>

          {productsError ? (
            <InlineError message="Couldn't load products — check your connection and reload." />
          ) : (
          <div className="grid flex-1 grid-cols-2 content-start gap-2.5 overflow-y-auto pb-4 sm:grid-cols-3 lg:grid-cols-4">
            {productsPending
              ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
              : products.map((p) => (
              <button
                key={p.id}
                onClick={() => addToCart(p.id)}
                className="flex flex-col items-start rounded-[var(--radius-noxtill)] border border-border bg-surface p-3.5 text-start transition-colors hover:border-primary hover:bg-primary/4 active:scale-[0.98]"
              >
                <p className="line-clamp-2 text-sm font-medium text-fg">{p.name}</p>
                <p className="mt-auto pt-2 font-display text-sm font-bold text-primary">{formatCurrency(p.price, currency)}</p>
              </button>
            ))}
          </div>
          )}
        </div>

        <div className="hidden w-80 shrink-0 border-s border-border bg-surface lg:block">
          <CartPanel
            cart={cart}
            onIncrement={increment}
            onDecrement={decrement}
            onRemove={remove}
            currency={currency}
            customerQuery={customerQuery}
            onCustomerQueryChange={setCustomerQuery}
            customer={customer}
            paymentMethod={paymentMethod}
            onPaymentMethodChange={setPaymentMethod}
            onConfirm={handleConfirm}
            confirming={saleMutation.isPending}
            total={total}
          />
        </div>
      </div>

      {!mobileCartOpen && cart.length > 0 && (
        <button
          onClick={() => setMobileCartOpen(true)}
          className="fixed inset-x-4 bottom-4 z-40 flex items-center justify-between rounded-full bg-primary px-5 py-3.5 text-primary-foreground shadow-[var(--shadow-lg)] lg:hidden"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <ShoppingCart className="h-4 w-4" aria-hidden />
            {cart.reduce((n, l) => n + l.qty, 0)} items
          </span>
          <span className="font-display font-bold">{formatCurrency(total, currency)}</span>
        </button>
      )}

      {mobileCartOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button aria-label="Close cart" onClick={() => setMobileCartOpen(false)} className="absolute inset-0 bg-[#1c231e]/45" />
          <div className="animate-sheet-in absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-[var(--radius-noxtill)] border-t border-border bg-surface shadow-[var(--shadow-lg)]">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="font-display text-base font-semibold text-fg">Current sale</p>
              <button
                onClick={() => setMobileCartOpen(false)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-fg-faint hover:bg-surface-2"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <CartPanel
              cart={cart}
              onIncrement={increment}
              onDecrement={decrement}
              onRemove={remove}
              currency={currency}
              customerQuery={customerQuery}
              onCustomerQueryChange={setCustomerQuery}
              customer={customer}
              paymentMethod={paymentMethod}
              onPaymentMethodChange={setPaymentMethod}
              onConfirm={handleConfirm}
              confirming={saleMutation.isPending}
              total={total}
            />
          </div>
        </div>
      )}
    </div>
  );
}

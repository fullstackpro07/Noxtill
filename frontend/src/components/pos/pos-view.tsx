"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Plus, Minus, Trash2, MoreVertical, Package, Sparkles, ShoppingBag, PackageX, Wallet2 } from "lucide-react";
import { fetchProducts } from "@/lib/products-api";
import { fetchBusinessProfile } from "@/lib/businesses-api";
import { createSale, type CreateSaleInput } from "@/lib/orders-api";
import { holdSale } from "@/lib/held-sales-api";
import { useSession } from "@/lib/session";
import { fetchDebtors } from "@/lib/customers-api";
import { ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";
import type { Product } from "@/lib/products";
import { CustomerDrawer, type PosCustomer } from "./customer-drawer";
import { ScanModal } from "./scan-modal";
import { DiscountModal, CashPaymentModal, TerminalPaymentModal, CreditPaymentModal, HoldModal, ClearSaleModal } from "./pos-payment-modals";

interface CartLine {
  productId: string;
  name: string;
  price: number;
  qty: number;
}

type PaymentMethod = "cash" | "card" | "online" | "credit";
type ActiveModal = "discount" | "cash" | "card" | "online" | "credit" | "hold" | "clear" | "scan" | "customer" | null;

const PAYMENT_TILES: { key: PaymentMethod; label: string; icon: typeof Wallet2 }[] = [
  { key: "cash", label: "Cash", icon: Wallet2 },
  { key: "card", label: "Card", icon: ShoppingBag },
  { key: "online", label: "Online", icon: Package },
  { key: "credit", label: "Credit", icon: Sparkles },
];

/** Fast Sale — New Sale screen, pixel-matched to the design (search + category/type filters over
 * the real product catalog, product grid, sticky cart with real discount/tax preview and payment
 * flow). Coupon/voucher code entry from the old build is intentionally not shown here — the
 * design's cart only ever has one manual "Discount" affordance, backed by the real ad-hoc
 * `discount` field `createSale`/`holdSale` already accept; coupon/voucher management stays where
 * it's actually designed (Marketing), not fabricated into this screen to fill a slot. */
export function PosView({ currency }: { currency: string }) {
  const session = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [type, setType] = useState<"All" | "Products" | "Services">("All");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<PosCustomer | null>(null);
  const [discount, setDiscount] = useState(0);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("cash");
  // Header's "Barcode Scan" link always points at /sales?scan=1 so it works from any Fast Sale
  // screen — the initial value reads that param directly (no effect needed for this part), and a
  // separate effect below only handles the one-time URL cleanup.
  const [activeModal, setActiveModal] = useState<ActiveModal>(() => (searchParams.get("scan") === "1" ? "scan" : null));
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("scan") === "1") {
      router.replace("/sales");
    }
  }, [searchParams, router]);

  const { data: products = [], isPending: productsPending, isError: productsError } = useQuery({
    queryKey: ["products", "active"],
    queryFn: () => fetchProducts({ active: true }),
  });
  const { data: businessProfile } = useQuery({ queryKey: ["business-profile"], queryFn: fetchBusinessProfile, staleTime: 5 * 60_000 });
  const { data: debtors = [] } = useQuery({ queryKey: ["debtors"], queryFn: fetchDebtors, staleTime: 30_000 });

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category).filter((c): c is string => !!c));
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [products]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return products.filter((p) => {
      const okCat = cat === "All" || p.category === cat;
      const okType = type === "All" || (type === "Products" ? p.kind === "product" : p.kind === "service");
      const okQ = !query || p.name.toLowerCase().includes(query) || (p.sku ?? "").toLowerCase().includes(query) || String(p.price).includes(query);
      return okCat && okType && okQ;
    });
  }, [products, q, cat, type]);

  const cartMap = useMemo(() => new Map(cart.map((l) => [l.productId, l.qty])), [cart]);

  const saleMutation = useMutation({
    mutationFn: (payload: CreateSaleInput) => createSale(payload),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["products", "active"] });
      queryClient.invalidateQueries({ queryKey: ["today-business"] });
      toast.success(`Sale #${order.orderNo} recorded — ${formatCurrency(order.total, currency)} via ${selectedMethod}.`);
      resetSale();
      setActiveModal(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't complete this sale — please try again."),
  });

  const holdMutation = useMutation({
    mutationFn: (note: string) =>
      holdSale({
        items: cart.map((l) => ({ productId: l.productId, qty: l.qty })),
        discount: discount || undefined,
        ...(session.user.businessUserId ? { staffUserId: session.user.businessUserId } : {}),
        ...(customer ? { customerId: customer.id } : {}),
        ...(note ? { note } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["held-sales"] });
      toast.success("Sale held — find it in the Held Sales tab.");
      resetSale();
      setActiveModal(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't hold this sale — please try again."),
  });

  function resetSale() {
    setCart([]);
    setCustomer(null);
    setDiscount(0);
    setSelectedMethod("cash");
  }

  function addToCart(product: Product) {
    if (product.kind === "product" && (product.stockOnHand ?? 0) <= 0) return;
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) return prev.map((l) => (l.productId === product.id ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { productId: product.id, name: product.name, price: product.price, qty: 1 }];
    });
  }
  function increment(id: string) {
    setCart((prev) => prev.map((l) => (l.productId === id ? { ...l, qty: l.qty + 1 } : l)));
  }
  function decrement(id: string) {
    setCart((prev) => prev.flatMap((l) => (l.productId === id ? (l.qty > 1 ? [{ ...l, qty: l.qty - 1 }] : []) : [l])));
  }
  function remove(id: string) {
    setCart((prev) => prev.filter((l) => l.productId !== id));
  }

  const subtotal = cart.reduce((sum, l) => sum + l.price * l.qty, 0);
  const afterDiscount = Math.max(0, subtotal - discount);
  const taxRate = businessProfile?.taxRate ?? 0;
  const taxLabel = businessProfile?.taxLabel ?? "Tax";
  const taxPreview = afterDiscount * (taxRate / 100);
  const total = afterDiscount + taxPreview;
  const itemCount = cart.reduce((n, l) => n + l.qty, 0);
  const itemCountLabel = `${itemCount} item${itemCount === 1 ? "" : "s"}`;
  const canComplete = cart.length > 0 && !saleMutation.isPending;

  function buildSalePayload(method: PaymentMethod, amountReceived?: number): CreateSaleInput {
    return {
      items: cart.map((l) => ({ productId: l.productId, qty: l.qty })),
      payment: { method, ...(amountReceived !== undefined ? { amount: amountReceived } : {}) },
      discount: discount || undefined,
      ...(session.user.businessUserId ? { staffUserId: session.user.businessUserId } : {}),
      ...(customer ? { customerId: customer.id } : {}),
    };
  }

  function handleCompleteClick() {
    setActiveModal(selectedMethod);
  }

  return (
    <main className="grid min-w-0 items-start gap-4 px-[22px] pb-[22px] pt-4" style={{ gridTemplateColumns: "minmax(0,1fr) 372px" }}>
      <section className="flex min-w-0 flex-col gap-[13px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-[14px] top-[15px]" style={{ color: "var(--app-text-disabled)" }} width={18} height={18} aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products, SKU, barcode or service..."
            aria-label="Search products"
            className="w-full min-h-[50px] rounded-[13px] py-[14px] ps-[44px] pe-[96px] text-[14px] font-medium"
            style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)" }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {categories.map((c) => {
            const active = cat === c;
            return (
              <button
                key={c}
                onClick={() => setCat(c)}
                className="min-h-10 rounded-full px-4 py-2.5 text-[12.5px] font-bold"
                style={active ? { border: "1px solid var(--app-primary)", background: "var(--app-success-bg)", color: "var(--app-primary-hover, #0E8442)" } : { border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)" }}
              >
                {c}
              </button>
            );
          })}
          <div className="ms-auto flex gap-[3px] rounded-[10px] p-[3px]" style={{ background: "var(--app-surface-2)" }}>
            {(["All", "Products", "Services"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className="rounded-[8px] px-3.5 py-2 text-[12px] font-bold"
                style={type === t ? { background: "var(--app-surface)", color: "var(--app-primary-hover, #0E8442)" } : { background: "transparent", color: "var(--app-text-faint)" }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {productsError ? (
          <p className="py-10 text-center text-[13px]" style={{ color: "var(--app-danger-strong)" }}>Couldn&apos;t load products — check your connection and reload.</p>
        ) : !productsPending && filtered.length === 0 ? (
          <div className="rounded-[14px] p-[56px_20px] text-center" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[14px]" style={{ background: "var(--app-surface-2)" }}>
              <PackageX className="h-[23px] w-[23px]" style={{ color: "var(--app-text-disabled)" }} aria-hidden />
            </div>
            <div className="text-[14.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>Add your first product to start selling</div>
            <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Nothing matches this search or filter.</div>
            <div className="mt-[15px] flex flex-wrap justify-center gap-2.5">
              <a href="/products" className="min-h-11 rounded-[10px] px-[18px] py-[11px] text-[12.5px] font-bold text-white" style={{ background: "var(--app-primary)" }}>Add Product</a>
              <a href="/products/import" className="min-h-11 rounded-[10px] px-[18px] py-[11px] text-[12.5px] font-semibold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Import Catalog</a>
            </div>
          </div>
        ) : (
          <div className="grid gap-[13px]" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(168px,1fr))" }}>
            {productsPending
              ? Array.from({ length: 12 }).map((_, i) => <div key={i} className="h-[190px] animate-pulse rounded-[14px]" style={{ background: "var(--app-surface-2)" }} />)
              : filtered.map((p) => {
                  const qty = cartMap.get(p.id) ?? 0;
                  const out = p.kind === "product" && (p.stockOnHand ?? 0) <= 0;
                  const low = p.kind === "product" && !out && (p.stockOnHand ?? 0) <= (p.lowStockThreshold ?? 0);
                  const Icon = p.kind === "service" ? Sparkles : Package;
                  return (
                    <div
                      key={p.id}
                      className="relative flex flex-col gap-2.5 rounded-[14px] p-[11px]"
                      style={{ background: "var(--app-surface)", border: `1px solid ${out ? "var(--app-border)" : "var(--app-border)"}`, boxShadow: "0 1px 2px rgba(16,24,40,.04)", opacity: out ? 0.6 : 1 }}
                    >
                      <button
                        onClick={() => addToCart(p)}
                        disabled={out}
                        aria-label={`Add ${p.name} to cart`}
                        className="flex h-[86px] items-center justify-center rounded-[11px]"
                        style={{ background: "var(--app-page-bg, #F4F6F8)", cursor: out ? "not-allowed" : "pointer" }}
                      >
                        <Icon className="h-7 w-7" style={{ color: "var(--app-text-disabled)" }} strokeWidth={1.7} aria-hidden />
                      </button>
                      <div className="flex items-start gap-1.5">
                        <span className="flex-1 text-[12.5px] font-bold leading-[1.35]" style={{ color: "var(--app-text)" }}>{p.name}</span>
                        <button onClick={() => setOpenMenuId(openMenuId === p.id ? null : p.id)} aria-label="Product actions" style={{ color: "var(--app-text-disabled)" }}>
                          <MoreVertical className="h-[15px] w-[15px]" aria-hidden />
                        </button>
                      </div>
                      <div className="-mt-0.5 flex items-center gap-1.5">
                        <span className="text-[14px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.3px" }}>{formatCurrency(p.price, currency)}</span>
                        <span
                          className="ms-auto rounded-full px-[7px] py-0.5 text-[10px] font-bold"
                          style={out ? { color: "var(--app-danger-strong)", background: "#FEE4E2" } : low ? { color: "var(--app-warning-text)", background: "var(--app-warning-bg)" } : p.kind === "service" ? { color: "var(--app-text-faint)", background: "var(--app-surface-2)" } : { color: "var(--app-primary-hover, #0E8442)", background: "var(--app-success-bg)" }}
                        >
                          {p.kind === "service" ? "Service" : out ? "Out of Stock" : low ? "Low Stock" : `${p.stockOnHand} in stock`}
                        </span>
                      </div>
                      {qty > 0 ? (
                        <div className="flex items-center gap-2 rounded-[10px] p-[5px]" style={{ background: "var(--app-success-bg)", border: "1px solid var(--app-success-border)" }}>
                          <button onClick={() => decrement(p.id)} aria-label="Decrease" className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[16px] font-extrabold" style={{ border: "1px solid var(--app-success-border)", background: "var(--app-surface)", color: "var(--app-primary-hover, #0E8442)" }}>−</button>
                          <span className="flex-1 text-center text-[13.5px] font-extrabold" style={{ color: "var(--app-primary-hover, #0E8442)" }}>{qty}</span>
                          <button onClick={() => addToCart(p)} aria-label="Increase" className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[16px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>+</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addToCart(p)}
                          disabled={out}
                          className="min-h-10 rounded-[10px] p-2.5 text-[12px] font-bold"
                          style={{ border: "1px solid var(--app-border)", background: out ? "var(--app-surface-2)" : "var(--app-surface)", color: out ? "var(--app-text-disabled)" : "var(--app-text-muted)", cursor: out ? "not-allowed" : "pointer" }}
                        >
                          {out ? "Out of Stock" : "Add to Cart"}
                        </button>
                      )}
                      {openMenuId === p.id && (
                        <div className="absolute right-2.5 top-11 z-[15] w-[158px] rounded-[11px] p-[5px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", boxShadow: "0 14px 34px rgba(16,24,40,.16)" }}>
                          <button
                            onClick={() => {
                              addToCart(p);
                              setOpenMenuId(null);
                            }}
                            className="block w-full rounded-[8px] p-[9px_10px] text-start text-[12px] font-semibold"
                            style={{ color: "var(--app-text-muted)" }}
                          >
                            Add to Cart
                          </button>
                          <a href="/inventory" className="block w-full rounded-[8px] p-[9px_10px] text-start text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>View Stock</a>
                          <a href="/products" className="block w-full rounded-[8px] p-[9px_10px] text-start text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Edit Product</a>
                        </div>
                      )}
                    </div>
                  );
                })}
          </div>
        )}
      </section>

      <aside className="sticky top-[60px] flex flex-col overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
        <div className="flex items-center gap-2.5 p-[15px_16px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <ShoppingBag className="h-[18px] w-[18px]" style={{ color: "var(--app-primary)" }} aria-hidden />
          <h2 className="m-0 flex-1 text-[15.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Current Sale</h2>
          <span className="rounded-full px-[10px] py-[3px] text-[11.5px] font-bold" style={{ color: "var(--app-primary-hover, #0E8442)", background: "var(--app-success-bg)" }}>{itemCountLabel}</span>
        </div>

        <button
          onClick={() => setActiveModal("customer")}
          className="flex min-h-[52px] w-full items-center gap-2.5 p-[12px_16px] text-start"
          style={{ borderBottom: "1px solid var(--app-surface-2)" }}
        >
          <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <Search className="h-4 w-4" style={{ color: "var(--app-text-muted)" }} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{customer?.name ?? "Walk-in customer"}</span>
            <span className="mt-[1px] block text-[11px]" style={{ color: customer && customer.creditBalance > 0 ? "var(--app-danger-strong)" : "var(--app-text-disabled)" }}>
              {customer ? (customer.creditBalance > 0 ? `Owes ${formatCurrency(customer.creditBalance, currency)}` : customer.phone) : "Tap to attach a customer"}
            </span>
          </span>
        </button>

        <div className="min-h-24 flex-1 overflow-y-auto" style={{ maxHeight: 330 }}>
          {cart.length === 0 ? (
            <div className="p-[42px_20px] text-center">
              <div className="mx-auto mb-[11px] flex h-[46px] w-[46px] items-center justify-center rounded-[14px]" style={{ background: "var(--app-page-bg, #F4F6F8)" }}>
                <ShoppingBag className="h-[22px] w-[22px]" style={{ color: "var(--app-text-disabled)" }} aria-hidden />
              </div>
              <div className="text-[13.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>Your cart is empty</div>
              <div className="mt-1 text-[12px]" style={{ color: "var(--app-text-disabled)" }}>Tap a product to start a sale.</div>
            </div>
          ) : (
            cart.map((line) => (
              <div key={line.productId} className="flex items-center gap-2.5 p-[11px_16px]" style={{ borderBottom: "1px solid var(--app-page-bg, #F6F8FA)" }}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-bold leading-[1.35]" style={{ color: "var(--app-text)" }}>{line.name}</span>
                  <span className="mt-0.5 block text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{formatCurrency(line.price, currency)} each</span>
                </span>
                <span className="flex items-center gap-[5px]">
                  <button onClick={() => decrement(line.productId)} aria-label="Decrease quantity" className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] text-[15px] font-extrabold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}><Minus className="h-3.5 w-3.5" aria-hidden /></button>
                  <span className="min-w-[22px] text-center text-[13px] font-extrabold" style={{ color: "var(--app-text)" }}>{line.qty}</span>
                  <button onClick={() => increment(line.productId)} aria-label="Increase quantity" className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] text-[15px] font-extrabold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}><Plus className="h-3.5 w-3.5" aria-hidden /></button>
                </span>
                <span className="w-[78px] text-right text-[13px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(line.price * line.qty, currency)}</span>
                <button onClick={() => remove(line.productId)} aria-label={`Remove ${line.name}`} style={{ color: "var(--app-border-strong)" }}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="p-[14px_16px]" style={{ borderTop: "1px solid var(--app-surface-2)", background: "var(--app-page-bg, #FCFDFD)" }}>
          <div className="flex justify-between p-[4px_0] text-[12.5px]"><span style={{ color: "var(--app-text-faint)" }}>Subtotal</span><span className="font-bold" style={{ color: "var(--app-text-muted)" }}>{formatCurrency(subtotal, currency)}</span></div>
          <div className="flex items-center justify-between p-[4px_0]">
            <button onClick={() => setActiveModal("discount")} className="flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: "var(--app-primary-hover, #0E8442)" }}>Discount {discount > 0 ? "· edit" : ""}</button>
            <span className="text-[12.5px] font-bold" style={{ color: "var(--app-danger-strong)" }}>{discount > 0 ? `−${formatCurrency(discount, currency)}` : formatCurrency(0, currency)}</span>
          </div>
          <div className="flex justify-between p-[4px_0] text-[12.5px]"><span style={{ color: "var(--app-text-faint)" }}>{taxLabel}{taxRate > 0 ? ` (${taxRate}%)` : ""}</span><span className="font-bold" style={{ color: "var(--app-text-muted)" }}>{formatCurrency(taxPreview, currency)}</span></div>
          <div className="mt-[9px] flex items-baseline justify-between border-t pt-[11px]" style={{ borderColor: "var(--app-border-strong)", borderStyle: "dashed" }}>
            <span className="text-[13px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Total</span>
            <span className="text-[27px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-1px" }}>{formatCurrency(total, currency)}</span>
          </div>
        </div>

        <div className="p-[0_16px_14px]">
          <div className="grid grid-cols-2 gap-[9px]">
            {PAYMENT_TILES.map((tile) => {
              const active = selectedMethod === tile.key;
              const Icon = tile.icon;
              return (
                <button
                  key={tile.key}
                  onClick={() => setSelectedMethod(tile.key)}
                  className="flex min-h-[76px] flex-col items-center justify-center gap-[7px] rounded-[13px] p-[13px_8px]"
                  style={{ border: `1.5px solid ${active ? "var(--app-primary)" : "var(--app-border)"}`, background: active ? "var(--app-success-bg)" : "var(--app-surface)" }}
                >
                  <Icon className="h-[21px] w-[21px]" style={{ color: active ? "var(--app-primary)" : "var(--app-text-muted)" }} aria-hidden />
                  <span className="text-[12px] font-bold" style={{ color: active ? "var(--app-primary-hover, #0E8442)" : "var(--app-text-muted)" }}>{tile.label}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-2.5 flex gap-2">
            <button onClick={() => setActiveModal("hold")} disabled={cart.length === 0} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] p-2.5 text-[12px] font-bold disabled:opacity-50" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Hold</button>
            <button onClick={() => setActiveModal("scan")} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] p-2.5 text-[12px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Scan</button>
            <button onClick={() => setActiveModal("clear")} disabled={cart.length === 0} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] p-2.5 text-[12px] font-bold disabled:opacity-50" style={{ border: "1px solid var(--app-border)", color: cart.length === 0 ? "var(--app-text-disabled)" : "var(--app-danger-strong)" }}>Clear</button>
          </div>
          <button
            onClick={handleCompleteClick}
            disabled={!canComplete}
            className="mt-[11px] flex min-h-14 w-full items-center justify-center gap-2 rounded-[13px] p-4 text-[15px] font-extrabold text-white disabled:opacity-50"
            style={{ background: "var(--app-primary)", letterSpacing: "-.2px" }}
          >
            Complete Sale · {formatCurrency(total, currency)}
          </button>
          <div className="mt-2 text-center text-[11px]" style={{ color: "var(--app-text-disabled)" }}>
            {cart.length === 0 ? "Add an item to the cart to continue" : `Paying with ${PAYMENT_TILES.find((t) => t.key === selectedMethod)?.label}`}
          </div>
        </div>
      </aside>

      <CustomerDrawer
        open={activeModal === "customer"}
        onClose={() => setActiveModal(null)}
        currency={currency}
        onPick={(c) => {
          const balance = debtors.find((d) => d.customerId === c.id)?.balance ?? c.creditBalance;
          setCustomer({ ...c, creditBalance: balance });
        }}
      />

      <ScanModal
        open={activeModal === "scan"}
        onClose={() => setActiveModal(null)}
        products={products}
        onFound={(p) => addToCart(p)}
      />

      <DiscountModal
        open={activeModal === "discount"}
        onClose={() => setActiveModal(null)}
        subtotal={subtotal}
        currency={currency}
        onApply={setDiscount}
        onRemove={() => setDiscount(0)}
      />

      <CashPaymentModal
        open={activeModal === "cash"}
        onClose={() => setActiveModal(null)}
        total={total}
        currency={currency}
        completing={saleMutation.isPending}
        onComplete={(received) => saleMutation.mutate(buildSalePayload("cash", received))}
      />

      <TerminalPaymentModal
        open={activeModal === "card" || activeModal === "online"}
        onClose={() => setActiveModal(null)}
        method={activeModal === "online" ? "online" : "card"}
        total={total}
        currency={currency}
        completing={saleMutation.isPending}
        onComplete={() => saleMutation.mutate(buildSalePayload(activeModal === "online" ? "online" : "card"))}
      />

      <CreditPaymentModal
        open={activeModal === "credit"}
        onClose={() => setActiveModal(null)}
        customer={customer}
        total={total}
        currency={currency}
        completing={saleMutation.isPending}
        onComplete={() => saleMutation.mutate(buildSalePayload("credit"))}
        onChooseCustomer={() => setActiveModal("customer")}
      />

      <HoldModal
        open={activeModal === "hold"}
        onClose={() => setActiveModal(null)}
        itemCount={itemCountLabel}
        holding={holdMutation.isPending}
        onHold={(reference, note) => holdMutation.mutate([reference, note].filter(Boolean).join(" — "))}
      />

      <ClearSaleModal open={activeModal === "clear"} onClose={() => setActiveModal(null)} onClear={resetSale} />
    </main>
  );
}

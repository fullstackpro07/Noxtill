"use client";

import Link from "next/link";
import { type FormEvent, type ReactNode, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { fetchCustomers } from "@/lib/customers-api";
import { fetchProducts } from "@/lib/products-api";
import {
  createB2bAccount,
  createB2bPriceList,
  createB2bTier,
  fetchB2bAccounts,
  fetchB2bPriceLists,
  fetchB2bSummary,
  fetchB2bTiers,
  previewB2bQuote,
  reactivateB2bAccount,
  removeB2bPrice,
  setB2bPrice,
  suspendB2bAccount,
  updateB2bAccount,
  updateB2bPriceList,
  type B2bAccount,
  type B2bPriceList,
  type B2bQuotePreview,
} from "@/lib/commerce-b2b-api";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

const fieldClass = "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--app-primary)]";
const fieldStyle = { borderColor: "var(--app-border)", background: "var(--app-surface)" };
const primaryButton = "rounded-lg px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50";
const optionalNumber = (value: string) => (value.trim() === "" ? null : Number(value));

function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint: string; tone?: "warning" | "danger" }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
      <p className="m-0 text-xs font-semibold" style={{ color: "var(--app-text-faint)" }}>{label}</p>
      <p className="m-0 mt-1 text-2xl font-bold" style={{ color: tone === "danger" ? "var(--app-danger-strong)" : tone === "warning" ? "var(--app-warning-text)" : "var(--app-text)" }}>
        {value}
      </p>
      <p className="m-0 mt-1 text-xs" style={{ color: "var(--app-text-faintest)" }}>{hint}</p>
    </div>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`my-auto max-h-[92vh] w-full ${wide ? "max-w-2xl" : "max-w-lg"} overflow-y-auto rounded-2xl border p-5 shadow-xl`}
        style={{ borderColor: "var(--app-border)", background: "var(--app-surface)", color: "var(--app-text)" }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="m-0 text-base font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="text-sm font-semibold" style={{ color: "var(--app-text-faint)" }}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--app-text-muted)" }}>
      {label}
      {children}
      {hint && <span className="font-normal" style={{ color: "var(--app-text-faintest)" }}>{hint}</span>}
    </label>
  );
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () => Promise.all(["b2b-summary", "b2b-accounts", "b2b-tiers", "b2b-price-lists"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
}

function AccountDialog({ account, onClose }: { account: B2bAccount | null; onClose: () => void }) {
  const refresh = useRefresh();
  const customersQuery = useQuery({ queryKey: ["b2b-customers"], queryFn: fetchCustomers, enabled: !account });
  const tiersQuery = useQuery({ queryKey: ["b2b-tiers"], queryFn: fetchB2bTiers });
  const listsQuery = useQuery({ queryKey: ["b2b-price-lists"], queryFn: fetchB2bPriceLists });
  const [customerId, setCustomerId] = useState("");
  const [companyName, setCompanyName] = useState(account?.companyName ?? "");
  const [taxId, setTaxId] = useState(account?.taxId ?? "");
  const [tierId, setTierId] = useState(account?.tier?.id ?? "");
  const [priceListId, setPriceListId] = useState(account?.priceList?.id ?? "");
  const [terms, setTerms] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [notes, setNotes] = useState(account?.notes ?? "");

  const save = useMutation({
    mutationFn: () => {
      const input = {
        companyName: companyName.trim(),
        taxId: taxId.trim() || null,
        tierId: tierId || null,
        priceListId: priceListId || null,
        notes: notes.trim() || null,
        ...(terms.trim() !== "" ? { paymentTermsDays: Number(terms) } : {}),
        ...(minOrder.trim() !== "" ? { minOrderValue: Number(minOrder) } : {}),
      };
      return account ? updateB2bAccount(account.id, input) : createB2bAccount({ ...input, customerId });
    },
    onSuccess: async () => {
      await refresh();
      toast.success(account ? "Account updated." : "Wholesale account created.");
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't save this account.")),
  });

  return (
    <Modal title={account ? `Edit ${account.companyName}` : "New wholesale account"} onClose={onClose} wide>
      <form
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          if (!account && !customerId) {
            toast.error("Choose the CRM customer this account belongs to.");
            return;
          }
          save.mutate();
        }}
        className="flex flex-col gap-3"
      >
        {!account && (
          <Field label="CRM customer" hint="Credit limit and balance come from this customer in Customers/Credit.">
            <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className={fieldClass} style={fieldStyle}>
              <option value="">{customersQuery.isLoading ? "Loading customers…" : "Choose a customer"}</option>
              {(customersQuery.data ?? []).map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.name} · {customer.phone}</option>
              ))}
            </select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Company name">
            <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} required minLength={2} maxLength={160} className={fieldClass} style={fieldStyle} />
          </Field>
          <Field label="Tax / company ID">
            <input value={taxId} onChange={(event) => setTaxId(event.target.value)} maxLength={64} className={fieldClass} style={fieldStyle} />
          </Field>
          <Field label="Tier">
            <select value={tierId} onChange={(event) => setTierId(event.target.value)} className={fieldClass} style={fieldStyle}>
              <option value="">No tier</option>
              {(tiersQuery.data ?? []).map((tier) => (
                <option key={tier.id} value={tier.id}>{tier.name} ({tier.defaultDiscountPct}% off)</option>
              ))}
            </select>
          </Field>
          <Field label="Price list">
            <select value={priceListId} onChange={(event) => setPriceListId(event.target.value)} className={fieldClass} style={fieldStyle}>
              <option value="">No price list</option>
              {(listsQuery.data ?? []).filter((list) => list.status === "active").map((list) => (
                <option key={list.id} value={list.id}>{list.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Payment terms (days)" hint={account ? "Leave blank to keep the current value" : "Blank uses the tier's terms"}>
            <input type="number" min={0} max={365} value={terms} onChange={(event) => setTerms(event.target.value)} className={fieldClass} style={fieldStyle} />
          </Field>
          <Field label="Minimum order value" hint={account ? "Leave blank to keep the current value" : "Blank uses the tier's minimum"}>
            <input type="number" min={0} step="0.01" value={minOrder} onChange={(event) => setMinOrder(event.target.value)} className={fieldClass} style={fieldStyle} />
          </Field>
        </div>
        <Field label="Notes">
          <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} className={fieldClass} style={fieldStyle} />
        </Field>
        <button type="submit" disabled={save.isPending} className={`self-end ${primaryButton}`} style={{ background: "var(--app-primary)" }}>
          {save.isPending ? "Saving…" : account ? "Save changes" : "Create account"}
        </button>
      </form>
    </Modal>
  );
}

function QuoteDialog({ account, currency, onClose }: { account: B2bAccount; currency: string; onClose: () => void }) {
  const productsQuery = useQuery({ queryKey: ["b2b-products"], queryFn: () => fetchProducts({ active: true }) });
  const products = (productsQuery.data ?? []).filter((product) => product.kind === "product");
  const [lines, setLines] = useState<Array<{ productId: string; qty: string }>>([{ productId: "", qty: "1" }]);
  const [result, setResult] = useState<B2bQuotePreview | null>(null);
  const preview = useMutation({
    mutationFn: () => previewB2bQuote(account.id, lines.filter((line) => line.productId).map((line) => ({ productId: line.productId, qty: Math.max(Number.parseInt(line.qty, 10) || 1, 1) }))),
    onSuccess: setResult,
    onError: (error) => toast.error(errorMessage(error, "Couldn't price these lines.")),
  });
  return (
    <Modal title={`Price check · ${account.companyName}`} onClose={onClose} wide>
      <div className="flex flex-col gap-2">
        {lines.map((line, index) => (
          <div key={index} className="flex gap-2">
            <select
              value={line.productId}
              onChange={(event) => setLines((prev) => prev.map((item, i) => (i === index ? { ...item, productId: event.target.value } : item)))}
              aria-label={`Product ${index + 1}`}
              className={fieldClass}
              style={fieldStyle}
            >
              <option value="">Choose product</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              value={line.qty}
              onChange={(event) => setLines((prev) => prev.map((item, i) => (i === index ? { ...item, qty: event.target.value } : item)))}
              aria-label={`Quantity ${index + 1}`}
              className="w-24 rounded-lg border px-3 py-2 text-sm"
              style={fieldStyle}
            />
          </div>
        ))}
        <div className="flex gap-3">
          <button type="button" onClick={() => setLines((prev) => [...prev, { productId: "", qty: "1" }])} className="text-xs font-bold underline">Add line</button>
          <button
            type="button"
            onClick={() => preview.mutate()}
            disabled={preview.isPending || !lines.some((line) => line.productId)}
            className={`ml-auto ${primaryButton}`}
            style={{ background: "var(--app-primary)" }}
          >
            {preview.isPending ? "Pricing…" : "Price these lines"}
          </button>
        </div>
      </div>
      {result && (
        <div className="mt-4 rounded-xl border p-3 text-xs" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)" }}>
          {result.lines.map((line) => (
            <p key={line.productId} className="m-0 py-0.5">
              {line.name} × {line.qty}: {money(line.unitPrice, currency)} each ({line.source === "price_list" ? "price list" : line.source === "tier_discount" ? "tier discount" : "standard price"}
              {line.unitPrice !== line.basePrice ? `, standard ${money(line.basePrice, currency)}` : ""}) = {money(line.lineTotal, currency)}
              {line.note ? <span style={{ color: "var(--app-warning-text)" }}> · {line.note}</span> : null}
            </p>
          ))}
          <p className="mb-0 mt-2 font-bold">Total {money(result.total, currency)}{result.paymentTermsDays !== null ? ` · net ${result.paymentTermsDays} days` : ""}</p>
          {result.warnings.map((warning) => (
            <p key={warning} className="m-0 mt-1 font-semibold" style={{ color: "var(--app-danger-strong)" }}>{warning}</p>
          ))}
          <p className="mb-0 mt-2" style={{ color: "var(--app-text-faint)" }}>
            This is a price check only. Create the formal quote in <Link href="/orders/quotations" className="font-bold underline">Orders → Quotations</Link>.
          </p>
        </div>
      )}
    </Modal>
  );
}

function PriceListPanel({ list, currency }: { list: B2bPriceList; currency: string }) {
  const refresh = useRefresh();
  const productsQuery = useQuery({ queryKey: ["b2b-products"], queryFn: () => fetchProducts({ active: true }) });
  const [productId, setProductId] = useState("");
  const [price, setPrice] = useState("");
  const [minQty, setMinQty] = useState("1");
  const add = useMutation({
    mutationFn: () => setB2bPrice(list.id, { productId, unitPrice: Number(price), minQty: Math.max(Number.parseInt(minQty, 10) || 1, 1) }),
    onSuccess: async () => {
      await refresh();
      setProductId("");
      setPrice("");
      toast.success("Price saved. The product's standard price is unchanged.");
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't save this price.")),
  });
  const remove = useMutation({
    mutationFn: (id: string) => removeB2bPrice(list.id, id),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error, "Couldn't remove this price.")),
  });
  const toggle = useMutation({
    mutationFn: () => updateB2bPriceList(list.id, { status: list.status === "active" ? "archived" : "active" }),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error, "Couldn't update this price list.")),
  });
  return (
    <section className="rounded-xl border p-4" style={{ borderColor: "var(--app-border)", opacity: list.status === "archived" ? 0.65 : 1 }}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-bold">
          {list.name} <span className="font-normal" style={{ color: "var(--app-text-faint)" }}>· {list.accounts} account{list.accounts === 1 ? "" : "s"} · {list.status}</span>
        </h3>
        <button type="button" onClick={() => toggle.mutate()} className="text-xs font-bold underline">{list.status === "active" ? "Archive" : "Restore"}</button>
      </div>
      {list.items.length === 0 ? (
        <p className="m-0 text-xs" style={{ color: "var(--app-text-faint)" }}>No prices yet — accounts on this list pay the standard price less their tier discount.</p>
      ) : (
        <ul className="m-0 flex flex-col gap-1 pl-0 text-xs">
          {list.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2" style={{ listStyle: "none" }}>
              <span>
                {item.product.name}: <strong>{money(item.unitPrice, currency)}</strong>
                {item.minQty > 1 ? ` from ${item.minQty} units` : ""}
                <span style={{ color: "var(--app-text-faintest)" }}> (standard {money(item.product.basePrice, currency)})</span>
              </span>
              <button type="button" onClick={() => remove.mutate(item.product.id)} className="font-bold" style={{ color: "var(--app-danger-strong)" }} aria-label={`Remove ${item.product.name}`}>×</button>
            </li>
          ))}
        </ul>
      )}
      {list.status === "active" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <select value={productId} onChange={(event) => setProductId(event.target.value)} aria-label="Product" className="rounded-lg border px-2 py-1.5" style={fieldStyle}>
            <option value="">Add product…</option>
            {(productsQuery.data ?? []).filter((product) => product.kind === "product").map((product) => (
              <option key={product.id} value={product.id}>{product.name}</option>
            ))}
          </select>
          <input type="number" min={0} step="0.01" placeholder="Price" value={price} onChange={(event) => setPrice(event.target.value)} aria-label="Wholesale price" className="w-24 rounded-lg border px-2 py-1.5" style={fieldStyle} />
          <input type="number" min={1} value={minQty} onChange={(event) => setMinQty(event.target.value)} aria-label="Minimum quantity" title="Minimum quantity" className="w-20 rounded-lg border px-2 py-1.5" style={fieldStyle} />
          <button type="button" onClick={() => add.mutate()} disabled={!productId || price === "" || add.isPending} className="rounded-lg px-3 py-1.5 font-bold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>Save price</button>
        </div>
      )}
    </section>
  );
}

function SetupTab({ currency }: { currency: string }) {
  const refresh = useRefresh();
  const tiersQuery = useQuery({ queryKey: ["b2b-tiers"], queryFn: fetchB2bTiers });
  const listsQuery = useQuery({ queryKey: ["b2b-price-lists"], queryFn: fetchB2bPriceLists });
  const [tierName, setTierName] = useState("");
  const [discount, setDiscount] = useState("0");
  const [tierMin, setTierMin] = useState("");
  const [tierTerms, setTierTerms] = useState("");
  const [listName, setListName] = useState("");
  const addTier = useMutation({
    mutationFn: () => createB2bTier({ name: tierName.trim(), defaultDiscountPct: Number(discount) || 0, minOrderValue: optionalNumber(tierMin), paymentTermsDays: optionalNumber(tierTerms) }),
    onSuccess: async () => {
      await refresh();
      setTierName("");
      toast.success("Tier added.");
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't add this tier.")),
  });
  const addList = useMutation({
    mutationFn: () => createB2bPriceList({ name: listName.trim() }),
    onSuccess: async () => {
      await refresh();
      setListName("");
      toast.success("Price list created.");
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't create this price list.")),
  });
  return (
    <div className="grid gap-4 p-4 lg:grid-cols-2">
      <section className="flex flex-col gap-3">
        <h3 className="m-0 text-sm font-bold">Tiers</h3>
        {(tiersQuery.data ?? []).length === 0 ? (
          <p className="m-0 text-xs" style={{ color: "var(--app-text-faint)" }}>No tiers yet.</p>
        ) : (
          <ul className="m-0 flex flex-col gap-1 pl-0 text-xs">
            {(tiersQuery.data ?? []).map((tier) => (
              <li key={tier.id} className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--app-border)", listStyle: "none" }}>
                <strong>{tier.name}</strong> · {tier.defaultDiscountPct}% off standard prices
                {tier.minOrderValue !== null ? ` · min order ${money(tier.minOrderValue, currency)}` : ""}
                {tier.paymentTermsDays !== null ? ` · net ${tier.paymentTermsDays}` : ""} · {tier.accounts} account{tier.accounts === 1 ? "" : "s"}
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-2 gap-2 rounded-xl border p-3" style={{ borderColor: "var(--app-border)" }}>
          <Field label="Tier name"><input value={tierName} onChange={(event) => setTierName(event.target.value)} maxLength={80} className={fieldClass} style={fieldStyle} /></Field>
          <Field label="Discount %"><input type="number" min={0} max={100} step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} className={fieldClass} style={fieldStyle} /></Field>
          <Field label="Minimum order"><input type="number" min={0} step="0.01" value={tierMin} onChange={(event) => setTierMin(event.target.value)} className={fieldClass} style={fieldStyle} /></Field>
          <Field label="Payment terms (days)"><input type="number" min={0} max={365} value={tierTerms} onChange={(event) => setTierTerms(event.target.value)} className={fieldClass} style={fieldStyle} /></Field>
          <button type="button" onClick={() => addTier.mutate()} disabled={tierName.trim().length < 2 || addTier.isPending} className={`col-span-2 justify-self-end ${primaryButton}`} style={{ background: "var(--app-primary)" }}>Add tier</button>
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h3 className="m-0 text-sm font-bold">Price lists</h3>
        {(listsQuery.data ?? []).map((list) => (
          <PriceListPanel key={list.id} list={list} currency={currency} />
        ))}
        <div className="flex gap-2">
          <input value={listName} onChange={(event) => setListName(event.target.value)} placeholder="New price list name" aria-label="New price list name" maxLength={120} className={fieldClass} style={fieldStyle} />
          <button type="button" onClick={() => addList.mutate()} disabled={listName.trim().length < 2 || addList.isPending} className={primaryButton} style={{ background: "var(--app-primary)" }}>Create</button>
        </div>
      </section>
    </div>
  );
}

function SuspendDialog({ account, onClose }: { account: B2bAccount; onClose: () => void }) {
  const refresh = useRefresh();
  const [reason, setReason] = useState("");
  const suspend = useMutation({
    mutationFn: () => suspendB2bAccount(account.id, reason.trim()),
    onSuccess: async () => {
      await refresh();
      toast.success("Account suspended.");
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't suspend this account.")),
  });
  return (
    <Modal title={`Suspend ${account.companyName}?`} onClose={onClose}>
      <Field label="Reason (kept in the audit log)">
        <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} className={fieldClass} style={fieldStyle} />
      </Field>
      <button type="button" onClick={() => suspend.mutate()} disabled={reason.trim().length < 3 || suspend.isPending} className={`mt-4 ${primaryButton}`} style={{ background: "var(--app-danger-strong)" }}>
        Suspend account
      </button>
    </Modal>
  );
}

export function CommerceB2bView() {
  useModuleHeader({
    title: "B2B & Wholesale",
    subtitle: "Wholesale accounts on top of your CRM customers, with tiers, price lists and terms.",
  });
  const session = useSession();
  const currency = session.business.currency || "USD";
  const refresh = useRefresh();
  const [tab, setTab] = useState<"accounts" | "setup">("accounts");
  const [dialog, setDialog] = useState<{ kind: "account"; account: B2bAccount | null } | { kind: "quote" | "suspend"; account: B2bAccount } | null>(null);
  const summaryQuery = useQuery({ queryKey: ["b2b-summary"], queryFn: fetchB2bSummary });
  const accountsQuery = useQuery({ queryKey: ["b2b-accounts"], queryFn: fetchB2bAccounts });
  const reactivate = useMutation({
    mutationFn: reactivateB2bAccount,
    onSuccess: async () => {
      await refresh();
      toast.success("Account reactivated.");
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't reactivate this account.")),
  });
  const summary = summaryQuery.data;
  const accounts = accountsQuery.data ?? [];
  const loading = summaryQuery.isLoading;

  return (
    <main className="flex flex-col gap-5 p-5 md:p-7" style={{ color: "var(--app-text)" }}>
      <p className="m-0 rounded-xl border px-4 py-3 text-xs" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)", color: "var(--app-text-muted)" }}>
        Each wholesale account is a layer on a <Link href="/customers" className="font-bold underline">CRM customer</Link>. Credit limits and balances come from{" "}
        <Link href="/credit" className="font-bold underline">Credit</Link>; quotes and invoices are created in{" "}
        <Link href="/orders/quotations" className="font-bold underline">Orders</Link>. Price lists and tier discounts only apply when pricing for an
        account — standard product prices never change. Reorder signals are an estimate from past order dates. A buyer self-service portal
        isn&rsquo;t available yet.
      </p>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Kpi label="Active accounts" value={loading ? "…" : summary?.activeAccounts ?? "—"} hint={`${summary?.suspendedAccounts ?? 0} suspended`} />
        <Kpi label="Wholesale sales (YTD)" value={loading ? "…" : summary ? money(summary.ytdOrderValue, currency) : "—"} hint="Orders by wholesale customers this year" />
        <Kpi label="Receivables" value={loading ? "…" : summary ? money(summary.receivables, currency) : "—"} hint="Outstanding credit balances" />
        <Kpi label="Over credit limit" value={loading ? "…" : summary?.overCreditLimit ?? "—"} hint="Balance above the Credit limit" tone={summary?.overCreditLimit ? "danger" : undefined} />
        <Kpi label="Open quotes" value={loading ? "…" : summary?.openQuotes ?? "—"} hint="Draft or sent quotations" />
        <Kpi label="Reorders due" value={loading ? "…" : summary?.reordersDue ?? "—"} hint="Past their usual reorder date (estimate)" tone={summary?.reordersDue ? "warning" : undefined} />
        <div className="flex items-center justify-center">
          <button type="button" onClick={() => setDialog({ kind: "account", account: null })} className={primaryButton} style={{ background: "var(--app-primary)" }}>
            New account
          </button>
        </div>
      </section>

      <section className="rounded-2xl border" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
        <div role="tablist" className="flex gap-4 border-b px-4 pt-3" style={{ borderColor: "var(--app-border)" }}>
          {([["accounts", `Accounts (${accounts.length})`], ["setup", "Tiers & price lists"]] as const).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className="border-b-2 pb-2.5 text-sm font-bold" style={{ borderColor: tab === key ? "var(--app-primary)" : "transparent", color: tab === key ? "var(--app-text)" : "var(--app-text-faint)" }}>
              {label}
            </button>
          ))}
        </div>
        {tab === "setup" ? (
          <SetupTab currency={currency} />
        ) : accountsQuery.isLoading ? (
          <p className="m-0 p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading accounts…</p>
        ) : accountsQuery.isError ? (
          <div className="flex flex-wrap items-center gap-3 p-6 text-sm" style={{ color: "var(--app-danger-strong)" }}>
            {errorMessage(accountsQuery.error, "Couldn't load wholesale accounts.")}
            <button type="button" onClick={() => accountsQuery.refetch()} className="font-bold underline">Retry</button>
          </div>
        ) : accounts.length === 0 ? (
          <div className="p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>
            <p className="m-0 font-semibold" style={{ color: "var(--app-text)" }}>No wholesale accounts yet.</p>
            <p className="mb-0 mt-1">Set up tiers and price lists, then turn a CRM customer into a wholesale account.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-xs">
              <thead style={{ color: "var(--app-text-faint)", background: "var(--app-surface-2)" }}>
                <tr>
                  <th className="px-4 py-3 font-semibold">Account</th>
                  <th className="px-4 py-3 font-semibold">Tier / price list</th>
                  <th className="px-4 py-3 font-semibold">Terms</th>
                  <th className="px-4 py-3 font-semibold">Credit</th>
                  <th className="px-4 py-3 font-semibold">YTD</th>
                  <th className="px-4 py-3 font-semibold">Reorder</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id} className="border-t align-top" style={{ borderColor: "var(--app-border)", opacity: account.status === "suspended" ? 0.7 : 1 }}>
                    <td className="px-4 py-3">
                      <p className="m-0 font-semibold">{account.companyName}</p>
                      <p className="m-0 mt-0.5" style={{ color: "var(--app-text-faintest)" }}>
                        <Link href={`/customers/${account.customer.id}`} className="underline">{account.customer.name}</Link> · {account.customer.phone}
                      </p>
                      {account.status === "suspended" && (
                        <p className="m-0 mt-0.5 font-semibold" style={{ color: "var(--app-danger-strong)" }}>Suspended{account.suspendedReason ? `: ${account.suspendedReason}` : ""}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {account.tier ? `${account.tier.name} (${account.tier.defaultDiscountPct}% off)` : "No tier"}
                      <span className="block" style={{ color: "var(--app-text-faintest)" }}>{account.priceList?.name ?? "No price list"}</span>
                    </td>
                    <td className="px-4 py-3">
                      {account.paymentTermsDays === null ? "Not set" : `Net ${account.paymentTermsDays}`}
                      <span className="block" style={{ color: "var(--app-text-faintest)" }}>
                        {account.minOrderValue === null ? "No minimum" : `Min ${money(account.minOrderValue, currency)}`}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span style={{ color: account.credit.overLimit ? "var(--app-danger-strong)" : undefined }}>
                        {money(account.credit.balance, currency)} owed
                      </span>
                      <span className="block" style={{ color: "var(--app-text-faintest)" }}>
                        {account.credit.limit === null ? "No credit limit set" : `Limit ${money(account.credit.limit, currency)}`}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {money(account.ytdOrderValue, currency)}
                      <span className="block" style={{ color: "var(--app-text-faintest)" }}>
                        {account.ytdOrders} order{account.ytdOrders === 1 ? "" : "s"}
                        {account.openQuotes ? ` · ${account.openQuotes} open quote${account.openQuotes === 1 ? "" : "s"}` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {account.reorder.status === "insufficient_history" ? (
                        <span style={{ color: "var(--app-text-faintest)" }}>Not enough history ({account.reorder.orders} order{account.reorder.orders === 1 ? "" : "s"})</span>
                      ) : (
                        <span style={{ color: account.reorder.status === "due" ? "var(--app-warning-text)" : undefined }}>
                          {account.reorder.status === "due" ? "Due" : "Next"} ~{formatDate(account.reorder.nextExpectedAt)}
                          <span className="block" style={{ color: "var(--app-text-faintest)" }}>Every ~{account.reorder.averageGapDays} days</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setDialog({ kind: "quote", account })} className="font-bold underline">Price check</button>
                        <button type="button" onClick={() => setDialog({ kind: "account", account })} className="font-bold underline">Edit</button>
                        {account.status === "active" ? (
                          <button type="button" onClick={() => setDialog({ kind: "suspend", account })} className="font-bold underline" style={{ color: "var(--app-danger-strong)" }}>Suspend</button>
                        ) : (
                          <button type="button" onClick={() => reactivate.mutate(account.id)} className="font-bold underline" style={{ color: "var(--app-success-text)" }}>Reactivate</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {dialog?.kind === "account" && <AccountDialog account={dialog.account} onClose={() => setDialog(null)} />}
      {dialog?.kind === "quote" && <QuoteDialog account={dialog.account} currency={currency} onClose={() => setDialog(null)} />}
      {dialog?.kind === "suspend" && <SuspendDialog account={dialog.account} onClose={() => setDialog(null)} />}
    </main>
  );
}

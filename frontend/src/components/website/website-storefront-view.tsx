"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { websiteApi, type StorefrontProduct } from "@/lib/website-api";
import { Btn, Card, Empty, Field, Kpi, Notice, Page, StatusBadge, errorText, inputClass, inputStyle, money } from "./website-ui";

export function WebsiteStorefrontView() {
  useModuleHeader({ title: "Storefront Configuration", subtitle: "How your products appear on your own online store" });
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["website", "storefront"], queryFn: websiteApi.storefront });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "shown" | "hidden" | "issues">("all");
  const [picked, setPicked] = useState<string[]>([]);
  const [editing, setEditing] = useState<StorefrontProduct | null>(null);
  const [newCollection, setNewCollection] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const act = useMutation({
    mutationFn: async ({ fn }: { fn: () => Promise<unknown>; ok: string }) => fn(),
    onSuccess: (_d, v) => { setMessage({ tone: "ok", text: v.ok }); void qc.invalidateQueries({ queryKey: ["website"] }); },
    onError: (e) => setMessage({ tone: "danger", text: errorText(e) }),
  });
  const run = (ok: string, fn: () => Promise<unknown>) => act.mutate({ fn, ok });

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data?.products ?? []).filter((p) => {
      if (s && !`${p.name} ${p.sku ?? ""} ${p.category ?? ""}`.toLowerCase().includes(s)) return false;
      if (filter === "shown") return p.shownOnStore;
      if (filter === "hidden") return !p.visible;
      if (filter === "issues") return p.issues.length > 0;
      return true;
    });
  }, [q.data, search, filter]);

  if (q.isLoading) return <Page><p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading…</p></Page>;
  if (q.isError || !q.data) return <Page><Notice tone="danger">{errorText(q.error)}</Notice></Page>;
  const d = q.data;

  return (
    <Page>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Products visible on store" value={d.kpis.productsVisible} />
        <Kpi label="Collections" value={d.kpis.collections} />
        <Kpi label="Unavailable items" value={d.kpis.unavailableItems} hint="Visible but out of stock" tone={d.kpis.unavailableItems ? "warn" : undefined} />
        <Kpi label="Catalog issues" value={d.kpis.catalogIssues} hint="Missing price or out of stock" tone={d.kpis.catalogIssues ? "warn" : undefined} />
      </div>

      <Card title="Store options (apply immediately)" actions={<a href={d.storeUrlPath} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--app-border)" }}><ExternalLink className="h-3.5 w-3.5" aria-hidden /> Preview store</a>}>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={d.options.checkoutEnabled} onChange={(e) => { if (e.target.checked || window.confirm("Turn off online ordering? Customers won't be able to place orders on your store.")) run("Checkout setting saved.", () => websiteApi.storefrontOptions({ checkoutEnabled: e.target.checked })); }} /> Online ordering (checkout) on</label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={d.options.showPrices} onChange={(e) => run("Saved.", () => websiteApi.storefrontOptions({ showPrices: e.target.checked }))} /> Show prices on website product blocks</label>
          <Field label="Out-of-stock products">
            <select className={inputClass} style={inputStyle} value={d.options.outOfStockBehavior} onChange={(e) => run("Saved.", () => websiteApi.storefrontOptions({ outOfStockBehavior: e.target.value as "hide" | "show_unavailable" }))}>
              <option value="show_unavailable">Show as unavailable</option>
              <option value="hide">Hide from the store</option>
            </select>
          </Field>
        </div>
        <p className="m-0 mt-2 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
          Prices, stock and product details stay in <Link className="underline" href="/products">Products</Link> and <Link className="underline" href="/inventory">Inventory</Link>; availability is read live{d.allowNegativeStock ? " (your Sales policy allows selling below zero stock, so everything counts as available)" : ""}. Marketplace listings live in <Link className="underline" href="/autonomous-commerce/channel-listings">Channel Listings</Link>; conversion ideas in <Link className="underline" href="/autonomous-commerce/store-optimizer">Store Optimizer</Link>.
        </p>
      </Card>

      <Card
        title="Catalog exposure"
        actions={
          picked.length > 0 ? (
            <>
              <span className="self-center text-xs">{picked.length} selected</span>
              <Btn onClick={() => run("Shown on store.", async () => { await websiteApi.bulkVisibility(picked, true); setPicked([]); })}>Show</Btn>
              <Btn onClick={() => run("Hidden from store.", async () => { await websiteApi.bulkVisibility(picked, false); setPicked([]); })}>Hide</Btn>
            </>
          ) : undefined
        }
      >
        <div className="mb-3 flex flex-wrap gap-2">
          <input aria-label="Search products" className={inputClass} style={{ ...inputStyle, maxWidth: 260 }} placeholder="Search name, SKU, category" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select aria-label="Filter" className={inputClass} style={{ ...inputStyle, maxWidth: 200 }} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="all">All products</option>
            <option value="shown">Shown on store</option>
            <option value="hidden">Hidden</option>
            <option value="issues">With issues</option>
          </select>
        </div>
        {rows.length === 0 ? <Empty>{d.products.length ? "No products match." : "No products yet. Add them in Products."}</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead style={{ color: "var(--app-text-faint)" }}>
                <tr>
                  <th className="py-2 pr-2"><input type="checkbox" aria-label="Select all" checked={picked.length === rows.length} onChange={(e) => setPicked(e.target.checked ? rows.map((r) => r.productId) : [])} /></th>
                  <th className="py-2 pr-2">Product</th><th className="py-2 pr-2">Price</th><th className="py-2 pr-2">Stock</th><th className="py-2 pr-2">On store</th><th className="py-2 pr-2">Priority</th><th className="py-2 pr-2">Badge</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.productId} className="border-t" style={{ borderColor: "var(--app-border)" }}>
                    <td className="py-2 pr-2"><input type="checkbox" aria-label={`Select ${p.name}`} checked={picked.includes(p.productId)} onChange={(e) => setPicked(e.target.checked ? [...picked, p.productId] : picked.filter((x) => x !== p.productId))} /></td>
                    <td className="py-2 pr-2"><span className="font-semibold">{p.webTitle || p.name}</span>{p.webTitle && <span style={{ color: "var(--app-text-faint)" }}> ({p.name})</span>}<br /><span style={{ color: "var(--app-text-faint)" }}>{p.kind}{p.category ? ` · ${p.category}` : ""}{p.issues.length ? ` · ${p.issues.join(", ")}` : ""}</span></td>
                    <td className="py-2 pr-2">{money(p.price, d.currency)}</td>
                    <td className="py-2 pr-2">{p.stockQty === null ? "Service" : p.stockQty}</td>
                    <td className="py-2 pr-2">{p.shownOnStore ? <StatusBadge status="live" label="Shown" /> : <StatusBadge status="unpublished" label={!p.active ? "Inactive" : !p.visible ? "Hidden" : "Out of stock (hidden)"} />}</td>
                    <td className="py-2 pr-2">{p.sortPriority}</td>
                    <td className="py-2 pr-2">{p.badge ?? "—"}</td>
                    <td className="py-2 pr-2"><Btn onClick={() => setEditing(p)}>Edit</Btn></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <Card title={`Web presentation: ${editing.name}`} actions={<Btn variant="ghost" onClick={() => setEditing(null)}>Close</Btn>}>
          <form
            className="grid gap-3 md:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run("Presentation saved.", async () => {
                await websiteApi.storefrontProduct(editing.productId, {
                  visible: f.get("visible") === "on",
                  sortPriority: Number(f.get("sortPriority") ?? 0),
                  badge: String(f.get("badge") ?? ""),
                  webTitle: String(f.get("webTitle") ?? ""),
                  webSummary: String(f.get("webSummary") ?? ""),
                });
                setEditing(null);
              });
            }}
          >
            <Field label="Web title (optional)" hint="Display only. Orders, receipts and stock keep the product's real name."><input name="webTitle" className={inputClass} style={inputStyle} defaultValue={editing.webTitle ?? ""} /></Field>
            <Field label="Badge (optional)" hint="e.g. New, Best seller"><input name="badge" className={inputClass} style={inputStyle} defaultValue={editing.badge ?? ""} maxLength={40} /></Field>
            <div className="md:col-span-2"><Field label="Short web summary"><textarea name="webSummary" className={inputClass} style={{ ...inputStyle, minHeight: 60 }} defaultValue={editing.webSummary ?? ""} maxLength={500} /></Field></div>
            <Field label="Sort priority (higher shows first)"><input name="sortPriority" type="number" min={-1000} max={1000} className={inputClass} style={inputStyle} defaultValue={editing.sortPriority} /></Field>
            <label className="flex items-center gap-2 self-end pb-2 text-xs"><input name="visible" type="checkbox" defaultChecked={editing.visible} /> Show on store</label>
            <div className="flex gap-2 md:col-span-2"><Btn type="submit" variant="primary">Save</Btn><Link className="self-center text-xs underline" href="/products">Open canonical product</Link></div>
          </form>
        </Card>
      )}

      <Card title="Collections" actions={<form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newCollection.trim()) run("Collection created.", async () => { await websiteApi.createCollection({ name: newCollection, productIds: picked }); setNewCollection(""); }); }}><input aria-label="New collection name" className={inputClass} style={{ ...inputStyle, width: 200 }} placeholder="New collection" value={newCollection} onChange={(e) => setNewCollection(e.target.value)} /><Btn type="submit" disabled={!newCollection.trim()}><Plus className="h-3.5 w-3.5" aria-hidden /> Create{picked.length ? ` with ${picked.length} selected` : ""}</Btn></form>}>
        {d.collections.length === 0 ? <Empty>No collections yet. Select products above, then create a collection to show them together on a page.</Empty> : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-xs">
            {d.collections.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2" style={{ borderColor: "var(--app-border)" }}>
                <span><strong>{c.name}</strong> · {c.productIds.length} products: {c.productIds.map((id) => d.products.find((p) => p.productId === id)?.name ?? "deleted product").join(", ") || "none"}</span>
                <span className="flex gap-1">
                  <Btn disabled={!picked.length} onClick={() => run("Collection updated.", () => websiteApi.updateCollection(c.id, { productIds: picked }))}>Replace with {picked.length || "selected"}</Btn>
                  <Btn onClick={() => run("Saved.", () => websiteApi.updateCollection(c.id, { visible: !c.visible }))}>{c.visible ? "Hide" : "Show"}</Btn>
                  <Btn variant="danger" aria-label="Delete collection" onClick={() => { if (window.confirm(`Delete collection "${c.name}"? Products are not affected.`)) run("Collection deleted.", () => websiteApi.deleteCollection(c.id)); }}><Trash2 className="h-3.5 w-3.5" aria-hidden /></Btn>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Page>
  );
}

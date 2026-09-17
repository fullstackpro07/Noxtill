"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronUp, ChevronDown } from "lucide-react";
import { useSession } from "@/lib/session";
import {
  createCategory,
  deleteCategory,
  fetchCategories,
  fetchCategoryRevenue,
  mergeCategory,
  reorderCategories,
  updateCategory,
  type LiveCategory,
} from "@/lib/categories-api";
import { fetchProducts } from "@/lib/products-api";
import { marginPercent } from "@/lib/products";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { PosModalShell } from "@/components/pos/pos-modal-shell";

const DONUT_COLORS = ["var(--app-primary)", "#2563EB", "#9333EA", "#F97316", "#0D9488", "#EAB308", "#EC4899"];
const cancelBtn: React.CSSProperties = { background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" };
const primaryBtn: React.CSSProperties = { background: "var(--app-primary)", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff" };
const dangerBtn: React.CSSProperties = { background: "var(--app-danger-strong)", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff" };
const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const primaryHeaderBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };

export function CategoriesPanel() {
  const session = useSession();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<LiveCategory | null>(null);
  const [merging, setMerging] = useState<LiveCategory | null>(null);
  const [deleting, setDeleting] = useState<LiveCategory | null>(null);

  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const { data: revenue } = useQuery({ queryKey: ["category-revenue"], queryFn: fetchCategoryRevenue });
  const { data: products } = useQuery({ queryKey: ["products", "all-for-categories"], queryFn: () => fetchProducts() });

  const colorByCategoryId = useMemo(() => {
    const map = new Map<string, string>();
    (categories ?? []).forEach((c, i) => map.set(c.id, DONUT_COLORS[i % DONUT_COLORS.length]));
    return map;
  }, [categories]);

  const avgMarginByCategoryId = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of categories ?? []) {
      const inCat = (products ?? []).filter((p) => p.categoryId === c.id);
      if (inCat.length === 0) continue;
      map.set(c.id, inCat.reduce((sum, p) => sum + marginPercent(p.price, p.costPrice), 0) / inCat.length);
    }
    return map;
  }, [categories, products]);

  const totalRevenue = (revenue ?? []).reduce((s, r) => s + r.revenue, 0);
  const totalProducts = (categories ?? []).reduce((s, c) => s + c.productCount, 0);
  const avgPerCategory = categories && categories.length > 0 ? Math.round(totalProducts / categories.length) : 0;
  const topCategory = categories && categories.length > 0 ? [...categories].sort((a, b) => b.productCount - a.productCount)[0] : null;

  const reorderMutation = useMutation({
    mutationFn: reorderCategories,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't reorder categories — please try again."),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Category deleted.");
      setDeleting(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't delete this category — please try again."),
  });

  function move(index: number, direction: -1 | 1) {
    if (!categories) return;
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;
    const reordered = [...categories];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    reorderMutation.mutate(reordered.map((c, i) => ({ id: c.id, sortOrder: i })));
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Categories</h2>
        <div className="ms-auto flex flex-wrap gap-2.5">
          <button type="button" onClick={() => setMerging(categories?.[0] ?? null)} disabled={!categories || categories.length < 2} style={{ ...outlineBtn, opacity: !categories || categories.length < 2 ? 0.5 : 1 }}>Merge Categories</button>
          <button type="button" onClick={() => setCreating(true)} style={primaryHeaderBtn}>+ Add Category</button>
        </div>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "minmax(0,1fr) 320px" }}>
        <div className="flex min-w-0 flex-col gap-3.5">
          <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Total Categories</div>
              <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{categories?.length ?? "—"}</div>
            </div>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Products per Category</div>
              <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{avgPerCategory}</div>
            </div>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Top Category</div>
              <div className="mt-[7px] text-[14px] font-extrabold" style={{ color: "var(--app-text)" }}>{topCategory?.name ?? "—"}</div>
            </div>
          </div>

          <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            {categories && categories.length === 0 ? (
              <div className="p-[52px_18px] text-center">
                <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Create categories to organise your catalog</div>
                <button type="button" onClick={() => setCreating(true)} className="mt-[15px] rounded-[11px] px-5 py-3 text-[12.5px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>Add Category</button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: 700 }}>
                  <thead>
                    <tr style={{ background: "var(--app-surface-2)" }}>
                      <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Category Name</th>
                      <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Product Count</th>
                      <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Revenue This Month</th>
                      <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Avg. Margin</th>
                      <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Sort Order</th>
                      <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(categories ?? []).map((c, i) => {
                      const rev = (revenue ?? []).find((r) => r.categoryId === c.id)?.revenue ?? 0;
                      const margin = avgMarginByCategoryId.get(c.id);
                      return (
                        <tr key={c.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                          <td className="p-[12px_17px]">
                            <span className="flex items-center gap-2.5">
                              <span className="h-[10px] w-[10px] rounded-[3px]" style={{ background: colorByCategoryId.get(c.id) }} />
                              <span className="text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{c.name}</span>
                            </span>
                          </td>
                          <td className="p-[12px] text-end text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{c.productCount}</td>
                          <td className="p-[12px] text-end text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(rev, session.business.currency)}</td>
                          <td className="p-[12px] text-end text-[12.5px] font-bold" style={{ color: "var(--app-success-text)" }}>{margin != null ? `${margin.toFixed(0)}%` : "—"}</td>
                          <td className="p-[12px]">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>{i + 1}</span>
                              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${c.name} up`} className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[8px] disabled:opacity-30" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-faint)" }}><ChevronUp className="h-3.5 w-3.5" aria-hidden /></button>
                              <button type="button" onClick={() => move(i, 1)} disabled={i === categories!.length - 1} aria-label={`Move ${c.name} down`} className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[8px] disabled:opacity-30" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-faint)" }}><ChevronDown className="h-3.5 w-3.5" aria-hidden /></button>
                            </span>
                          </td>
                          <td className="p-[12px_17px] text-end">
                            <span className="inline-flex gap-1.5">
                              <button type="button" onClick={() => setRenaming(c)} style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 13px", fontSize: 12, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 40 }}>Edit</button>
                              <button type="button" onClick={() => setDeleting(c)} style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 13px", fontSize: 12, fontWeight: 700, color: "var(--app-text-faintest)", minHeight: 40 }}>Delete</button>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-3 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Revenue by category</h3>
          {!revenue || revenue.length === 0 ? (
            <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No revenue recorded yet.</p>
          ) : (
            <>
              <div className="flex justify-center">
                <Donut data={revenue.map((r) => ({ value: r.revenue, color: colorByCategoryId.get(r.categoryId) ?? "#98A2B3" }))} />
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {revenue.map((r) => (
                  <div key={r.categoryId} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-[2px]" style={{ background: colorByCategoryId.get(r.categoryId) ?? "#98A2B3" }} />
                    <span className="flex-1 truncate text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{r.categoryName}</span>
                    <span className="text-[12px] font-extrabold" style={{ color: "var(--app-text)" }}>{totalRevenue > 0 ? Math.round((r.revenue / totalRevenue) * 100) : 0}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <CategoryFormModal open={creating} onClose={() => setCreating(false)} />
      {renaming && <CategoryFormModal open onClose={() => setRenaming(null)} category={renaming} />}
      {merging && categories && <MergeCategoryModal category={merging} categories={categories} onClose={() => setMerging(null)} />}

      <PosModalShell
        open={deleting != null}
        onClose={() => setDeleting(null)}
        title="Delete Category"
        footer={
          <>
            <button type="button" onClick={() => setDeleting(null)} style={cancelBtn}>Cancel</button>
            <button type="button" onClick={() => deleting && deleteMutation.mutate(deleting.id)} disabled={deleteMutation.isPending} style={{ ...dangerBtn, opacity: deleteMutation.isPending ? 0.6 : 1 }}>
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </button>
          </>
        }
      >
        <p className="m-0 p-[17px] text-[13px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
          {deleting && deleting.productCount > 0 ? `${deleting.productCount} product(s) will become uncategorized.` : "This category has no products."}
        </p>
      </PosModalShell>
    </main>
  );
}

function Donut({ data }: { data: { value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const C = 2 * Math.PI * 46;
  const arcs = data.reduce<{ color: string; len: number; offset: number }[]>((acc, d) => {
    const pct = total > 0 ? d.value / total : 0;
    const len = pct * C;
    const offset = acc.length > 0 ? acc[acc.length - 1].offset + acc[acc.length - 1].len : 0;
    acc.push({ color: d.color, len, offset });
    return acc;
  }, []);
  return (
    <svg viewBox="0 0 130 130" style={{ width: 150, height: 150 }}>
      <g transform="rotate(-90 65 65)">
        {arcs.map((a, i) => (
          <circle key={i} cx={65} cy={65} r={46} fill="none" stroke={a.color} strokeWidth={24} strokeDasharray={`${a.len.toFixed(1)} ${(C - a.len).toFixed(1)}`} strokeDashoffset={(-a.offset).toFixed(1)} />
        ))}
      </g>
      <circle cx={65} cy={65} r={31} fill="var(--app-surface)" />
    </svg>
  );
}

function CategoryFormModal({ open, onClose, category }: { open: boolean; onClose: () => void; category?: LiveCategory }) {
  const [name, setName] = useState(category?.name ?? "");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => (category ? updateCategory(category.id, { name }) : createCategory({ name })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success(category ? "Category renamed." : "Category added.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this category — please try again."),
  });

  return (
    <PosModalShell
      open={open}
      onClose={onClose}
      title={category ? "Rename Category" : "Add Category"}
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!name.trim() || mutation.isPending} style={{ ...primaryBtn, opacity: !name.trim() || mutation.isPending ? 0.6 : 1 }}>
            {mutation.isPending ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="p-[17px]">
        <label className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>NAME</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hair Care" className="w-full rounded-[11px] p-3 text-[13.5px]" style={{ border: "1px solid var(--app-border)" }} />
      </div>
    </PosModalShell>
  );
}

function MergeCategoryModal({ category, categories, onClose }: { category: LiveCategory; categories: LiveCategory[]; onClose: () => void }) {
  const [sourceId, setSourceId] = useState(category.id);
  const [targetId, setTargetId] = useState("");
  const queryClient = useQueryClient();
  const source = categories.find((c) => c.id === sourceId) ?? category;
  const candidates = categories.filter((c) => c.id !== sourceId);
  const target = candidates.find((c) => c.id === targetId);

  const mutation = useMutation({
    mutationFn: () => mergeCategory(sourceId, targetId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(`Moved ${result.movedProductCount} product(s).`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't merge these categories — please try again."),
  });

  return (
    <PosModalShell
      open
      onClose={onClose}
      title="Merge Categories"
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!targetId || mutation.isPending} style={{ ...dangerBtn, opacity: !targetId ? 0.6 : 1 }}>
            {mutation.isPending ? "Merging…" : "Merge"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 p-[17px]">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>MERGE</span>
          <select value={sourceId} onChange={(e) => { setSourceId(e.target.value); setTargetId(""); }} className="w-full rounded-[11px] p-3 text-[13px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>INTO</span>
          <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className="w-full rounded-[11px] p-3 text-[13px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
            <option value="" disabled>Select a category…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        {target && (
          <p className="m-0 text-[12px]" style={{ color: "var(--app-text-disabled)" }}>
            {source.productCount} product(s) move into &quot;{target.name}&quot; (currently {target.productCount}) — &quot;{source.name}&quot; is then deleted.
          </p>
        )}
      </div>
    </PosModalShell>
  );
}

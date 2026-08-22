"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { marginPercent, type Product, type ProductKind, type ProductVariation } from "@/lib/products";
import { createProduct, updateProduct } from "@/lib/products-api";
import { fetchStaffList } from "@/lib/staff-api";
import { fetchCategories } from "@/lib/categories-api";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

function emptyDraft(): Omit<Product, "id" | "active"> {
  return {
    name: "",
    category: "",
    kind: "product",
    price: 0,
    costPrice: 0,
    stockOnHand: 0,
    variations: [],
  };
}

export function ProductFormDrawer({
  open,
  onClose,
  product,
}: {
  open: boolean;
  onClose: () => void;
  product: Product | null;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  // Keyed on the product being edited so switching targets remounts fresh state instead of reconciling stale draft via an effect.
  return createPortal(<ProductFormPanel key={product?.id ?? "new"} product={product} onClose={onClose} />, document.body);
}

/** Services, formal fields (UPD-BE-087) — eligible-staff multi-select, buffer before/after, deposit toggle+amount. */
function ServiceFormalFields({
  draft,
  setDraft,
}: {
  draft: Omit<Product, "id" | "active">;
  setDraft: React.Dispatch<React.SetStateAction<Omit<Product, "id" | "active">>>;
}) {
  const { data: staff } = useQuery({ queryKey: ["staff-roster"], queryFn: fetchStaffList, staleTime: 5 * 60 * 1000 });
  const eligible = draft.eligibleStaffIds ?? [];

  function toggleStaff(id: string) {
    setDraft((d) => {
      const current = d.eligibleStaffIds ?? [];
      return { ...d, eligibleStaffIds: current.includes(id) ? current.filter((s) => s !== id) : [...current, id] };
    });
  }

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-4">
      <div>
        <p className="mb-1.5 text-sm font-medium text-fg">Eligible staff</p>
        <p className="mb-2 text-xs text-fg-faint">Leave all unchecked to allow any staff member to perform this service.</p>
        {!staff || staff.length === 0 ? (
          <p className="text-xs text-fg-faint">No staff on your roster yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {staff.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm text-fg">
                <input type="checkbox" checked={eligible.includes(s.id)} onChange={() => toggleStaff(s.id)} />
                {s.name}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Buffer before (min)"
          type="number"
          min={0}
          value={draft.bufferBeforeMin ?? 0}
          onChange={(e) => setDraft((d) => ({ ...d, bufferBeforeMin: Number(e.target.value) }))}
        />
        <Input
          label="Buffer after (min)"
          type="number"
          min={0}
          value={draft.bufferAfterMin ?? 0}
          onChange={(e) => setDraft((d) => ({ ...d, bufferAfterMin: Number(e.target.value) }))}
        />
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-fg">
          <input
            type="checkbox"
            checked={draft.depositRequired ?? false}
            onChange={(e) => setDraft((d) => ({ ...d, depositRequired: e.target.checked }))}
          />
          Require a deposit to book
        </label>
        {draft.depositRequired && (
          <Input
            label="Deposit amount"
            type="number"
            min={0}
            step="0.01"
            className="mt-2"
            value={draft.depositAmount ?? 0}
            onChange={(e) => setDraft((d) => ({ ...d, depositAmount: Number(e.target.value) }))}
          />
        )}
      </div>
    </div>
  );
}

function ProductFormPanel({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const [draft, setDraft] = useState<Omit<Product, "id" | "active">>(() => product ?? emptyDraft());
  const queryClient = useQueryClient();
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories, staleTime: 5 * 60 * 1000 });

  const margin = marginPercent(draft.price, draft.costPrice);
  const marginTone = margin < 10 ? "text-destructive" : margin < 30 ? "text-accent-foreground" : "text-whatsapp";

  const mutation = useMutation({
    mutationFn: () =>
      product ? updateProduct(product.id, { ...draft, active: product.active }) : createProduct({ ...draft, active: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(product ? `"${draft.name}" updated.` : `"${draft.name}" added.`);
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save this product — please try again.");
    },
  });

  function updateVariation(index: number, patch: Partial<ProductVariation>) {
    setDraft((d) => ({
      ...d,
      variations: d.variations.map((v, i) => (i === index ? { ...v, ...patch } : v)),
    }));
  }

  function addVariation() {
    setDraft((d) => ({ ...d, variations: [...d.variations, { name: "", price: d.price }] }));
  }

  function removeVariation(index: number) {
    setDraft((d) => ({ ...d, variations: d.variations.filter((_, i) => i !== index) }));
  }

  return (
    <div className="fixed inset-0 z-[100]">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[#1c231e]/45" />
      <div className="animate-sheet-in absolute inset-y-0 end-0 flex w-full max-w-md flex-col border-s border-border bg-surface shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-display text-base font-semibold text-fg">{product ? "Edit product" : "Add product"}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-fg-faint hover:bg-surface-2"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2 rounded-full bg-surface-2 p-1">
              {(["product", "service"] as ProductKind[]).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, kind }))}
                  className={cn(
                    "rounded-full px-3 py-2 text-sm font-medium capitalize transition-colors",
                    draft.kind === kind ? "bg-surface text-fg shadow-[var(--shadow-sm)]" : "text-fg-muted hover:text-fg",
                  )}
                >
                  {kind}
                </button>
              ))}
            </div>

            <Input
              label="Name"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />

            <Select
              label="Category"
              value={draft.categoryId ?? ""}
              onChange={(e) => {
                const cat = categories?.find((c) => c.id === e.target.value);
                setDraft((d) => ({ ...d, categoryId: e.target.value || undefined, category: cat?.name ?? "" }));
              }}
            >
              <option value="">No category</option>
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Price"
                type="number"
                min={0}
                step="0.01"
                value={draft.price}
                onChange={(e) => setDraft((d) => ({ ...d, price: Number(e.target.value) }))}
              />
              <Input
                label="Cost price"
                type="number"
                min={0}
                step="0.01"
                value={draft.costPrice}
                onChange={(e) => setDraft((d) => ({ ...d, costPrice: Number(e.target.value) }))}
              />
            </div>

            <p className={cn("text-sm font-medium", marginTone)}>Margin: {margin.toFixed(1)}%</p>

            {draft.kind === "service" ? (
              <>
                <Input
                  label="Duration (minutes)"
                  type="number"
                  min={5}
                  step={5}
                  value={draft.durationMinutes ?? 30}
                  onChange={(e) => setDraft((d) => ({ ...d, durationMinutes: Number(e.target.value) }))}
                />
                <ServiceFormalFields draft={draft} setDraft={setDraft} />
              </>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="SKU"
                  value={draft.sku ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, sku: e.target.value }))}
                />
                <Input
                  label="Stock on hand"
                  type="number"
                  min={0}
                  value={draft.stockOnHand ?? 0}
                  onChange={(e) => setDraft((d) => ({ ...d, stockOnHand: Number(e.target.value) }))}
                />
              </div>
            )}

            <div className="border-t border-border pt-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-fg">Variations</p>
                <Button type="button" variant="ghost" size="sm" onClick={addVariation}>
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Add
                </Button>
              </div>
              {draft.variations.length === 0 ? (
                <p className="text-xs text-fg-faint">No variations — this item is sold at the base price only.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {draft.variations.map((v, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={v.name}
                        placeholder="Variation name"
                        onChange={(e) => updateVariation(i, { name: e.target.value })}
                        className="h-10 flex-1 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 text-sm text-fg focus:border-primary focus:ring-2 focus:ring-primary/15"
                      />
                      <input
                        value={v.price}
                        type="number"
                        min={0}
                        step="0.01"
                        onChange={(e) => updateVariation(i, { price: Number(e.target.value) })}
                        className="h-10 w-24 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 text-sm text-fg focus:border-primary focus:ring-2 focus:ring-primary/15"
                      />
                      <button
                        type="button"
                        onClick={() => removeVariation(i)}
                        aria-label="Remove variation"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-fg-faint hover:bg-destructive/8 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!draft.name.trim() || mutation.isPending}>
            {mutation.isPending ? "Saving…" : product ? "Save changes" : "Add product"}
          </Button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageOff, Trash2, X } from "lucide-react";
import { SlideDrawer } from "@/components/dashboard/slide-drawer";
import { marginPercent, type Product, type ProductKind, type ProductVariation } from "@/lib/products";
import { createProduct, updateProduct, uploadProductPhoto, removeProductPhoto } from "@/lib/products-api";
import { fetchCategories } from "@/lib/categories-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const fieldLabel: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", marginBottom: 5 };
const fieldStyle: React.CSSProperties = { width: "100%", border: "1px solid var(--app-border)", borderRadius: 11, padding: 12, fontSize: 13.5, fontWeight: 700, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 48 };
const cancelBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "12px 16px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)" };
const primaryBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "12px 16px", fontSize: 13, fontWeight: 800, color: "#fff" };

function emptyDraft(kind: ProductKind): Omit<Product, "id" | "active"> {
  return { name: "", category: "", kind, price: 0, costPrice: 0, stockOnHand: 0, lowStockThreshold: 5, variations: [] };
}

/** "Add/Edit Product", pixel-matched to the design's `dProduct` drawer — a lightweight quick-entry
 * form. Product photos upload to real S3/local-disk storage (`POST/DELETE /products/:id/photo`).
 * For a brand-new product there's no id yet, so the file is held locally and uploaded right after
 * `createProduct` returns its id. Services get only the simple duration field here (matching the
 * design); the fuller staff/buffer/deposit configuration lives in the dedicated Service drawer
 * opened from the Services screen. */
export function ProductFormDrawer({
  open,
  onClose,
  product,
  forceKind,
}: {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  forceKind?: ProductKind;
}) {
  return (
    <SlideDrawer open={open} onClose={onClose} title={product ? "Edit Product" : "Add Product"}>
      {open && <ProductFormBody key={product?.id ?? "new"} product={product} forceKind={forceKind} onClose={onClose} />}
    </SlideDrawer>
  );
}

function ProductFormBody({ product, forceKind, onClose }: { product: Product | null; forceKind?: ProductKind; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Omit<Product, "id" | "active">>(() => product ?? emptyDraft(forceKind ?? "product"));
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [removingPhoto, setRemovingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories, staleTime: 5 * 60_000 });

  const margin = marginPercent(draft.price, draft.costPrice);
  const marginColor = margin < 10 ? "var(--app-danger-strong)" : margin < 30 ? "var(--app-warning-text)" : "var(--app-primary)";
  const displayedPhoto = photoPreview ?? (removingPhoto ? null : product?.photoUrl ?? null);

  function pickPhoto(file: File) {
    setPhotoFile(file);
    setRemovingPhoto(false);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function clearPhoto() {
    setPhotoFile(null);
    setPhotoPreview(null);
    setRemovingPhoto(true);
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const saved = product ? await updateProduct(product.id, { ...draft, active: product.active }) : await createProduct({ ...draft, active: true });
      if (photoFile) {
        await uploadProductPhoto(saved.id, photoFile);
      } else if (removingPhoto && product?.photoUrl) {
        await removeProductPhoto(saved.id);
      }
      return saved;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success(product ? `"${draft.name}" updated.` : `"${draft.name}" added.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this product — please try again."),
  });

  function updateVariation(index: number, patch: Partial<ProductVariation>) {
    setDraft((d) => ({ ...d, variations: d.variations.map((v, i) => (i === index ? { ...v, ...patch } : v)) }));
  }
  function addVariation() {
    setDraft((d) => ({ ...d, variations: [...d.variations, { name: "", price: d.price }] }));
  }
  function removeVariation(index: number) {
    setDraft((d) => ({ ...d, variations: d.variations.filter((_, i) => i !== index) }));
  }

  return (
    <div className="flex flex-col gap-[13px]">
      <div className="flex items-center gap-[13px]">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pickPhoto(f);
            e.target.value = "";
          }}
        />
        <span className="relative flex h-[76px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-[13px]" style={{ background: "var(--app-surface-2)", border: displayedPhoto ? "1px solid var(--app-border)" : "1px dashed var(--app-border-strong)" }}>
          {displayedPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element -- object-URL preview and signed S3 URLs aren't Next/Image-friendly remote hosts
            <img src={displayedPhoto} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageOff className="h-6 w-6" style={{ color: "var(--app-text-disabled)" }} aria-hidden />
          )}
          {displayedPhoto && (
            <button type="button" onClick={clearPhoto} aria-label="Remove photo" className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full" style={{ background: "rgba(16,24,40,.55)", color: "#fff" }}>
              <X className="h-3 w-3" aria-hidden />
            </button>
          )}
        </span>
        <button type="button" onClick={() => fileInputRef.current?.click()} className="text-[12px] font-bold" style={{ color: "var(--app-success-text)" }}>
          {displayedPhoto ? "Change photo" : "Upload photo"}
        </button>
      </div>

      {!forceKind && (
        <div className="grid grid-cols-2 gap-2 rounded-full p-1" style={{ background: "var(--app-surface-2)" }}>
          {(["product", "service"] as ProductKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setDraft((d) => ({ ...d, kind: k }))}
              className="rounded-full px-3 py-2 text-[12.5px] font-bold capitalize"
              style={draft.kind === k ? { background: "var(--app-surface)", color: "var(--app-text)", boxShadow: "0 1px 2px rgba(16,24,40,.08)" } : { color: "var(--app-text-faint)" }}
            >
              {k}
            </button>
          ))}
        </div>
      )}

      <label className="block">
        <span style={fieldLabel}>NAME</span>
        <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="e.g. Premium Hair Oil" style={fieldStyle} />
      </label>

      <label className="block">
        <span style={fieldLabel}>CATEGORY</span>
        <select
          value={draft.categoryId ?? ""}
          onChange={(e) => {
            const cat = categories?.find((c) => c.id === e.target.value);
            setDraft((d) => ({ ...d, categoryId: e.target.value || undefined, category: cat?.name ?? "" }));
          }}
          style={fieldStyle}
        >
          <option value="">No category</option>
          {(categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>

      {draft.kind === "product" && (
        <div className="rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
          <div className="mb-2 text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>VARIATIONS</div>
          {draft.variations.length > 0 && (
            <div className="mb-2 flex flex-col gap-2">
              {draft.variations.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={v.name} onChange={(e) => updateVariation(i, { name: e.target.value })} placeholder="e.g. Size" className="flex-1 rounded-[9px] p-2.5 text-[12.5px]" style={{ border: "1px solid var(--app-border)" }} />
                  <input type="number" min={0} value={v.price} onChange={(e) => updateVariation(i, { price: Number(e.target.value) })} className="w-24 rounded-[9px] p-2.5 text-[12.5px]" style={{ border: "1px solid var(--app-border)" }} />
                  <button type="button" onClick={() => removeVariation(i)} aria-label="Remove variation" style={{ color: "var(--app-border-strong)" }}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={addVariation} className="w-full rounded-[10px] p-[9px_12px] text-[12px] font-bold" style={{ border: "1px dashed var(--app-border-strong)", color: "var(--app-primary-hover, #0E8442)" }}>
            + Add variation row
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <label className="block">
          <span style={fieldLabel}>COST PRICE</span>
          <input type="number" min={0} value={draft.costPrice} onChange={(e) => setDraft((d) => ({ ...d, costPrice: Number(e.target.value) }))} placeholder="0" style={fieldStyle} />
        </label>
        <label className="block">
          <span style={fieldLabel}>SELLING PRICE</span>
          <input type="number" min={0} value={draft.price} onChange={(e) => setDraft((d) => ({ ...d, price: Number(e.target.value) }))} placeholder="0" style={fieldStyle} />
        </label>
      </div>

      <div className="flex items-center gap-2.5 rounded-[12px] p-3" style={{ background: "var(--app-page-bg, #F7FCF9)", border: "1px solid var(--app-success-border)" }}>
        <span className="text-[12.5px] font-bold" style={{ color: "var(--app-success-text)" }}>Live margin</span>
        <span className="ms-auto text-[19px] font-extrabold" style={{ color: marginColor }}>{margin.toFixed(0)}%</span>
      </div>

      {draft.kind === "product" ? (
        <div className="grid grid-cols-2 gap-2.5">
          <label className="block">
            <span style={fieldLabel}>STOCK</span>
            <input type="number" min={0} value={draft.stockOnHand ?? 0} onChange={(e) => setDraft((d) => ({ ...d, stockOnHand: Number(e.target.value) }))} style={fieldStyle} />
          </label>
          <label className="block">
            <span style={fieldLabel}>LOW STOCK THRESHOLD</span>
            <input type="number" min={0} value={draft.lowStockThreshold ?? 5} onChange={(e) => setDraft((d) => ({ ...d, lowStockThreshold: Number(e.target.value) }))} style={fieldStyle} />
          </label>
        </div>
      ) : (
        <label className="block">
          <span style={fieldLabel}>DURATION (MINUTES)</span>
          <input type="number" min={5} step={5} value={draft.durationMinutes ?? 30} onChange={(e) => setDraft((d) => ({ ...d, durationMinutes: Number(e.target.value) }))} placeholder="e.g. 45" style={fieldStyle} />
        </label>
      )}

      {draft.kind === "product" && (
        <label className="block">
          <span style={fieldLabel}>SKU</span>
          <input value={draft.sku ?? ""} onChange={(e) => setDraft((d) => ({ ...d, sku: e.target.value }))} placeholder="e.g. NX-1001" style={fieldStyle} />
        </label>
      )}

      <div className="flex gap-2.5 border-t pt-3.5" style={{ borderColor: "var(--app-surface-2)" }}>
        <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
        <button type="button" onClick={() => mutation.mutate()} disabled={!draft.name.trim() || mutation.isPending} style={{ ...cancelBtn, opacity: !draft.name.trim() || mutation.isPending ? 0.6 : 1 }}>
          Save &amp; Close
        </button>
        <button type="button" onClick={() => mutation.mutate()} disabled={!draft.name.trim() || mutation.isPending} className="flex-1" style={{ ...primaryBtn, opacity: !draft.name.trim() || mutation.isPending ? 0.6 : 1 }}>
          {mutation.isPending ? "Saving…" : product ? "Save Product" : "Add Product"}
        </button>
      </div>
    </div>
  );
}

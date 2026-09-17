"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SlideDrawer } from "@/components/dashboard/slide-drawer";
import { createProduct, updateProduct } from "@/lib/products-api";
import { fetchCategories } from "@/lib/categories-api";
import { fetchStaffList } from "@/lib/staff-api";
import type { Product } from "@/lib/products";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const fieldLabel: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", marginBottom: 5 };
const fieldStyle: React.CSSProperties = { width: "100%", border: "1px solid var(--app-border)", borderRadius: 11, padding: 12, fontSize: 13.5, fontWeight: 700, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 48 };
const cancelBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "12px 16px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)" };
const primaryBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "12px 16px", fontSize: 13, fontWeight: 800, color: "#fff" };

interface ServiceDraft {
  name: string;
  categoryId?: string;
  category: string;
  durationMinutes: number;
  price: number;
  eligibleStaffIds: string[];
  bufferBeforeMin: number;
  bufferAfterMin: number;
  depositRequired: boolean;
  depositAmount: number;
}

function toDraft(product: Product | null): ServiceDraft {
  return {
    name: product?.name ?? "",
    categoryId: product?.categoryId,
    category: product?.category ?? "",
    durationMinutes: product?.durationMinutes ?? 30,
    price: product?.price ?? 0,
    eligibleStaffIds: product?.eligibleStaffIds ?? [],
    bufferBeforeMin: product?.bufferBeforeMin ?? 0,
    bufferAfterMin: product?.bufferAfterMin ?? 0,
    depositRequired: product?.depositRequired ?? false,
    depositAmount: product?.depositAmount ?? 0,
  };
}

/** "Add/Edit Service" — the dedicated, fuller drawer from the design's `dService` state (staff
 * eligibility, buffers, deposit), distinct from the lightweight general Product drawer. The
 * design's own "Bookable online" toggle has no real backing field anywhere in the schema, so it's
 * left out rather than faked. */
export function ServiceFormDrawer({ open, onClose, product }: { open: boolean; onClose: () => void; product: Product | null }) {
  return (
    <SlideDrawer open={open} onClose={onClose} title={product ? "Edit Service" : "Add Service"}>
      {open && <ServiceFormBody key={product?.id ?? "new"} product={product} onClose={onClose} />}
    </SlideDrawer>
  );
}

function ServiceFormBody({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ServiceDraft>(() => toDraft(product));
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories, staleTime: 5 * 60_000 });
  const { data: staff } = useQuery({ queryKey: ["staff-roster"], queryFn: fetchStaffList, staleTime: 5 * 60_000 });

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: draft.name,
        category: draft.category,
        categoryId: draft.categoryId,
        kind: "service" as const,
        price: draft.price,
        costPrice: product?.costPrice ?? 0,
        durationMinutes: draft.durationMinutes,
        variations: product?.variations ?? [],
        eligibleStaffIds: draft.eligibleStaffIds,
        bufferBeforeMin: draft.bufferBeforeMin,
        bufferAfterMin: draft.bufferAfterMin,
        depositRequired: draft.depositRequired,
        depositAmount: draft.depositRequired ? draft.depositAmount : undefined,
      };
      return product ? updateProduct(product.id, { ...payload, active: product.active }) : createProduct({ ...payload, active: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(product ? `"${draft.name}" updated.` : `"${draft.name}" added.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this service — please try again."),
  });

  function toggleStaff(id: string) {
    setDraft((d) => ({ ...d, eligibleStaffIds: d.eligibleStaffIds.includes(id) ? d.eligibleStaffIds.filter((s) => s !== id) : [...d.eligibleStaffIds, id] }));
  }

  return (
    <div className="flex flex-col gap-[13px]">
      <label className="block">
        <span style={fieldLabel}>NAME</span>
        <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="e.g. Haircut & Styling" style={fieldStyle} />
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

      <div className="grid grid-cols-2 gap-2.5">
        <label className="block">
          <span style={fieldLabel}>DURATION (MIN)</span>
          <input type="number" min={5} step={5} value={draft.durationMinutes} onChange={(e) => setDraft((d) => ({ ...d, durationMinutes: Number(e.target.value) }))} style={fieldStyle} />
        </label>
        <label className="block">
          <span style={fieldLabel}>PRICE</span>
          <input type="number" min={0} value={draft.price} onChange={(e) => setDraft((d) => ({ ...d, price: Number(e.target.value) }))} style={fieldStyle} />
        </label>
      </div>

      <div>
        <span style={fieldLabel}>STAFF WHO CAN PERFORM IT</span>
        {!staff || staff.length === 0 ? (
          <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No staff on your roster yet — leave unchecked to allow any staff.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {staff.map((s) => (
              <label key={s.id} className="flex items-center gap-2.5 rounded-[11px] p-[11px]" style={{ border: "1px solid var(--app-border)" }}>
                <input type="checkbox" checked={draft.eligibleStaffIds.includes(s.id)} onChange={() => toggleStaff(s.id)} style={{ accentColor: "var(--app-primary)" }} />
                <span className="text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{s.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <label className="block">
          <span style={fieldLabel}>BUFFER BEFORE</span>
          <input type="number" min={0} value={draft.bufferBeforeMin} onChange={(e) => setDraft((d) => ({ ...d, bufferBeforeMin: Number(e.target.value) }))} style={fieldStyle} />
        </label>
        <label className="block">
          <span style={fieldLabel}>BUFFER AFTER</span>
          <input type="number" min={0} value={draft.bufferAfterMin} onChange={(e) => setDraft((d) => ({ ...d, bufferAfterMin: Number(e.target.value) }))} style={fieldStyle} />
        </label>
      </div>

      <div className="flex items-center gap-3 rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
        <span className="flex-1 text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>Deposit required</span>
        <button
          type="button"
          role="switch"
          aria-checked={draft.depositRequired}
          onClick={() => setDraft((d) => ({ ...d, depositRequired: !d.depositRequired }))}
          className="relative h-[22px] w-10 shrink-0 rounded-full"
          style={{ background: draft.depositRequired ? "var(--app-primary)" : "var(--app-border-strong)" }}
        >
          <span className="absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white transition-all" style={{ left: draft.depositRequired ? 20 : 2 }} />
        </button>
      </div>

      {draft.depositRequired && (
        <label className="block">
          <span style={fieldLabel}>DEPOSIT AMOUNT</span>
          <input type="number" min={0} value={draft.depositAmount} onChange={(e) => setDraft((d) => ({ ...d, depositAmount: Number(e.target.value) }))} placeholder="0" style={fieldStyle} />
        </label>
      )}

      <div className="flex gap-2.5 border-t pt-3.5" style={{ borderColor: "var(--app-surface-2)" }}>
        <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
        <button type="button" onClick={() => mutation.mutate()} disabled={!draft.name.trim() || mutation.isPending} className="flex-1" style={{ ...primaryBtn, opacity: !draft.name.trim() || mutation.isPending ? 0.6 : 1 }}>
          {mutation.isPending ? "Saving…" : "Save Service"}
        </button>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/format";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { fetchProducts } from "@/lib/products-api";
import {
  applyVariantSet,
  createVariantSet,
  deleteVariantSet,
  fetchVariantSets,
  updateVariantSet,
  type LiveVariantSet,
  type VariantOptionInput,
} from "@/lib/variants-api";
import { PosModalShell } from "@/components/pos/pos-modal-shell";

const cancelBtn: React.CSSProperties = { background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" };
const primaryBtn: React.CSSProperties = { background: "var(--app-primary)", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff" };
const dangerBtn: React.CSSProperties = { background: "var(--app-danger-strong)", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff" };
const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const primaryHeaderBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };
const smallOutline: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 12px", fontSize: 12, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 40 };

export function VariantsPanel() {
  const session = useSession();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LiveVariantSet | null>(null);
  const [applying, setApplying] = useState<LiveVariantSet | null>(null);
  const [deleting, setDeleting] = useState<LiveVariantSet | null>(null);

  const { data: sets } = useQuery({ queryKey: ["variant-sets"], queryFn: fetchVariantSets });
  const { data: products } = useQuery({ queryKey: ["products", "all-for-variants"], queryFn: () => fetchProducts() });

  const usedByName = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products ?? []) {
      for (const v of p.variations) {
        map.set(v.name, (map.get(v.name) ?? 0) + 1);
      }
    }
    return map;
  }, [products]);

  const totalUsed = useMemo(() => {
    const ids = new Set<string>();
    for (const p of products ?? []) {
      if (p.variations.length > 0 && (sets ?? []).some((s) => p.variations.some((v) => v.name === s.name))) ids.add(p.id);
    }
    return ids.size;
  }, [products, sets]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteVariantSet(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["variant-sets"] });
      toast.success("Variant set deleted.");
      setDeleting(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't delete this variant set — please try again."),
  });

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Variants</h2>
        <div className="ms-auto flex flex-wrap gap-2.5">
          <button type="button" onClick={() => setApplying(sets?.[0] ?? null)} disabled={!sets || sets.length === 0} style={{ ...outlineBtn, opacity: !sets || sets.length === 0 ? 0.5 : 1 }}>Apply to Products</button>
          <button type="button" onClick={() => setCreating(true)} style={primaryHeaderBtn}>+ Add Variant Set</button>
        </div>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Variant Sets</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{sets?.length ?? "—"}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Products Using Variants</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{totalUsed}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        {sets && sets.length === 0 ? (
          <div className="p-[52px_18px] text-center">
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Add a variant set — for example Size: Small, Medium, Large</div>
            <button type="button" onClick={() => setCreating(true)} className="mt-[15px] rounded-[11px] px-5 py-3 text-[12.5px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>Add Variant Set</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 700 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Set Name</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Options</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Products Using It</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(sets ?? []).map((v) => (
                  <tr key={v.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                    <td className="p-[12px_17px] text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{v.name}</td>
                    <td className="p-[12px]">
                      <span className="text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>
                        {v.options.map((o) => (o.priceOverride != null ? `${o.name} (${formatCurrency(o.priceOverride, session.business.currency)})` : o.name)).join(", ")}
                      </span>
                      <span className="mt-0.5 block text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{v.options.length} option(s)</span>
                    </td>
                    <td className="p-[12px] text-end text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>{usedByName.get(v.name) ?? 0}</td>
                    <td className="p-[12px_17px] text-end">
                      <span className="inline-flex gap-1.5">
                        <button type="button" onClick={() => setApplying(v)} style={smallOutline}>Apply</button>
                        <button type="button" onClick={() => setEditing(v)} style={smallOutline}>Edit</button>
                        <button type="button" onClick={() => setDeleting(v)} style={{ ...smallOutline, color: "var(--app-text-faintest)" }}>Delete</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <VariantSetFormModal open={creating} onClose={() => setCreating(false)} />
      {editing && <VariantSetFormModal open onClose={() => setEditing(null)} variantSet={editing} />}
      {applying && <ApplyVariantSetModal variantSet={applying} sets={sets ?? []} onClose={() => setApplying(null)} />}

      <PosModalShell
        open={deleting != null}
        onClose={() => setDeleting(null)}
        title="Delete Variant Set"
        footer={
          <>
            <button type="button" onClick={() => setDeleting(null)} style={cancelBtn}>Cancel</button>
            <button type="button" onClick={() => deleting && deleteMutation.mutate(deleting.id)} disabled={deleteMutation.isPending} style={{ ...dangerBtn, opacity: deleteMutation.isPending ? 0.6 : 1 }}>
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </button>
          </>
        }
      >
        <p className="m-0 p-[17px] text-[13px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>Products that already have these options applied keep them — only the reusable template is removed.</p>
      </PosModalShell>
    </main>
  );
}

function VariantSetFormModal({ open, onClose, variantSet }: { open: boolean; onClose: () => void; variantSet?: LiveVariantSet }) {
  const [name, setName] = useState(variantSet?.name ?? "");
  const [options, setOptions] = useState<VariantOptionInput[]>(
    variantSet ? variantSet.options.map((o) => ({ name: o.name, priceOverride: o.priceOverride ?? undefined })) : [{ name: "" }],
  );
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => {
      const cleanOptions = options.filter((o) => o.name.trim());
      return variantSet ? updateVariantSet(variantSet.id, { name, options: cleanOptions }) : createVariantSet({ name, options: cleanOptions });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["variant-sets"] });
      toast.success(variantSet ? "Variant set updated." : "Variant set created.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this variant set — please try again."),
  });

  function updateOption(i: number, patch: Partial<VariantOptionInput>) {
    setOptions((opts) => opts.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  }
  const validOptionCount = options.filter((o) => o.name.trim()).length;

  return (
    <PosModalShell
      open={open}
      onClose={onClose}
      title={variantSet ? "Edit Variant Set" : "New Variant Set"}
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!name.trim() || validOptionCount === 0 || mutation.isPending} style={{ ...primaryBtn, opacity: !name.trim() || validOptionCount === 0 ? 0.6 : 1 }}>
            {mutation.isPending ? "Saving…" : "Save Variant Set"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 p-[17px]">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>SET NAME</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Size" className="w-full rounded-[11px] p-3 text-[13.5px]" style={{ border: "1px solid var(--app-border)" }} />
        </label>
        <div className="rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
          <div className="mb-2 flex gap-2 text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>
            <span className="flex-[1.4]">OPTION</span>
            <span className="flex-1">PRICE ADJ.</span>
          </div>
          <div className="flex flex-col gap-2">
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={o.name} onChange={(e) => updateOption(i, { name: e.target.value })} placeholder="Option name" className="flex-[1.4] rounded-[9px] p-2.5 text-[12.5px]" style={{ border: "1px solid var(--app-border)" }} />
                <input type="number" value={o.priceOverride ?? ""} onChange={(e) => updateOption(i, { priceOverride: e.target.value ? Number(e.target.value) : undefined })} placeholder="Price" className="flex-1 rounded-[9px] p-2.5 text-[12.5px]" style={{ border: "1px solid var(--app-border)" }} />
                <button type="button" onClick={() => setOptions((opts) => opts.filter((_, idx) => idx !== i))} aria-label="Remove option" style={{ color: "var(--app-border-strong)" }}>×</button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setOptions((opts) => [...opts, { name: "" }])} className="mt-2.5 w-full rounded-[10px] p-[9px_12px] text-[12px] font-bold" style={{ border: "1px dashed var(--app-border-strong)", color: "var(--app-primary-hover, #0E8442)" }}>+ Add option</button>
        </div>
      </div>
    </PosModalShell>
  );
}

function ApplyVariantSetModal({ variantSet, sets, onClose }: { variantSet: LiveVariantSet; sets: LiveVariantSet[]; onClose: () => void }) {
  const [setId, setSetId] = useState(variantSet.id);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { data: products } = useQuery({ queryKey: ["products", "all-for-variants-apply"], queryFn: () => fetchProducts() });
  const queryClient = useQueryClient();
  const activeSet = sets.find((s) => s.id === setId) ?? variantSet;

  const mutation = useMutation({
    mutationFn: () => applyVariantSet(setId, Array.from(selected)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(`Applied "${activeSet.name}" to ${selected.size} product(s).`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't apply this variant set — please try again."),
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <PosModalShell
      open
      onClose={onClose}
      title="Apply to Products"
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={selected.size === 0 || mutation.isPending} style={{ ...primaryBtn, opacity: selected.size === 0 ? 0.6 : 1 }}>
            {mutation.isPending ? "Applying…" : `Apply to ${selected.size} product(s)`}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 p-[17px]">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>VARIANT SET</span>
          <select value={setId} onChange={(e) => setSetId(e.target.value)} className="w-full rounded-[11px] p-3 text-[13px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
            {sets.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <div className="max-h-72 overflow-y-auto rounded-[11px]" style={{ border: "1px solid var(--app-border)" }}>
          {(products ?? []).map((p) => (
            <label key={p.id} className="flex items-center gap-2.5 p-[10px_13px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
              <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} style={{ accentColor: "var(--app-primary)" }} />
              <span className="text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{p.name}</span>
            </label>
          ))}
        </div>
      </div>
    </PosModalShell>
  );
}

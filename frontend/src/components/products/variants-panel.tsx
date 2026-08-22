"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, Plus, Trash2, Pencil, CheckSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { formatCurrency } from "@/lib/format";
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

export function VariantsPanel({ currency }: { currency: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<LiveVariantSet | null>(null);
  const [creating, setCreating] = useState(false);
  const [applying, setApplying] = useState<LiveVariantSet | null>(null);
  const [deleting, setDeleting] = useState<LiveVariantSet | null>(null);

  const { data: sets, isPending, isError, refetch } = useQuery({
    queryKey: ["variant-sets"],
    queryFn: fetchVariantSets,
  });

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
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          New variant set
        </Button>
      </div>

      {isError && <ErrorBanner title="Couldn't load variant sets" onRetry={() => refetch()} />}

      {isPending && (
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <SkeletonRow />
            <SkeletonRow />
          </CardContent>
        </Card>
      )}

      {sets && sets.length === 0 && (
        <Card>
          <CardContent>
            <EmptyState icon={Layers} title="No variant sets yet" description="Create a reusable set like &quot;Size&quot; to apply across many products at once." />
          </CardContent>
        </Card>
      )}

      {sets && sets.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {sets.map((set) => (
            <Card key={set.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{set.name}</p>
                  <p className="truncate text-xs text-fg-muted">
                    {set.options
                      .map((o) => (o.priceOverride != null ? `${o.name} (${formatCurrency(o.priceOverride, currency)})` : o.name))
                      .join(", ")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => setApplying(set)}>
                    <CheckSquare className="h-3.5 w-3.5" aria-hidden />
                    Apply
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(set)} aria-label="Edit">
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleting(set)} aria-label="Delete">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <VariantSetFormDialog open={creating} onClose={() => setCreating(false)} />
      {editing && <VariantSetFormDialog open onClose={() => setEditing(null)} variantSet={editing} />}
      <ApplyVariantSetDialog variantSet={applying} onClose={() => setApplying(null)} />

      <Dialog
        open={deleting != null}
        onClose={() => setDeleting(null)}
        title="Delete this variant set?"
        description="Products that already have these options applied keep them — only the reusable template is removed."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => deleting && deleteMutation.mutate(deleting.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </>
        }
      />
    </div>
  );
}

function VariantSetFormDialog({ open, onClose, variantSet }: { open: boolean; onClose: () => void; variantSet?: LiveVariantSet }) {
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
    <Dialog
      open={open}
      onClose={onClose}
      title={variantSet ? "Edit variant set" : "New variant set"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!name.trim() || validOptionCount === 0 || mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Size" />
        <div>
          <p className="mb-1.5 text-sm font-medium text-fg">Options</p>
          <div className="flex flex-col gap-2">
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={o.name}
                  onChange={(e) => updateOption(i, { name: e.target.value })}
                  placeholder="Option name"
                  className="flex-1"
                />
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={o.priceOverride ?? ""}
                  onChange={(e) => updateOption(i, { priceOverride: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="Price"
                  className="w-28"
                />
                <Button variant="ghost" size="sm" onClick={() => setOptions((opts) => opts.filter((_, idx) => idx !== i))} aria-label="Remove option">
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setOptions((opts) => [...opts, { name: "" }])}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add option
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function ApplyVariantSetDialog({ variantSet, onClose }: { variantSet: LiveVariantSet | null; onClose: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { data: products } = useQuery({ queryKey: ["products", "all-for-variants"], queryFn: () => fetchProducts(), enabled: variantSet != null });
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => applyVariantSet(variantSet!.id, Array.from(selected)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(`Applied "${variantSet?.name}" to ${selected.size} product(s).`);
      handleClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't apply this variant set — please try again."),
  });

  function handleClose() {
    setSelected(new Set());
    onClose();
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Dialog
      open={variantSet != null}
      onClose={handleClose}
      title={variantSet ? `Apply "${variantSet.name}" to products` : "Apply"}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={selected.size === 0 || mutation.isPending}>
            {mutation.isPending ? "Applying…" : `Apply to ${selected.size} product(s)`}
          </Button>
        </>
      }
    >
      <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
        {(products ?? []).map((p) => (
          <label key={p.id} className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm text-fg hover:bg-surface-2">
            <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
            {p.name}
          </label>
        ))}
      </div>
    </Dialog>
  );
}

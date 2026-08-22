"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Truck, Plus, Trash2, Pencil, ClipboardList } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
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
  createSupplier,
  deleteSupplier,
  fetchSuppliers,
  quickPurchaseOrder,
  updateSupplier,
  type LiveSupplier,
  type QuickPoLine,
} from "@/lib/suppliers-api";

export function SuppliersPanel({ currency }: { currency: string }) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LiveSupplier | null>(null);
  const [poFor, setPoFor] = useState<LiveSupplier | null>(null);
  const [deleting, setDeleting] = useState<LiveSupplier | null>(null);

  const { data: suppliers, isPending, isError, refetch } = useQuery({ queryKey: ["suppliers"], queryFn: fetchSuppliers });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSupplier(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Supplier removed.");
      setDeleting(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't remove this supplier — please try again."),
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add supplier
        </Button>
      </div>

      {isError && <ErrorBanner title="Couldn't load suppliers" onRetry={() => refetch()} />}

      {isPending && (
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <SkeletonRow />
            <SkeletonRow />
          </CardContent>
        </Card>
      )}

      {suppliers && suppliers.length === 0 && (
        <Card>
          <CardContent>
            <EmptyState icon={Truck} title="No suppliers yet" description="Add a supplier to track where your stock comes from." />
          </CardContent>
        </Card>
      )}

      {suppliers && suppliers.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {suppliers.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{s.name}</p>
                  <p className="truncate text-xs text-fg-muted">{[s.phone, s.email].filter(Boolean).join(" · ") || "No contact info"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => setPoFor(s)}>
                    <ClipboardList className="h-3.5 w-3.5" aria-hidden />
                    Quick PO
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(s)} aria-label="Edit">
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleting(s)} aria-label="Delete">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SupplierFormDialog open={creating} onClose={() => setCreating(false)} />
      {editing && <SupplierFormDialog open onClose={() => setEditing(null)} supplier={editing} />}
      {poFor && <QuickPoDialog supplier={poFor} onClose={() => setPoFor(null)} currency={currency} />}

      <Dialog
        open={deleting != null}
        onClose={() => setDeleting(null)}
        title={deleting ? `Remove "${deleting.name}"?` : "Remove supplier"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => deleting && deleteMutation.mutate(deleting.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Removing…" : "Remove"}
            </Button>
          </>
        }
      />
    </div>
  );
}

function SupplierFormDialog({ open, onClose, supplier }: { open: boolean; onClose: () => void; supplier?: LiveSupplier }) {
  const [name, setName] = useState(supplier?.name ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [email, setEmail] = useState(supplier?.email ?? "");
  const [address, setAddress] = useState(supplier?.address ?? "");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => {
      const draft = { name, phone: phone || undefined, email: email || undefined, address: address || undefined };
      return supplier ? updateSupplier(supplier.id, draft) : createSupplier(draft);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success(supplier ? "Supplier updated." : "Supplier added.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this supplier — please try again."),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={supplier ? "Edit supplier" : "Add supplier"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!name.trim() || mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
    </Dialog>
  );
}

function QuickPoDialog({ supplier, onClose, currency }: { supplier: LiveSupplier; onClose: () => void; currency: string }) {
  const [lines, setLines] = useState<QuickPoLine[]>([{ productId: "", qty: 1, unitCost: 0 }]);
  const { data: products } = useQuery({ queryKey: ["products", "all-for-po"], queryFn: () => fetchProducts({ kind: "product" }) });
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => quickPurchaseOrder(supplier.id, lines.filter((l) => l.productId)),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      const totalUnits = result.lines.reduce((sum, l) => sum + l.qty, 0);
      toast.success(`Recorded a purchase of ${totalUnits} unit(s) from ${supplier.name}.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't record this purchase order — please try again."),
  });

  function updateLine(i: number, patch: Partial<QuickPoLine>) {
    setLines((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  const total = lines.reduce((sum, l) => sum + l.qty * l.unitCost, 0);
  const validLines = lines.filter((l) => l.productId).length;

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Quick PO — ${supplier.name}`}
      description="Records real stock received and updates each product's cost price."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={validLines === 0 || mutation.isPending}>
            {mutation.isPending ? "Recording…" : "Record purchase"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-2">
          {lines.map((line, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select value={line.productId} onChange={(e) => updateLine(i, { productId: e.target.value })} className="flex-1">
                <option value="" disabled>
                  Select a product…
                </option>
                {(products ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              <Input type="number" min={1} value={line.qty} onChange={(e) => updateLine(i, { qty: Math.max(1, Number(e.target.value)) })} className="w-20" placeholder="Qty" />
              <Input type="number" min={0} step="0.01" value={line.unitCost} onChange={(e) => updateLine(i, { unitCost: Number(e.target.value) })} className="w-24" placeholder="Cost" />
              <Button variant="ghost" size="sm" onClick={() => setLines((rows) => rows.filter((_, idx) => idx !== i))} aria-label="Remove line">
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          ))}
        </div>
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setLines((rows) => [...rows, { productId: "", qty: 1, unitCost: 0 }])}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add line
        </Button>
        <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
          <span className="text-fg-muted">Total</span>
          <span className="font-display text-base font-bold tabular-nums text-fg">{formatCurrency(total, currency)}</span>
        </div>
      </div>
    </Dialog>
  );
}

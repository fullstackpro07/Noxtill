"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ArrowRight, Check, Truck, PackageCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { BranchDropdown } from "./branch-dropdown";
import {
  fetchStockTransfers,
  createStockTransfer,
  approveStockTransfer,
  shipStockTransfer,
  receiveStockTransfer,
  rejectStockTransfer,
  type StockTransfer,
  type StockTransferStatus,
} from "@/lib/stock-transfers-api";
import { fetchBranches } from "@/lib/branches-api";
import { fetchProducts } from "@/lib/products-api";
import { formatDate } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const STATUS_TONE: Record<StockTransferStatus, "primary" | "success" | "neutral" | "danger" | "warning"> = {
  pending: "warning",
  approved: "primary",
  shipped: "primary",
  received: "success",
  rejected: "danger",
  cancelled: "neutral",
};

const STATUS_FILTERS: { key: StockTransferStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "shipped", label: "Shipped" },
  { key: "received", label: "Received" },
  { key: "rejected", label: "Rejected" },
];

export function StockTransfersView() {
  const [filter, setFilter] = useState<StockTransferStatus | "all">("all");
  const [creating, setCreating] = useState(false);
  const [rejecting, setRejecting] = useState<StockTransfer | null>(null);
  const queryClient = useQueryClient();

  const { data: transfers = [], isPending, isError, refetch } = useQuery({
    queryKey: ["stock-transfers", filter],
    queryFn: () => fetchStockTransfers(filter === "all" ? undefined : filter),
  });
  const { data: branches = [] } = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? "—";

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
  }

  const approveMutation = useMutation({
    mutationFn: (id: string) => approveStockTransfer(id),
    onSuccess: () => {
      invalidate();
      toast.success("Transfer approved.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't approve this transfer — please try again."),
  });
  const shipMutation = useMutation({
    mutationFn: (id: string) => shipStockTransfer(id),
    onSuccess: () => {
      invalidate();
      toast.success("Marked as shipped — stock deducted from the source branch.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't ship this transfer — please try again."),
  });
  const receiveMutation = useMutation({
    mutationFn: (id: string) => receiveStockTransfer(id),
    onSuccess: () => {
      invalidate();
      toast.success("Marked as received — stock added to your branch.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't receive this transfer — please try again."),
  });
  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => rejectStockTransfer(id, reason),
    onSuccess: () => {
      invalidate();
      toast.success("Transfer rejected.");
      setRejecting(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't reject this transfer — please try again."),
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 overflow-x-auto rounded-full bg-surface-2 p-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f.key ? "bg-surface text-fg shadow-[var(--shadow-sm)]" : "text-fg-muted hover:text-fg"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <BranchDropdown />
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New transfer
          </Button>
        </div>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load stock transfers" description="Check your connection and try again." onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : transfers.length === 0 ? (
        <EmptyState icon={Truck} title="No stock transfers" description="Move inventory between branches — request, approve, ship, and receive." action={{ label: "New transfer", onClick: () => setCreating(true) }} />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                <th className="px-4 py-3 text-start">Items</th>
                <th className="px-4 py-3 text-start">Route</th>
                <th className="px-4 py-3 text-start">Status</th>
                <th className="px-4 py-3 text-start">Created</th>
                <th className="px-4 py-3 text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => {
                return (
                  <tr key={t.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                    <td className="px-4 py-3 text-fg-muted">
                      {t.items.map((i) => i.sourceProduct.name).join(", ")}
                      <span className="ms-1 text-fg-faint">({t.items.reduce((s, i) => s + i.qty, 0)} units)</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-xs text-fg-muted">
                        {branchName(t.sourceBusinessId)} <ArrowRight className="h-3 w-3 shrink-0" aria-hidden /> {branchName(t.destBusinessId)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge>
                      {t.note && <p className="mt-1 max-w-48 truncate text-xs text-fg-faint">{t.note}</p>}
                    </td>
                    <td className="px-4 py-3 text-fg-muted">{formatDate(t.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {t.status === "pending" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => approveMutation.mutate(t.id)} disabled={approveMutation.isPending}>
                              <Check className="h-3.5 w-3.5" aria-hidden />
                              Approve
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setRejecting(t)}>
                              <X className="h-3.5 w-3.5" aria-hidden />
                            </Button>
                          </>
                        )}
                        {t.status === "approved" && (
                          <Button size="sm" variant="outline" onClick={() => shipMutation.mutate(t.id)} disabled={shipMutation.isPending}>
                            <Truck className="h-3.5 w-3.5" aria-hidden />
                            Ship
                          </Button>
                        )}
                        {t.status === "shipped" && (
                          <Button size="sm" variant="outline" onClick={() => receiveMutation.mutate(t.id)} disabled={receiveMutation.isPending}>
                            <PackageCheck className="h-3.5 w-3.5" aria-hidden />
                            Receive
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CreateTransferDialog open={creating} onClose={() => setCreating(false)} />

      <Dialog
        open={rejecting != null}
        onClose={() => setRejecting(null)}
        title="Reject this transfer?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => rejecting && rejectMutation.mutate({ id: rejecting.id })}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending ? "Rejecting…" : "Reject"}
            </Button>
          </>
        }
      />
    </div>
  );
}

function CreateTransferDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <CreateTransferDialogBody onClose={onClose} />;
}

function CreateTransferDialogBody({ onClose }: { onClose: () => void }) {
  const [destBusinessId, setDestBusinessId] = useState("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const queryClient = useQueryClient();

  const { data: branches = [] } = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });
  const { data: products = [] } = useQuery({ queryKey: ["products", "active"], queryFn: () => fetchProducts({ active: true }) });

  const valid = destBusinessId !== "" && productId !== "" && Number(qty) > 0;

  const mutation = useMutation({
    mutationFn: () =>
      createStockTransfer({
        destBusinessId,
        note: note.trim() || undefined,
        items: [{ productId, qty: Number(qty) }],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
      toast.success("Transfer requested.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't create this transfer — please try again."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="New stock transfer"
      description="Sends from your currently selected branch. The destination must match a product by SKU."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending}>
            {mutation.isPending ? "Requesting…" : "Request transfer"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Select label="Destination branch" value={destBusinessId} onChange={(e) => setDestBusinessId(e.target.value)}>
          <option value="">Select…</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <div className="grid grid-cols-[2fr_1fr] gap-3">
          <Select label="Product" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Select…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.sku ? `(${p.sku})` : "— no SKU"}
              </option>
            ))}
          </Select>
          <Input label="Qty" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Dialog>
  );
}

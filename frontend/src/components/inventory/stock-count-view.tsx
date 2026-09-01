"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ClipboardCheck, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import {
  fetchStockCounts,
  createStockCount,
  applyStockCount,
  type StockCount,
} from "@/lib/stock-count-api";
import { fetchProducts } from "@/lib/products-api";
import { formatDate } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function StockCountView() {
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<StockCount | null>(null);
  const queryClient = useQueryClient();

  const { data: counts = [], isPending, isError, refetch } = useQuery({
    queryKey: ["stock-counts"],
    queryFn: () => fetchStockCounts(),
  });

  const applyMutation = useMutation({
    mutationFn: (id: string) => applyStockCount(id),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["stock-counts"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Stock count applied — real adjustments written.");
      setViewing(updated);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't apply this count — please try again."),
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          New count
        </Button>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load stock counts" description="Check your connection and try again." onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : counts.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No stock counts yet" description="Do a physical count and reconcile it against real stock levels." action={{ label: "New count", onClick: () => setCreating(true) }} />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                <th className="px-4 py-3 text-start">Note</th>
                <th className="px-4 py-3 text-start">Items</th>
                <th className="px-4 py-3 text-start">Status</th>
                <th className="px-4 py-3 text-start">Created</th>
                <th className="px-4 py-3 text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {counts.map((c) => (
                <tr key={c.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2/50" onClick={() => setViewing(c)}>
                  <td className="px-4 py-3 text-fg-muted">{c.note ?? "—"}</td>
                  <td className="px-4 py-3 text-fg-muted">{c.lines.length}</td>
                  <td className="px-4 py-3">
                    <Badge tone={c.status === "applied" ? "success" : "neutral"}>{c.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{formatDate(c.createdAt)}</td>
                  <td className="px-4 py-3 text-end">
                    {c.status === "draft" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          applyMutation.mutate(c.id);
                        }}
                        disabled={applyMutation.isPending}
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden />
                        Apply
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && <NewStockCountDialog onClose={() => setCreating(false)} />}

      {viewing && (
        <Dialog open onClose={() => setViewing(null)} title="Stock count" className="max-w-lg">
          <div className="flex flex-col gap-3">
            <div className="overflow-x-auto rounded-[var(--radius-sm)] border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-fg-faint">
                    <th className="px-3 py-2 text-start">Product</th>
                    <th className="px-3 py-2 text-start">Expected</th>
                    <th className="px-3 py-2 text-start">Counted</th>
                    <th className="px-3 py-2 text-start">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {viewing.lines.map((l) => (
                    <tr key={l.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 text-fg">{l.product.name}</td>
                      <td className="px-3 py-2 text-fg-muted">{l.expectedQty}</td>
                      <td className="px-3 py-2 text-fg-muted">{l.countedQty}</td>
                      <td className={`px-3 py-2 font-medium ${l.variance === 0 ? "text-fg-muted" : l.variance > 0 ? "text-whatsapp" : "text-destructive"}`}>
                        {l.variance > 0 ? "+" : ""}
                        {l.variance}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {viewing.status === "draft" && (
              <Button onClick={() => applyMutation.mutate(viewing.id)} disabled={applyMutation.isPending} className="self-end">
                {applyMutation.isPending ? "Applying…" : "Apply adjustments"}
              </Button>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}

function NewStockCountDialog({ onClose }: { onClose: () => void }) {
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<{ productId: string; countedQty: string }[]>([{ productId: "", countedQty: "" }]);
  const { data: products = [] } = useQuery({ queryKey: ["products", "active"], queryFn: () => fetchProducts({ active: true }) });
  const queryClient = useQueryClient();

  function updateLine(i: number, patch: Partial<{ productId: string; countedQty: string }>) {
    setLines((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  const validLines = lines.filter((l) => l.productId && l.countedQty !== "");
  const valid = validLines.length > 0;

  const mutation = useMutation({
    mutationFn: () =>
      createStockCount({
        note: note.trim() || undefined,
        lines: validLines.map((l) => ({ productId: l.productId, countedQty: Number(l.countedQty) })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-counts"] });
      toast.success("Stock count created as a draft.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't create this count — please try again."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="New stock count"
      description="A draft first — nothing changes until you apply it."
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save draft"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-2">
          {lines.map((line, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select value={line.productId} onChange={(e) => updateLine(i, { productId: e.target.value })} className="flex-1">
                <option value="">Select a product…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              <Input
                type="number"
                min={0}
                value={line.countedQty}
                onChange={(e) => updateLine(i, { countedQty: e.target.value })}
                className="w-24"
                placeholder="Counted"
              />
              <Button variant="ghost" size="sm" onClick={() => setLines((rows) => rows.filter((_, idx) => idx !== i))} aria-label="Remove line">
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          ))}
        </div>
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setLines((rows) => [...rows, { productId: "", countedQty: "" }])}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add line
        </Button>
        <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Dialog>
  );
}

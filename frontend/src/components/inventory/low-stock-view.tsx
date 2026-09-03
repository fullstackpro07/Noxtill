"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bell, ShoppingCart, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonCard, SkeletonRow } from "@/components/shared/skeleton";
import { Select } from "@/components/ui/select";
import {
  fetchLowStock,
  fetchReorderSuggestions,
  updateLowStockThreshold,
  fetchWaitlist,
  addToWaitlist,
  notifyWaitlist,
  type LowStockItem,
} from "@/lib/inventory-api";
import { createPurchaseOrder } from "@/lib/purchase-orders-api";
import { searchCustomers, type CustomerSearchResult } from "@/lib/customers-api";
import { formatCurrency } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <span className="text-xs font-medium text-fg-faint">{label}</span>
      <p className={`mt-1 font-display text-xl font-bold ${tone === "danger" ? "text-destructive" : "text-fg"}`}>{value}</p>
    </div>
  );
}

export function LowStockView({ currency }: { currency: string }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingThreshold, setEditingThreshold] = useState(false);
  const [poOpen, setPoOpen] = useState(false);
  const [waitlistItem, setWaitlistItem] = useState<LowStockItem | null>(null);

  const { data: items = [], isPending, isError, refetch } = useQuery({
    queryKey: ["low-stock"],
    queryFn: fetchLowStock,
  });
  const { data: reorderGroups = [] } = useQuery({
    queryKey: ["reorder-suggestions"],
    queryFn: fetchReorderSuggestions,
  });

  const notifyMutation = useMutation({
    mutationFn: (productId: string) => notifyWaitlist(productId),
    onSuccess: (result) => {
      toast.success(`Notified ${result.notifiedCount} waiting customer${result.notifiedCount === 1 ? "" : "s"}.`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't notify the waitlist — please try again."),
  });

  const outOfStockCount = items.filter((i) => i.status === "out_of_stock").length;
  const belowThresholdCount = items.filter((i) => i.status === "low_stock").length;
  const totalLostSales = items.reduce((sum, i) => sum + i.lostSalesEstimate, 0);
  const reorderValue = reorderGroups.reduce(
    (sum, g) => sum + g.items.reduce((s, item) => {
      const stockItem = items.find((i) => i.id === item.productId);
      return s + item.suggestedQty * (stockItem?.costPrice ?? 0);
    }, 0),
    0,
  );

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (isError) {
    return <ErrorBanner title="Couldn't load low stock" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {isPending ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard label="Below threshold" value={String(belowThresholdCount)} />
            <StatCard label="Out of stock" value={String(outOfStockCount)} tone={outOfStockCount > 0 ? "danger" : undefined} />
            <StatCard label="Estimated lost sales" value={formatCurrency(totalLostSales, currency)} tone={totalLostSales > 0 ? "danger" : undefined} />
            <StatCard label="Reorder value" value={formatCurrency(reorderValue, currency)} />
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <Button size="sm" variant="outline" onClick={() => setEditingThreshold(true)}>
              Edit threshold ({selectedIds.size})
            </Button>
          )}
        </div>
        <Button size="sm" onClick={() => setPoOpen(true)} disabled={reorderGroups.length === 0}>
          <ShoppingCart className="h-3.5 w-3.5" aria-hidden />
          Build purchase order
        </Button>
      </div>

      {isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="Nothing low right now" description="Every product is above its low-stock threshold." />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === items.length}
                    onChange={(e) => setSelectedIds(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())}
                    className="h-4 w-4 rounded border-border-strong accent-primary"
                  />
                </th>
                <th className="px-4 py-3 text-start">Product</th>
                <th className="px-4 py-3 text-start">On hand</th>
                <th className="px-4 py-3 text-start">Threshold</th>
                <th className="px-4 py-3 text-start">Status</th>
                <th className="px-4 py-3 text-start">Days out</th>
                <th className="px-4 py-3 text-start">Lost sales</th>
                <th className="px-4 py-3 text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelected(item.id)}
                      className="h-4 w-4 rounded border-border-strong accent-primary"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-fg">{item.name}</td>
                  <td className="px-4 py-3 text-fg-muted">{item.stockQty}</td>
                  <td className="px-4 py-3 text-fg-muted">{item.lowStockThreshold}</td>
                  <td className="px-4 py-3">
                    <Badge tone={item.status === "out_of_stock" ? "danger" : "warning"}>
                      {item.status === "out_of_stock" ? "Out of stock" : "Low stock"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{item.daysOutOfStock > 0 ? `${item.daysOutOfStock}d` : "—"}</td>
                  <td className="px-4 py-3 text-fg-muted">{item.lostSalesEstimate > 0 ? formatCurrency(item.lostSalesEstimate, currency) : "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setWaitlistItem(item)} aria-label="Waitlist">
                        <UserPlus className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                      {item.status === "ok" ? null : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => notifyMutation.mutate(item.id)}
                          disabled={item.stockQty <= 0 || notifyMutation.isPending}
                          aria-label="Notify waitlist"
                          title={item.stockQty <= 0 ? "Restock before notifying" : "Notify waiting customers"}
                        >
                          <Bell className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingThreshold && (
        <ThresholdBulkEditDialog
          productIds={[...selectedIds]}
          onClose={() => setEditingThreshold(false)}
          onDone={() => setSelectedIds(new Set())}
        />
      )}
      {poOpen && <ReorderPoDialog groups={reorderGroups} onClose={() => setPoOpen(false)} currency={currency} />}
      {waitlistItem && <WaitlistDialog item={waitlistItem} onClose={() => setWaitlistItem(null)} />}
    </div>
  );
}

function ThresholdBulkEditDialog({ productIds, onClose, onDone }: { productIds: string[]; onClose: () => void; onDone: () => void }) {
  const [threshold, setThreshold] = useState("5");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => Promise.all(productIds.map((id) => updateLowStockThreshold(id, Number(threshold)))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["low-stock"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast.success(`Updated threshold for ${productIds.length} product${productIds.length === 1 ? "" : "s"}.`);
      onDone();
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update these thresholds — please try again."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Edit threshold for ${productIds.length} product${productIds.length === 1 ? "" : "s"}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={Number(threshold) < 0 || mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <Input label="Low-stock threshold" type="number" min={0} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
    </Dialog>
  );
}

function ReorderPoDialog({
  groups,
  onClose,
  currency,
}: {
  groups: { supplierId: string; supplierName: string; items: { productId: string; name: string; suggestedQty: number }[]; totalSuggestedQty: number }[];
  onClose: () => void;
  currency: string;
}) {
  const realGroups = groups.filter((g) => g.supplierId !== "unassigned");
  const [supplierId, setSupplierId] = useState(realGroups[0]?.supplierId ?? "");
  const queryClient = useQueryClient();
  const selectedGroup = realGroups.find((g) => g.supplierId === supplierId);

  const mutation = useMutation({
    mutationFn: () =>
      createPurchaseOrder({
        supplierId,
        note: "Built from reorder suggestions",
        items: (selectedGroup?.items ?? []).map((i) => ({ productId: i.productId, qty: i.suggestedQty, unitCost: 0 })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success("Draft purchase order created — set real unit costs before sending.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't create this purchase order — please try again."),
  });

  if (realGroups.length === 0) {
    return (
      <Dialog open onClose={onClose} title="Build purchase order">
        <p className="text-sm text-fg-muted">
          No supplier is on record for any low-stock product yet — record a purchase from a real supplier first so reorder suggestions can
          group by who to buy from.
        </p>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Build purchase order from suggestions"
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!selectedGroup || mutation.isPending}>
            {mutation.isPending ? "Creating…" : "Create draft"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          {realGroups.map((g) => (
            <option key={g.supplierId} value={g.supplierId}>
              {g.supplierName} — {g.items.length} item(s), {g.totalSuggestedQty} units
            </option>
          ))}
        </Select>
        {selectedGroup && (
          <div className="rounded-[var(--radius-sm)] border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-fg-faint">
                  <th className="px-3 py-2 text-start">Product</th>
                  <th className="px-3 py-2 text-start">Suggested qty</th>
                </tr>
              </thead>
              <tbody>
                {selectedGroup.items.map((i) => (
                  <tr key={i.productId} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-fg">{i.name}</td>
                    <td className="px-3 py-2 text-fg-muted">{i.suggestedQty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-fg-faint">
          Creates a real draft — unit costs default to {formatCurrency(0, currency)}; set them for real on the Purchases screen before
          sending.
        </p>
      </div>
    </Dialog>
  );
}

function WaitlistDialog({ item, onClose }: { item: LowStockItem; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const queryClient = useQueryClient();

  const { data: waitlist = [] } = useQuery({
    queryKey: ["waitlist", item.id],
    queryFn: () => fetchWaitlist(item.id),
  });
  const { data: results = [] } = useQuery({
    queryKey: ["customer-search", query],
    queryFn: () => searchCustomers(query),
    enabled: query.trim().length > 0,
  });

  const addMutation = useMutation({
    mutationFn: (customerId: string) => addToWaitlist(item.id, customerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["waitlist", item.id] });
      queryClient.invalidateQueries({ queryKey: ["low-stock"] });
      setQuery("");
      toast.success("Added to the waitlist.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't add this customer — please try again."),
  });

  return (
    <Dialog open onClose={onClose} title={`Waitlist — ${item.name}`} description={`${waitlist.length} customer${waitlist.length === 1 ? "" : "s"} waiting to be notified.`}>
      <div className="flex flex-col gap-3">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a customer to add…" />
        {results.length > 0 && (
          <div className="flex flex-col gap-1 rounded-[var(--radius-sm)] border border-border-strong">
            {results.map((c: CustomerSearchResult) => (
              <button
                key={c.id}
                onClick={() => addMutation.mutate(c.id)}
                className="flex items-center justify-between px-3 py-2 text-start text-sm hover:bg-surface-2"
              >
                <span className="text-fg">{c.name}</span>
                <span className="text-xs text-fg-faint">{c.phone}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          {waitlist.map((w) => (
            <div key={w.id} className="flex items-center justify-between text-sm">
              <span className="text-fg">{w.customer.name}</span>
              <span className="text-xs text-fg-faint">{w.notifiedAt ? "Notified" : "Waiting"}</span>
            </div>
          ))}
          {waitlist.length === 0 && <p className="text-sm text-fg-muted">No one waiting yet.</p>}
        </div>
      </div>
    </Dialog>
  );
}

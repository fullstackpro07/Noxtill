"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackageOpen, Play, Trash2, Ban } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { useSession } from "@/lib/session";
import { fetchStaffList } from "@/lib/staff-api";
import { fetchProducts } from "@/lib/products-api";
import { formatCurrency, formatRelativeTime } from "@/lib/format";
import { useNow } from "@/hooks/use-now";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { discardHeldSale, discardOldHeldSales, fetchHeldSales, resumeHeldSale, type LiveHeldSale } from "@/lib/held-sales-api";

type PaymentMethod = "cash" | "card" | "online" | "credit";
const PAYMENT_METHODS: { key: PaymentMethod; label: string }[] = [
  { key: "cash", label: "Cash" },
  { key: "card", label: "Card" },
  { key: "online", label: "Online" },
  { key: "credit", label: "Credit" },
];

export function HeldSalesView() {
  const session = useSession();
  const queryClient = useQueryClient();
  const now = useNow(60_000);
  const [staffFilter, setStaffFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [resuming, setResuming] = useState<LiveHeldSale | null>(null);
  const [discardAllOpen, setDiscardAllOpen] = useState(false);

  const { data: holds, isPending, isError, refetch } = useQuery({
    queryKey: ["held-sales"],
    queryFn: fetchHeldSales,
    refetchInterval: 60_000,
  });
  const { data: staff } = useQuery({ queryKey: ["staff-roster"], queryFn: fetchStaffList, staleTime: 5 * 60 * 1000 });
  const { data: products } = useQuery({ queryKey: ["products", "all-for-names"], queryFn: () => fetchProducts(), staleTime: 5 * 60 * 1000 });

  const staffNameByUserId = useMemo(() => new Map((staff ?? []).map((s) => [s.userId, s.name])), [staff]);
  const productNameById = useMemo(() => new Map((products ?? []).map((p) => [p.id, p.name])), [products]);

  const filtered = useMemo(() => {
    if (!holds) return [];
    return holds.filter((h) => {
      if (staffFilter !== "all" && h.heldByUserId !== staffFilter) return false;
      if (dateFilter && h.createdAt.slice(0, 10) !== dateFilter) return false;
      return true;
    });
  }, [holds, staffFilter, dateFilter]);

  const discardMutation = useMutation({
    mutationFn: discardHeldSale,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["held-sales"] });
      toast.success("Held sale discarded.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't discard this hold — please try again."),
  });

  const discardAllMutation = useMutation({
    mutationFn: discardOldHeldSales,
    onSuccess: ({ count }) => {
      queryClient.invalidateQueries({ queryKey: ["held-sales"] });
      toast.success(count > 0 ? `Discarded ${count} hold(s) from before today.` : "No holds from before today.");
      setDiscardAllOpen(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't discard old holds — please try again."),
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {staff && staff.length > 0 && (
            <Select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} className="w-40" aria-label="Filter by staff">
              <option value="all">All staff</option>
              {staff.map((s) => (
                <option key={s.userId} value={s.userId}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
          <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="w-40" aria-label="Filter by date" />
        </div>
        {holds && holds.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setDiscardAllOpen(true)}>
            <Ban className="h-3.5 w-3.5" aria-hidden />
            Discard all older than today
          </Button>
        )}
      </div>

      {isError && <ErrorBanner title="Couldn't load held sales" onRetry={() => refetch()} />}

      {isPending && (
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <SkeletonRow />
            <SkeletonRow />
          </CardContent>
        </Card>
      )}

      {!isPending && filtered.length === 0 && (
        <Card>
          <CardContent>
            <EmptyState
              icon={PackageOpen}
              title={holds && holds.length > 0 ? "No holds match these filters" : "No held sales"}
              description="Hold a cart from Fast Sale when a customer steps away — it'll show up here to resume later."
            />
          </CardContent>
        </Card>
      )}

      {filtered.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {filtered.map((hold) => (
            <Card key={hold.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">
                    {hold.itemsCount} item{hold.itemsCount === 1 ? "" : "s"}
                    {hold.customerName ? ` · ${hold.customerName}` : ""}
                  </p>
                  <p className="truncate text-xs text-fg-muted">
                    {hold.items.map((i) => `${i.qty}× ${productNameById.get(i.productId) ?? "Unknown item"}`).join(", ")}
                  </p>
                  <p className="text-xs text-fg-faint">
                    Held {formatRelativeTime(now - new Date(hold.createdAt).getTime())}
                    {hold.heldByUserId ? ` by ${staffNameByUserId.get(hold.heldByUserId) ?? "a staff member"}` : ""}
                    {hold.note ? ` · "${hold.note}"` : ""}
                  </p>
                </div>
                <p className="font-display text-base font-bold tabular-nums text-fg">{formatCurrency(hold.estimatedTotal, session.business.currency)}</p>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button size="sm" onClick={() => setResuming(hold)}>
                    <Play className="h-3.5 w-3.5" aria-hidden />
                    Resume
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => discardMutation.mutate(hold.id)} disabled={discardMutation.isPending} aria-label="Discard">
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ResumeDialog hold={resuming} onClose={() => setResuming(null)} currency={session.business.currency} />

      <Dialog
        open={discardAllOpen}
        onClose={() => setDiscardAllOpen(false)}
        title="Discard all holds older than today?"
        description="Every held sale created before today is deleted permanently — this can't be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDiscardAllOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => discardAllMutation.mutate()} disabled={discardAllMutation.isPending}>
              {discardAllMutation.isPending ? "Discarding…" : "Discard old holds"}
            </Button>
          </>
        }
      />
    </div>
  );
}

function ResumeDialog({ hold, onClose, currency }: { hold: LiveHeldSale | null; onClose: () => void; currency: string }) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (id: string) => resumeHeldSale(id, method),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["held-sales"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success(`Sale #${order.orderNo} recorded — ${formatCurrency(Number(order.total), currency)} via ${method}.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't complete this sale — the hold is still here."),
  });

  return (
    <Dialog
      open={hold != null}
      onClose={onClose}
      title="Resume held sale"
      description={hold ? `Total: ${formatCurrency(hold.estimatedTotal, currency)}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => hold && mutation.mutate(hold.id)} disabled={mutation.isPending}>
            {mutation.isPending ? "Confirming…" : "Confirm sale"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-4 gap-1.5">
        {PAYMENT_METHODS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMethod(m.key)}
            className={`rounded-[var(--radius-sm)] border px-2 py-2 text-xs font-medium transition-colors ${
              method === m.key ? "border-primary bg-primary/8 text-primary" : "border-border text-fg-muted hover:bg-surface-2"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
    </Dialog>
  );
}

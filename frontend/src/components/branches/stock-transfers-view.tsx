"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ArrowRight, Check, Truck, PackageCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import {
  fetchStockTransfers,
  approveStockTransfer,
  shipStockTransfer,
  receiveStockTransfer,
  rejectStockTransfer,
  type StockTransfer,
  type StockTransferStatus,
} from "@/lib/stock-transfers-api";
import { fetchBranches } from "@/lib/branches-api";
import { formatDate } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { BR, KpiTile, KpiSkeleton, Chip, th, type Tone } from "@/components/branches/branches-ui";
import { useBranchDrawer } from "@/components/branches/branch-drawer-context";

const STATUS_TONE: Record<StockTransferStatus, Tone> = {
  pending: "amber",
  approved: "blue",
  shipped: "blue",
  received: "green",
  rejected: "red",
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
  const { openTransfer } = useBranchDrawer();
  const [filter, setFilter] = useState<StockTransferStatus | "all">("all");
  const [rejecting, setRejecting] = useState<StockTransfer | null>(null);
  const [receiving, setReceiving] = useState<StockTransfer | null>(null);
  const queryClient = useQueryClient();

  const { data: transfers = [], isPending, isError, refetch } = useQuery({
    queryKey: ["stock-transfers", filter],
    queryFn: () => fetchStockTransfers(filter === "all" ? undefined : filter),
  });
  const { data: allTransfers = [] } = useQuery({ queryKey: ["stock-transfers", "all"], queryFn: () => fetchStockTransfers() });
  const { data: branches = [] } = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? "—";

  const kpis = [
    { label: "Pending approval", value: allTransfers.filter((t) => t.status === "pending").length, tone: "amber" as const },
    { label: "In transit", value: allTransfers.filter((t) => t.status === "shipped").length, tone: "blue" as const },
    { label: "Received", value: allTransfers.filter((t) => t.status === "received").length, tone: undefined },
    { label: "Rejected / cancelled", value: allTransfers.filter((t) => t.status === "rejected" || t.status === "cancelled").length, tone: undefined },
  ];

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
    mutationFn: ({ id, overrides }: { id: string; overrides?: { itemId: string; receivedQty: number }[] }) =>
      receiveStockTransfer(id, overrides),
    onSuccess: () => {
      invalidate();
      toast.success("Marked as received — stock added to your branch.");
      setReceiving(null);
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
    <main className="flex flex-col gap-[18px] px-6 pb-[30px] pt-[18px]">
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" }}>
        {isPending ? <KpiSkeleton count={4} /> : kpis.map((k) => <KpiTile key={k.label} label={k.label} value={String(k.value)} tone={k.tone} />)}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div style={{ display: "inline-flex", padding: 3, background: "#F1F3F6", borderRadius: 10, gap: 2, overflowX: "auto" }}>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              style={{ height: 26, flexShrink: 0, display: "flex", alignItems: "center", padding: "0 10px", borderRadius: 8, fontSize: 11.5, cursor: "pointer", fontWeight: filter === f.key ? 700 : 600, color: filter === f.key ? BR.text : BR.textMuted, background: filter === f.key ? "#fff" : "transparent", boxShadow: filter === f.key ? "0 1px 2px rgba(16,24,40,.08)" : "none", border: 0 }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => openTransfer()} style={{ height: 34, display: "flex", alignItems: "center", gap: 6, padding: "0 13px", borderRadius: 10, background: BR.primary, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: 0 }}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          New transfer
        </button>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load stock transfers" description="Check your connection and try again." onRetry={() => refetch()} />
      ) : isPending ? (
        <div style={{ borderRadius: 13, border: `1px solid ${BR.border}`, background: "#fff", height: 160 }} />
      ) : transfers.length === 0 ? (
        <EmptyState icon={Truck} title="No stock transfers" description="Move inventory between branches — request, approve, ship, and receive." action={{ label: "New transfer", onClick: () => openTransfer() }} />
      ) : (
        <div style={{ background: "#fff", border: `1px solid ${BR.border}`, borderRadius: 13, boxShadow: "0 1px 2px rgba(16,24,40,.05)", overflow: "hidden" }}>
          <div className="overflow-x-auto nx-scroll">
            <table style={{ width: "100%", minWidth: 1140, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#FAFBFC", borderBottom: `1px solid ${BR.border}` }}>
                  <th style={th("left")}>Items</th>
                  <th style={th("left")}>Route</th>
                  <th style={th("left")}>Status</th>
                  <th style={th("left")}>Created</th>
                  <th style={th("right")}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => (
                  <tr key={t.id} style={{ borderBottom: "1px solid #F3F4F7", background: t.status === "pending" ? "#FFFDF5" : "#fff" }}>
                    <td style={{ padding: "11px 12px 11px 18px", fontSize: 12, color: "#45505F" }}>
                      {t.items.map((i) => i.sourceProduct.name).join(", ")}
                      <span style={{ marginLeft: 4, color: BR.textFaint }}>({t.items.reduce((s, i) => s + i.qty, 0)} units)</span>
                      {t.status === "received" && t.items.some((i) => i.receivedQty != null && i.receivedQty < i.qty) && (
                        <span style={{ marginLeft: 4, fontSize: 11, color: "#B54708" }}>
                          — partial: {t.items.reduce((s, i) => s + (i.receivedQty ?? i.qty), 0)}/{t.items.reduce((s, i) => s + i.qty, 0)} received
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "11px 12px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#45505F" }}>
                        {branchName(t.sourceBusinessId)} <ArrowRight className="h-3 w-3 shrink-0" aria-hidden /> {branchName(t.destBusinessId)}
                      </span>
                    </td>
                    <td style={{ padding: "11px 12px" }}>
                      <Chip tone={STATUS_TONE[t.status]} style={{ height: 21, fontSize: 10 }}>
                        {t.status}
                      </Chip>
                      {t.note && <p style={{ marginTop: 4, maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, color: BR.textFaint }}>{t.note}</p>}
                    </td>
                    <td style={{ padding: "11px 12px", fontSize: 11.5, color: BR.textFaint }}>{formatDate(t.createdAt)}</td>
                    <td style={{ padding: "11px 18px 11px 12px" }}>
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
                          <Button size="sm" variant="outline" onClick={() => setReceiving(t)} disabled={receiveMutation.isPending}>
                            <PackageCheck className="h-3.5 w-3.5" aria-hidden />
                            Receive
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          </div>
          <div style={{ padding: "12px 18px", borderTop: "1px solid #F0F2F5", background: "#FCFCFD", fontSize: 11, color: BR.textFaint }}>
            Request → approval → shipment → receipt, each step with its own user and timestamp. Stock leaves the source only on shipment and arrives only on receipt.
          </div>
        </div>
      )}

      {receiving && (
        <ReceiveTransferDialog
          transfer={receiving}
          onClose={() => setReceiving(null)}
          onConfirm={(overrides) => receiveMutation.mutate({ id: receiving.id, overrides })}
          confirming={receiveMutation.isPending}
        />
      )}

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
    </main>
  );
}

/** Branches depth fix (UPD-INT-012): lets the receiving branch record a real partial receipt —
 * defaults every item to a full receive, editable per item before confirming. */
function ReceiveTransferDialog({
  transfer,
  onClose,
  onConfirm,
  confirming,
}: {
  transfer: StockTransfer;
  onClose: () => void;
  onConfirm: (overrides: { itemId: string; receivedQty: number }[]) => void;
  confirming: boolean;
}) {
  const [receivedByItemId, setReceivedByItemId] = useState<Record<string, string>>(
    Object.fromEntries(transfer.items.map((i) => [i.id, String(i.qty)])),
  );

  const overrides = transfer.items.map((i) => ({
    itemId: i.id,
    receivedQty: Number(receivedByItemId[i.id] ?? i.qty),
  }));
  const valid = overrides.every((o) => Number.isFinite(o.receivedQty) && o.receivedQty >= 0);
  const hasShortfall = transfer.items.some(
    (i) => Number(receivedByItemId[i.id] ?? i.qty) < i.qty,
  );

  return (
    <Dialog
      open
      onClose={onClose}
      title="Confirm receipt"
      description="Adjust any item that arrived short — the rest stay at their full shipped quantity."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={confirming}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(overrides)} disabled={!valid || confirming}>
            {confirming ? "Confirming…" : hasShortfall ? "Confirm partial receipt" : "Confirm receipt"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {transfer.items.map((i) => (
          <div key={i.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-fg">{i.sourceProduct.name}</p>
              <p className="text-xs text-fg-faint">Shipped: {i.qty}</p>
            </div>
            <Input
              className="w-24"
              type="number"
              min={0}
              max={i.qty}
              value={receivedByItemId[i.id] ?? String(i.qty)}
              onChange={(e) => setReceivedByItemId((prev) => ({ ...prev, [i.id]: e.target.value }))}
            />
          </div>
        ))}
      </div>
    </Dialog>
  );
}


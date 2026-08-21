"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Printer, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { useSession } from "@/lib/session";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { closeShiftBare, fetchCurrentShift, fetchShiftHistory, reconcileShift, type LiveCashShift } from "@/lib/cash-register-api";

interface DenominationRow {
  id: string;
  value: string;
  count: string;
}

let rowSeq = 0;
function newRow(): DenominationRow {
  rowSeq += 1;
  return { id: `row-${rowSeq}`, value: "", count: "" };
}

export function ShiftClosingView() {
  const session = useSession();
  const isOwnerOrManager = session.user.role !== "staff";
  const queryClient = useQueryClient();
  const [denominations, setDenominations] = useState<DenominationRow[]>([newRow(), newRow()]);
  const [note, setNote] = useState("");
  const [confirmBareClose, setConfirmBareClose] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  const { data: shift, isPending, isError, refetch } = useQuery({
    queryKey: ["cash-shift-current"],
    queryFn: fetchCurrentShift,
  });
  const { data: history, isPending: historyPending } = useQuery({
    queryKey: ["cash-shift-history"],
    queryFn: fetchShiftHistory,
  });

  const countedCash = useMemo(
    () => denominations.reduce((sum, d) => sum + (Number(d.value) || 0) * (Number(d.count) || 0), 0),
    [denominations],
  );

  function invalidateAfterClose() {
    queryClient.invalidateQueries({ queryKey: ["cash-shift-current"] });
    queryClient.invalidateQueries({ queryKey: ["cash-shift-history"] });
  }

  const bareCloseMutation = useMutation({
    mutationFn: closeShiftBare,
    onSuccess: () => {
      invalidateAfterClose();
      toast.success("Shift closed without a count.");
      setConfirmBareClose(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't close this shift — please try again."),
  });

  const reconcileMutation = useMutation({
    mutationFn: () => reconcileShift({ countedCash: Math.round(countedCash * 100) / 100, note: note.trim() || undefined }),
    onSuccess: () => {
      invalidateAfterClose();
      toast.success("Shift closed and reconciled.");
      setDenominations([newRow(), newRow()]);
      setNote("");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't reconcile this shift — a note may be required for this variance."),
  });

  function updateRow(id: string, field: "value" | "count", val: string) {
    setDenominations((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: val } : r)));
  }
  function removeRow(id: string) {
    setDenominations((rows) => rows.filter((r) => r.id !== id));
  }

  if (isError) {
    return <ErrorBanner title="Couldn't load the current shift" onRetry={() => refetch()} />;
  }

  return (
    <div className="flex flex-col gap-5">
      {isPending && (
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <SkeletonRow />
            <SkeletonRow />
          </CardContent>
        </Card>
      )}

      {!isPending && !shift && (
        <Card>
          <CardContent>
            <EmptyState icon={Lock} title="No shift is open" description="Open a shift from the Cash Register tab before you can close one." />
          </CardContent>
        </Card>
      )}

      {shift && (
        <Card>
          <CardHeader>
            <CardTitle>Count the drawer</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setPrintOpen(true)}>
              <Printer className="h-3.5 w-3.5" aria-hidden />
              Print shift report
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-fg-muted">
              Enter each denomination you counted and how many of it there are — the total below becomes the counted cash for reconciliation.
              {!isOwnerOrManager && " This count is submitted without seeing the expected amount."}
            </p>

            <div className="flex flex-col gap-2">
              {denominations.map((row) => (
                <div key={row.id} className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={row.value}
                    onChange={(e) => updateRow(row.id, "value", e.target.value)}
                    placeholder="Denomination value"
                    className="w-40"
                  />
                  <span className="text-fg-faint">×</span>
                  <Input
                    type="number"
                    min={0}
                    value={row.count}
                    onChange={(e) => updateRow(row.id, "count", e.target.value)}
                    placeholder="Count"
                    className="w-28"
                  />
                  <span className="w-28 text-end text-sm tabular-nums text-fg-muted">
                    {formatCurrency((Number(row.value) || 0) * (Number(row.count) || 0), session.business.currency)}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => removeRow(row.id)} aria-label="Remove row">
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              ))}
              <Button variant="ghost" size="sm" className="self-start" onClick={() => setDenominations((rows) => [...rows, newRow()])}>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add denomination
              </Button>
            </div>

            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-sm font-medium text-fg-muted">Counted cash</span>
              <span className="font-display text-lg font-bold tabular-nums text-fg">{formatCurrency(countedCash, session.business.currency)}</span>
            </div>

            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (required if the count is significantly off)" />

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => reconcileMutation.mutate()} disabled={countedCash <= 0 || reconcileMutation.isPending}>
                {reconcileMutation.isPending ? "Closing…" : "Close with this count"}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmBareClose(true)}>
                Close without counting
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Shift history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {historyPending && (
            <div className="flex flex-col gap-1 p-4">
              <SkeletonRow />
              <SkeletonRow />
            </div>
          )}
          {history && history.length === 0 && <EmptyState icon={Lock} title="No closed shifts yet" description="Closed shifts will show up here." />}
          {history && history.length > 0 && <ShiftHistoryTable rows={history} currency={session.business.currency} />}
        </CardContent>
      </Card>

      <Dialog
        open={confirmBareClose}
        onClose={() => setConfirmBareClose(false)}
        title="Close without counting?"
        description="No variance will be recorded for this shift — you can't reconcile it after the fact."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmBareClose(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => bareCloseMutation.mutate()} disabled={bareCloseMutation.isPending}>
              {bareCloseMutation.isPending ? "Closing…" : "Close without counting"}
            </Button>
          </>
        }
      />

      {shift && printOpen && (
        <PrintReportDialog
          shift={shift}
          denominations={denominations}
          countedCash={countedCash}
          currency={session.business.currency}
          businessName={session.business.name}
          onClose={() => setPrintOpen(false)}
        />
      )}
    </div>
  );
}

function ShiftHistoryTable({ rows, currency }: { rows: LiveCashShift[]; currency: string }) {
  const showVariance = rows.some((r) => r.hasVarianceData);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-fg-faint">
            <th className="px-5 py-2 font-medium">Opened</th>
            <th className="px-5 py-2 font-medium">Closed</th>
            <th className="px-5 py-2 text-end font-medium">Opening float</th>
            {showVariance && <th className="px-5 py-2 text-end font-medium">Counted cash</th>}
            {showVariance && <th className="px-5 py-2 text-end font-medium">Variance</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-5 py-2.5 text-fg-muted">
                {formatDate(r.openedAt)} {formatTime(r.openedAt)}
              </td>
              <td className="px-5 py-2.5 text-fg-muted">{r.closedAt ? `${formatDate(r.closedAt)} ${formatTime(r.closedAt)}` : "—"}</td>
              <td className="px-5 py-2.5 text-end tabular-nums text-fg">{formatCurrency(r.openingFloat, currency)}</td>
              {showVariance && (
                <td className="px-5 py-2.5 text-end tabular-nums text-fg">{r.countedCash != null ? formatCurrency(r.countedCash, currency) : "—"}</td>
              )}
              {showVariance && (
                <td className="px-5 py-2.5 text-end">
                  {r.variance != null ? (
                    <Badge tone={Math.abs(r.variance) < 0.01 ? "success" : Math.abs(r.variance) > 20 ? "danger" : "warning"}>
                      {r.variance > 0 ? "+" : ""}
                      {formatCurrency(r.variance, currency)}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PrintReportDialog({
  shift,
  denominations,
  countedCash,
  currency,
  businessName,
  onClose,
}: {
  shift: LiveCashShift;
  denominations: DenominationRow[];
  countedCash: number;
  currency: string;
  businessName: string;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onClose={onClose}
      title="Shift report"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" aria-hidden />
            Print
          </Button>
        </>
      }
    >
      <div data-print-root className="flex flex-col gap-3 text-sm">
        <div>
          <p className="font-display text-base font-semibold text-fg">{businessName}</p>
          <p className="text-fg-muted">
            Shift opened {formatDate(shift.openedAt)} {formatTime(shift.openedAt)}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <p className="text-fg-muted">Opening float</p>
          <p className="text-end tabular-nums text-fg">{formatCurrency(shift.openingFloat, currency)}</p>
          <p className="text-fg-muted">Counted so far</p>
          <p className="text-end tabular-nums text-fg">{formatCurrency(countedCash, currency)}</p>
        </div>
        {denominations.some((d) => Number(d.value) > 0 && Number(d.count) > 0) && (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-xs text-fg-faint">
                <th className="py-1 font-medium">Denomination</th>
                <th className="py-1 text-end font-medium">Count</th>
                <th className="py-1 text-end font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {denominations
                .filter((d) => Number(d.value) > 0 && Number(d.count) > 0)
                .map((d) => (
                  <tr key={d.id}>
                    <td className="py-1 tabular-nums">{formatCurrency(Number(d.value), currency)}</td>
                    <td className="py-1 text-end tabular-nums">{d.count}</td>
                    <td className="py-1 text-end tabular-nums">{formatCurrency(Number(d.value) * Number(d.count), currency)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </Dialog>
  );
}

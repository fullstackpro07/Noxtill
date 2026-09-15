"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { CheckCircle2, Printer } from "lucide-react";
import { useSession } from "@/lib/session";
import { formatCurrency, formatTime } from "@/lib/format";
import { useNow } from "@/hooks/use-now";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { closeShiftBare, fetchCurrentShift, reconcileShift, type LiveCashShift } from "@/lib/cash-register-api";
import { PosModalShell } from "./pos-modal-shell";

const btnOutline: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const btnPrimary: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };

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

function shiftDurationLabel(openedAt: string, now: number): string {
  const ms = Math.max(0, now - new Date(openedAt).getTime());
  const totalMinutes = Math.floor(ms / 60_000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

export function ShiftClosingView() {
  const session = useSession();
  const router = useRouter();
  const now = useNow(60_000);
  const isOwnerOrManager = session.user.role !== "staff";
  const queryClient = useQueryClient();
  const [denominations, setDenominations] = useState<DenominationRow[]>([newRow(), newRow()]);
  const [countedManual, setCountedManual] = useState("");
  const [varianceNote, setVarianceNote] = useState("");
  const [printOpen, setPrintOpen] = useState(false);
  const [closedResult, setClosedResult] = useState<LiveCashShift | null>(null);
  const denomRef = useRef<HTMLDivElement>(null);

  const { data: shift } = useQuery({ queryKey: ["cash-shift-current"], queryFn: fetchCurrentShift });

  const denomTotal = useMemo(
    () => denominations.reduce((sum, d) => sum + (Number(d.value) || 0) * (Number(d.count) || 0), 0),
    [denominations],
  );
  const countedCash = countedManual.trim() !== "" ? Number(countedManual) || 0 : denomTotal;

  const cashSales = (shift?.movements ?? []).filter((m) => m.type === "sale").reduce((s, m) => s + m.amount, 0);
  const cashRefunds = (shift?.movements ?? []).filter((m) => m.type === "refund").reduce((s, m) => s + m.amount, 0);
  const cashInOut = (shift?.movements ?? []).reduce((s, m) => s + (m.type === "cash_in" ? m.amount : m.type === "cash_out" ? -m.amount : 0), 0);
  const expectedCash = shift ? shift.openingFloat + cashSales - cashRefunds + cashInOut : 0;
  const variance = countedCash - expectedCash;
  const varianceState = Math.abs(variance) < 0.01 ? "Matched" : variance > 0 ? "Over" : "Short";
  const varianceColor = Math.abs(variance) < 0.01 ? "var(--app-primary)" : "var(--app-danger-strong)";
  const varianceBg = Math.abs(variance) < 0.01 ? "var(--app-success-bg)" : "#FEF3F2";

  function invalidateAfterClose() {
    queryClient.invalidateQueries({ queryKey: ["cash-shift-current"] });
  }

  const bareCloseMutation = useMutation({
    mutationFn: closeShiftBare,
    onSuccess: (result) => {
      invalidateAfterClose();
      setClosedResult(result);
      toast.success("Shift closed without a count.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't close this shift — please try again."),
  });

  const reconcileMutation = useMutation({
    mutationFn: () =>
      reconcileShift({
        countedCash: Math.round(countedCash * 100) / 100,
        note: varianceNote.trim() || undefined,
        denominations: denominations.filter((d) => Number(d.value) > 0 && Number(d.count) > 0).map((d) => ({ value: Number(d.value), count: Number(d.count) })),
      }),
    onSuccess: (result) => {
      invalidateAfterClose();
      setClosedResult(result);
      toast.success("Shift closed and reconciled.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't reconcile this shift — a note may be required for this variance."),
  });

  function updateRow(id: string, field: "value" | "count", val: string) {
    setDenominations((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: val } : r)));
  }

  const branchName = session.business.branches[0]?.name ?? session.business.name;

  if (closedResult) {
    return (
      <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
        <div className="rounded-[16px] p-[34px_20px] text-center" style={{ background: "var(--app-surface)", border: "1px solid var(--app-success-border)" }}>
          <div className="inline-flex h-[54px] w-[54px] items-center justify-center rounded-full" style={{ background: "var(--app-success-bg)" }}>
            <CheckCircle2 className="h-[27px] w-[27px]" style={{ color: "var(--app-primary)" }} aria-hidden />
          </div>
          <h3 className="mt-[13px] text-[19px] font-extrabold" style={{ color: "var(--app-text)" }}>Shift Closed</h3>
          <div className="mt-[14px] inline-flex flex-wrap justify-center gap-[26px] text-start">
            <span>
              <span className="block text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Closing time</span>
              <span className="block text-[14px] font-extrabold" style={{ color: "var(--app-text)" }}>{closedResult.closedAt ? formatTime(closedResult.closedAt) : formatTime(new Date().toISOString())}</span>
            </span>
            <span>
              <span className="block text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Cash counted</span>
              <span className="block text-[14px] font-extrabold" style={{ color: "var(--app-text)" }}>{closedResult.countedCash != null ? formatCurrency(closedResult.countedCash, session.business.currency) : "—"}</span>
            </span>
            <span>
              <span className="block text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Variance</span>
              <span className="block text-[14px] font-extrabold" style={{ color: closedResult.variance == null ? "var(--app-text)" : Math.abs(closedResult.variance) < 0.01 ? "var(--app-primary)" : "var(--app-danger-strong)" }}>
                {closedResult.variance != null ? `${closedResult.variance > 0 ? "+" : ""}${formatCurrency(closedResult.variance, session.business.currency)}` : "—"}
              </span>
            </span>
          </div>
          <div className="mt-[18px] flex flex-wrap justify-center gap-[9px]">
            <button type="button" onClick={() => setPrintOpen(true)} style={{ ...btnOutline, borderRadius: 12, padding: "12px 18px", minHeight: 46 }}>Print Shift Report</button>
            <button type="button" onClick={() => router.push("/sales/history")} style={{ ...btnPrimary, borderRadius: 12, padding: "12px 20px", minHeight: 46 }}>Done — view Sales History</button>
          </div>
        </div>
        <PrintReportModal open={printOpen} onClose={() => setPrintOpen(false)} shift={closedResult} currency={session.business.currency} businessName={session.business.name} />
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h2 className="m-0 text-[20px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.5px" }}>Close Shift</h2>
          <p className="mt-[3px] text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>
            {shift ? `Shift duration ${shiftDurationLabel(shift.openedAt, now)} · ` : ""}{session.user.name} · {branchName}
          </p>
        </div>
        <div className="ms-auto flex flex-wrap gap-[9px]">
          <button type="button" onClick={() => setPrintOpen(true)} disabled={!shift} style={{ ...btnOutline, opacity: shift ? 1 : 0.5 }}>Print Shift Report</button>
          <button type="button" onClick={() => denomRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })} disabled={!shift} style={{ ...btnOutline, opacity: shift ? 1 : 0.5 }}>Count Cash</button>
          <button type="button" onClick={() => reconcileMutation.mutate()} disabled={!shift || countedCash <= 0 || reconcileMutation.isPending} style={{ ...btnPrimary, opacity: !shift || countedCash <= 0 || reconcileMutation.isPending ? 0.6 : 1 }}>
            {reconcileMutation.isPending ? "Closing…" : "Submit Close"}
          </button>
        </div>
      </div>

      {!shift ? (
        <div className="rounded-[16px] p-[48px_20px] text-center" style={{ background: "var(--app-surface)", border: "1px dashed var(--app-border-strong)" }}>
          <div className="text-[14.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>No shift is open</div>
          <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Open a shift from Cash Register before you can close one.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-[15px]">
          <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(215px,1fr))" }}>
            <div className="rounded-[14px] p-4" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Expected Cash</div>
              {isOwnerOrManager ? (
                <>
                  <div className="mt-[5px] text-[22px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.5px" }}>{formatCurrency(expectedCash, session.business.currency)}</div>
                  <div className="mt-1 text-[11px]" style={{ color: "var(--app-text-disabled)" }}>Read-only · system calculated</div>
                </>
              ) : (
                <div className="mt-[9px] text-[12.5px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Hidden for Staff role</div>
              )}
            </div>
            <div className="rounded-[14px] p-4" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <label className="mb-1.5 block text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Counted Cash</label>
              <input
                type="number"
                min={0}
                value={countedManual}
                onChange={(e) => setCountedManual(e.target.value)}
                placeholder={denomTotal ? String(denomTotal) : "0"}
                className="w-full rounded-[11px] p-[11px] text-[19px] font-extrabold"
                style={{ border: "1px solid var(--app-border)" }}
              />
            </div>
            <div className="rounded-[14px] p-4" style={{ background: varianceBg, border: "1px solid var(--app-border)" }}>
              <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Variance</div>
              {isOwnerOrManager ? (
                <>
                  <div className="mt-[5px] text-[22px] font-extrabold" style={{ color: varianceColor, letterSpacing: "-.5px" }}>{variance > 0 ? "+" : ""}{formatCurrency(variance, session.business.currency)}</div>
                  <div className="mt-1 text-[11.5px] font-bold" style={{ color: varianceColor }}>{varianceState}</div>
                </>
              ) : (
                <div className="mt-[9px] text-[12.5px] font-bold" style={{ color: "var(--app-text-disabled)" }}>You can submit a count — variance is reviewed by the owner.</div>
              )}
            </div>
          </div>

          <div ref={denomRef} className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <div className="flex items-center gap-2.5 p-[14px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
              <h3 className="m-0 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Denomination counter</h3>
              <span className="text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Optional — helps you count faster</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: 460 }}>
                <thead>
                  <tr style={{ background: "var(--app-surface-2)" }}>
                    <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Note / coin</th>
                    <th className="p-[10px] text-center text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Count</th>
                    <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {denominations.map((row) => (
                    <tr key={row.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                      <td className="p-[9px_17px]">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.value}
                          onChange={(e) => updateRow(row.id, "value", e.target.value)}
                          placeholder="Denomination value"
                          className="w-full rounded-[9px] p-2 text-[12.5px] font-bold"
                          style={{ border: "1px solid var(--app-border)" }}
                        />
                      </td>
                      <td className="p-[9px] text-center">
                        <input
                          type="number"
                          min={0}
                          value={row.count}
                          onChange={(e) => updateRow(row.id, "count", e.target.value)}
                          aria-label="Count"
                          className="w-[88px] rounded-[9px] p-2 text-center text-[13px] font-bold"
                          style={{ border: "1px solid var(--app-border)" }}
                        />
                      </td>
                      <td className="p-[9px_17px] text-end text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>
                        {formatCurrency((Number(row.value) || 0) * (Number(row.count) || 0), session.business.currency)}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: "1px solid var(--app-border-strong)", background: "var(--app-surface-2)" }}>
                    <td className="p-[12px_17px] text-[13px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Total counted</td>
                    <td />
                    <td className="p-[12px_17px] text-end text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(denomTotal, session.business.currency)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="p-[12px_17px]">
              <button type="button" onClick={() => setDenominations((rows) => [...rows, newRow()])} className="text-[12.5px] font-bold" style={{ color: "var(--app-primary-hover, #0E8442)" }}>+ Add denomination</button>
            </div>
          </div>

          {Math.abs(variance) >= 0.01 && isOwnerOrManager && (
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>NOTE (recommended for a variance)</span>
              <input
                value={varianceNote}
                onChange={(e) => setVarianceNote(e.target.value)}
                placeholder="What caused the variance?"
                className="w-full rounded-[11px] p-3 text-[13.5px]"
                style={{ border: "1px solid var(--app-border)" }}
              />
            </label>
          )}

          <button
            type="button"
            onClick={() => bareCloseMutation.mutate()}
            disabled={bareCloseMutation.isPending}
            className="self-start text-[12.5px] font-bold"
            style={{ color: "var(--app-text-faint)", opacity: bareCloseMutation.isPending ? 0.6 : 1 }}
          >
            {bareCloseMutation.isPending ? "Closing…" : "Close without counting"}
          </button>
        </div>
      )}

      <PrintReportModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        shift={shift ?? null}
        countedCashOverride={countedCash}
        denominationsOverride={denominations.filter((d) => Number(d.value) > 0 && Number(d.count) > 0).map((d) => ({ value: Number(d.value), count: Number(d.count) }))}
        currency={session.business.currency}
        businessName={session.business.name}
      />
    </main>
  );
}

function PrintReportModal({
  open,
  onClose,
  shift,
  countedCashOverride,
  denominationsOverride,
  currency,
  businessName,
}: {
  open: boolean;
  onClose: () => void;
  shift: LiveCashShift | null;
  countedCashOverride?: number;
  denominationsOverride?: { value: number; count: number }[];
  currency: string;
  businessName: string;
}) {
  if (!shift) return null;
  const counted = shift.countedCash ?? countedCashOverride ?? 0;
  const denominations = shift.denominationCounts ?? denominationsOverride ?? [];

  return (
    <PosModalShell
      open={open}
      onClose={onClose}
      title="Shift Report"
      footer={
        <>
          <button type="button" onClick={onClose} style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" }}>Close</button>
          <button type="button" onClick={() => window.print()} style={btnPrimary}>
            <Printer className="me-1.5 inline h-3.5 w-3.5" aria-hidden />
            Print
          </button>
        </>
      }
    >
      <div data-print-root className="flex flex-col gap-3 p-[17px] text-[13px]">
        <div>
          <p className="text-[14px] font-extrabold" style={{ color: "var(--app-text)" }}>{businessName}</p>
          <p style={{ color: "var(--app-text-faint)" }}>Shift opened {formatTime(shift.openedAt)}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <p style={{ color: "var(--app-text-faint)" }}>Opening float</p>
          <p className="text-end font-bold" style={{ color: "var(--app-text)" }}>{formatCurrency(shift.openingFloat, currency)}</p>
          <p style={{ color: "var(--app-text-faint)" }}>Counted</p>
          <p className="text-end font-bold" style={{ color: "var(--app-text)" }}>{formatCurrency(counted, currency)}</p>
        </div>
        {denominations.length > 0 && (
          <table className="w-full">
            <thead>
              <tr className="border-b text-start text-[11px]" style={{ borderColor: "var(--app-border)", color: "var(--app-text-disabled)" }}>
                <th className="py-1 text-start font-semibold">Denomination</th>
                <th className="py-1 text-end font-semibold">Count</th>
                <th className="py-1 text-end font-semibold">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {denominations.map((d, i) => (
                <tr key={i}>
                  <td className="py-1">{formatCurrency(d.value, currency)}</td>
                  <td className="py-1 text-end">{d.count}</td>
                  <td className="py-1 text-end">{formatCurrency(d.value * d.count, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </PosModalShell>
  );
}

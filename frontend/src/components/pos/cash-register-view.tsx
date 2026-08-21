"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet, ArrowDownCircle, ArrowUpCircle, PlayCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { useSession } from "@/lib/session";
import { fetchStaffList } from "@/lib/staff-api";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import {
  fetchCurrentShift,
  openShift,
  recordCashMovement,
  type CashMovementType,
  type LiveCashMovement,
} from "@/lib/cash-register-api";

const MOVEMENT_LABEL: Record<CashMovementType, string> = {
  opening: "Opening float",
  sale: "Sale",
  cash_in: "Cash in",
  cash_out: "Cash out",
  refund: "Refund",
};
const MOVEMENT_SIGN: Record<CashMovementType, 1 | -1> = { opening: 1, sale: 1, cash_in: 1, cash_out: -1, refund: -1 };

export function CashRegisterView() {
  const session = useSession();
  const isOwnerOrManager = session.user.role !== "staff";
  const queryClient = useQueryClient();
  const [openingFloat, setOpeningFloat] = useState("");
  const [moveType, setMoveType] = useState<"cash_in" | "cash_out">("cash_in");
  const [moveAmount, setMoveAmount] = useState("");
  const [moveNote, setMoveNote] = useState("");
  const [staffFilter, setStaffFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<CashMovementType | "all">("all");
  const [dateFilter, setDateFilter] = useState("");

  const { data: shift, isPending, isError, refetch } = useQuery({
    queryKey: ["cash-shift-current"],
    queryFn: fetchCurrentShift,
    refetchInterval: 30_000,
  });
  const { data: staff } = useQuery({ queryKey: ["staff-roster"], queryFn: fetchStaffList, staleTime: 5 * 60 * 1000 });
  const staffNameByUserId = useMemo(() => new Map((staff ?? []).map((s) => [s.userId, s.name])), [staff]);

  const openMutation = useMutation({
    mutationFn: (amount: number) => openShift(amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-shift-current"] });
      toast.success("Shift opened.");
      setOpeningFloat("");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't open a shift — please try again."),
  });

  const movementMutation = useMutation({
    mutationFn: () => recordCashMovement({ type: moveType, amount: Number(moveAmount), note: moveNote.trim() || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-shift-current"] });
      toast.success(`${MOVEMENT_LABEL[moveType]} recorded.`);
      setMoveAmount("");
      setMoveNote("");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't record this movement — please try again."),
  });

  const filteredMovements = useMemo(() => {
    if (!shift) return [];
    return shift.movements.filter((m) => {
      if (staffFilter !== "all" && m.recordedByUserId !== staffFilter) return false;
      if (typeFilter !== "all" && m.type !== typeFilter) return false;
      if (dateFilter && m.createdAt.slice(0, 10) !== dateFilter) return false;
      return true;
    });
  }, [shift, staffFilter, typeFilter, dateFilter]);

  const runningBalance = useMemo(() => {
    if (!shift) return [];
    let balance = 0;
    return shift.movements.map((m) => {
      balance += m.amount * MOVEMENT_SIGN[m.type];
      return { time: m.createdAt, balance };
    });
  }, [shift]);

  const expectedCash = runningBalance.length > 0 ? runningBalance[runningBalance.length - 1].balance : (shift?.openingFloat ?? 0);

  if (isError) {
    return <ErrorBanner title="Couldn't load the cash register" onRetry={() => refetch()} />;
  }

  if (isPending) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-1 p-4">
          <SkeletonRow />
          <SkeletonRow />
        </CardContent>
      </Card>
    );
  }

  if (!shift) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <PlayCircle className="h-8 w-8 text-fg-faint" aria-hidden />
          <div>
            <p className="font-display text-base font-semibold text-fg">No shift is open</p>
            <p className="text-sm text-fg-muted">Open one to start recording cash movements for this drawer.</p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              value={openingFloat}
              onChange={(e) => setOpeningFloat(e.target.value)}
              placeholder="Opening float"
              className="w-40"
            />
            <Button onClick={() => openMutation.mutate(Number(openingFloat) || 0)} disabled={openMutation.isPending}>
              {openMutation.isPending ? "Opening…" : "Open shift"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Opened" value={`${formatDate(shift.openedAt)} · ${formatTime(shift.openedAt)}`} />
        <StatCard label="Opening float" value={formatCurrency(shift.openingFloat, session.business.currency)} />
        {isOwnerOrManager && <StatCard label="Expected cash now" value={formatCurrency(expectedCash, session.business.currency)} />}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Record a movement</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-2.5">
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setMoveType("cash_in")}
                className={`flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-3 py-2 text-sm font-medium ${
                  moveType === "cash_in" ? "border-whatsapp bg-whatsapp/8 text-whatsapp" : "border-border text-fg-muted hover:bg-surface-2"
                }`}
              >
                <ArrowDownCircle className="h-4 w-4" aria-hidden />
                Cash in
              </button>
              <button
                type="button"
                onClick={() => setMoveType("cash_out")}
                className={`flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-3 py-2 text-sm font-medium ${
                  moveType === "cash_out" ? "border-destructive bg-destructive/8 text-destructive" : "border-border text-fg-muted hover:bg-surface-2"
                }`}
              >
                <ArrowUpCircle className="h-4 w-4" aria-hidden />
                Cash out
              </button>
            </div>
            <Input type="number" min={0} value={moveAmount} onChange={(e) => setMoveAmount(e.target.value)} placeholder="Amount" className="w-32" />
            <Input value={moveNote} onChange={(e) => setMoveNote(e.target.value)} placeholder="Note (optional)" className="w-48" />
            <Button onClick={() => movementMutation.mutate()} disabled={!moveAmount || Number(moveAmount) <= 0 || movementMutation.isPending}>
              {movementMutation.isPending ? "Recording…" : "Record"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Movement timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {isOwnerOrManager && runningBalance.length > 0 && <RunningBalanceChart data={runningBalance} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Movements</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {staff && staff.length > 0 && (
              <Select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} className="w-36" aria-label="Filter by staff">
                <option value="all">All staff</option>
                {staff.map((s) => (
                  <option key={s.userId} value={s.userId}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
            <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as CashMovementType | "all")} className="w-32" aria-label="Filter by type">
              <option value="all">All types</option>
              {(Object.keys(MOVEMENT_LABEL) as CashMovementType[]).map((t) => (
                <option key={t} value={t}>
                  {MOVEMENT_LABEL[t]}
                </option>
              ))}
            </Select>
            <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="w-40" aria-label="Filter by date" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredMovements.length === 0 ? (
            <EmptyState icon={Wallet} title="No movements match these filters" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-fg-faint">
                    <th className="px-5 py-2 font-medium">Time</th>
                    <th className="px-5 py-2 font-medium">Type</th>
                    <th className="px-5 py-2 font-medium">Recorded by</th>
                    <th className="px-5 py-2 font-medium">Note</th>
                    <th className="px-5 py-2 text-end font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredMovements
                    .slice()
                    .reverse()
                    .map((m) => (
                      <MovementRow key={m.id} movement={m} currency={session.business.currency} staffName={m.recordedByUserId ? staffNameByUserId.get(m.recordedByUserId) : undefined} />
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface-2/40 px-3.5 py-2.5">
      <p className="font-display text-lg font-bold tabular-nums text-fg">{value}</p>
      <p className="text-xs text-fg-muted">{label}</p>
    </div>
  );
}

function MovementRow({ movement, currency, staffName }: { movement: LiveCashMovement; currency: string; staffName?: string }) {
  const positive = MOVEMENT_SIGN[movement.type] === 1;
  return (
    <tr>
      <td className="px-5 py-2.5 text-fg-muted">{formatTime(movement.createdAt)}</td>
      <td className="px-5 py-2.5 text-fg">{MOVEMENT_LABEL[movement.type]}</td>
      <td className="px-5 py-2.5 text-fg-muted">{staffName ?? "—"}</td>
      <td className="max-w-xs truncate px-5 py-2.5 text-fg-muted">{movement.note ?? "—"}</td>
      <td className={`px-5 py-2.5 text-end font-medium tabular-nums ${positive ? "text-whatsapp" : "text-destructive"}`}>
        {positive ? "+" : "−"}
        {formatCurrency(movement.amount, currency)}
      </td>
    </tr>
  );
}

function RunningBalanceChart({ data }: { data: { time: string; balance: number }[] }) {
  const width = 560;
  const height = 120;
  const max = Math.max(...data.map((d) => d.balance), 1);
  const min = Math.min(...data.map((d) => d.balance), 0);
  const range = max - min || 1;
  const points = data.map((d, i) => ({
    x: data.length > 1 ? (i / (data.length - 1)) * width : width / 2,
    y: height - ((d.balance - min) / range) * height,
  }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Cash balance over the shift">
      <path d={areaPath} fill="var(--chart-1)" opacity={0.08} />
      <path d={linePath} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

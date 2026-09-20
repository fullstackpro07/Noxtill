"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { fetchStaffList } from "@/lib/staff-api";
import { formatCurrency, formatTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { fetchCurrentShift, openShift, recordCashMovement, type CashMovementType, type LiveCashMovement } from "@/lib/cash-register-api";
import { PosModalShell } from "./pos-modal-shell";

const btnOutline: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const btnPrimary: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };
const btnDark: React.CSSProperties = { border: 0, background: "var(--app-sidebar-bg)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };
const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 42 };
const cancelStyle: React.CSSProperties = { background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" };

const MOVEMENT_LABEL: Record<CashMovementType, string> = {
  opening: "Opening",
  sale: "Sale",
  cash_in: "Cash In",
  cash_out: "Cash Out",
  refund: "Refund",
};
const MOVEMENT_SIGN: Record<CashMovementType, 1 | -1> = { opening: 1, sale: 1, cash_in: 1, cash_out: -1, refund: -1 };
const MOVEMENT_BADGE: Record<CashMovementType, { bg: string; fg: string }> = {
  opening: { bg: "var(--app-surface-2)", fg: "var(--app-text-faint)" },
  sale: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)" },
  cash_in: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)" },
  cash_out: { bg: "#FEF3F2", fg: "var(--app-danger-strong)" },
  refund: { bg: "#FEF3F2", fg: "var(--app-danger-strong)" },
};

function StatCard({ label, value, valueColor, dark }: { label: string; value: React.ReactNode; valueColor?: string; dark?: boolean }) {
  return (
    <div
      className="rounded-[14px] p-[15px]"
      style={dark ? { background: "var(--app-sidebar-bg)", border: "1px solid var(--app-sidebar-bg)" } : { background: "var(--app-surface)", border: "1px solid var(--app-border)" }}
    >
      <div className="text-[12px] font-semibold" style={{ color: dark ? "#8EA3B4" : "var(--app-text-faintest)" }}>{label}</div>
      <div className="mt-[5px] text-[20px] font-extrabold" style={{ color: dark ? "#fff" : valueColor ?? "var(--app-text)", letterSpacing: "-.4px" }}>{value}</div>
    </div>
  );
}

/** Cash Movement Timeline — real running balance across the open shift's movements (opening float
 * plus every sale/refund/cash-in/cash-out in order), matching the design's grid+line chart shape. */
function CashTimeline({ movements, openingFloat, currency }: { movements: LiveCashMovement[]; openingFloat: number; currency: string }) {
  const chart = useMemo(() => {
    const W = 860, L = 46, R = 12, T = 14, B = 30, PH = 196 - T - B, PW = W - L - R;
    const points = movements.reduce(
      (acc, m) => {
        const balance = acc[acc.length - 1].balance + m.amount * MOVEMENT_SIGN[m.type];
        acc.push({ time: formatTime(m.createdAt), balance });
        return acc;
      },
      [{ time: "Open", balance: openingFloat }],
    );
    const max = Math.max(1, ...points.map((p) => p.balance));
    const min = Math.min(0, ...points.map((p) => p.balance));
    const range = max - min || 1;
    const x = (i: number) => L + (points.length === 1 ? PW / 2 : i * (PW / (points.length - 1)));
    const y = (v: number) => T + PH * (1 - (v - min) / range);
    const pts = points.map((p, i) => ({ x: x(i), y: y(p.balance), label: p.time }));
    const line = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const area = `${line} L${pts[pts.length - 1].x.toFixed(1)} ${T + PH} L${pts[0].x.toFixed(1)} ${T + PH} Z`;
    const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ y: y(min + f * range), label: formatCurrency(min + f * range, currency) }));
    const labelEvery = Math.max(1, Math.ceil(pts.length / 8));
    return { pts, line, area, grid, labelEvery, W };
  }, [movements, openingFloat, currency]);

  return (
    <svg viewBox={`0 0 ${chart.W} 196`} className="block w-full" style={{ height: 196 }}>
      {chart.grid.map((g, i) => (
        <line key={i} x1={44} y1={g.y} x2={850} y2={g.y} stroke="#EDF0F4" strokeDasharray="4 4" />
      ))}
      {chart.grid.map((g, i) => (
        <text key={i} x={38} y={g.y + 3.5} textAnchor="end" fontSize={10.5} fill="#98A2B3" fontWeight={600}>{g.label}</text>
      ))}
      <path d={chart.area} fill="rgba(18,161,80,.10)" />
      <path d={chart.line} fill="none" stroke="var(--app-primary)" strokeWidth={2.4} strokeLinejoin="round" />
      {chart.pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3.4} fill="#fff" stroke="var(--app-primary)" strokeWidth={1.8} />
          {i % chart.labelEvery === 0 && (
            <text x={p.x} y={190} textAnchor="middle" fontSize={10} fill="#667085" fontWeight={600}>{p.label}</text>
          )}
        </g>
      ))}
    </svg>
  );
}

export function CashRegisterView() {
  const session = useSession();
  const router = useRouter();
  const isOwnerOrManager = session.user.role !== "staff";
  const queryClient = useQueryClient();
  const [openingFloatDraft, setOpeningFloatDraft] = useState("10000");
  const [openShiftOpen, setOpenShiftOpen] = useState(false);
  const [cashModal, setCashModal] = useState<"in" | "out" | null>(null);
  const [cashAmount, setCashAmount] = useState("");
  const [cashReason, setCashReason] = useState("");
  const [staffFilter, setStaffFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<CashMovementType | "all">("all");

  const { data: shift } = useQuery({ queryKey: ["cash-shift-current"], queryFn: fetchCurrentShift, refetchInterval: 30_000 });
  const { data: staff } = useQuery({ queryKey: ["staff-roster"], queryFn: () => fetchStaffList(), staleTime: 5 * 60 * 1000 });
  const staffNameByUserId = useMemo(() => new Map((staff ?? []).map((s) => [s.userId, s.name])), [staff]);

  const openMutation = useMutation({
    mutationFn: (amount: number) => openShift(amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-shift-current"] });
      toast.success("Shift opened.");
      setOpenShiftOpen(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't open a shift — please try again."),
  });

  const movementMutation = useMutation({
    mutationFn: () => recordCashMovement({ type: cashModal === "in" ? "cash_in" : "cash_out", amount: Number(cashAmount), note: cashReason || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-shift-current"] });
      toast.success(cashModal === "in" ? "Cash in recorded." : "Cash out recorded.");
      setCashModal(null);
      setCashAmount("");
      setCashReason("");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't record this movement — please try again."),
  });

  const filteredMovements = useMemo(() => {
    if (!shift) return [];
    return shift.movements.filter((m) => {
      if (staffFilter !== "all" && m.recordedByUserId !== staffFilter) return false;
      if (typeFilter !== "all" && m.type !== typeFilter) return false;
      return true;
    });
  }, [shift, staffFilter, typeFilter]);

  const cashSales = (shift?.movements ?? []).filter((m) => m.type === "sale").reduce((s, m) => s + m.amount, 0);
  const cashRefunds = (shift?.movements ?? []).filter((m) => m.type === "refund").reduce((s, m) => s + m.amount, 0);
  const cashInOut = (shift?.movements ?? []).reduce((s, m) => s + (m.type === "cash_in" ? m.amount : m.type === "cash_out" ? -m.amount : 0), 0);
  const expectedCash = shift ? shift.openingFloat + cashSales - cashRefunds + cashInOut : 0;
  const branchName = session.business.branches[0]?.name;

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="m-0 text-[20px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.5px" }}>Cash Register</h2>
            {shift ? (
              <span className="rounded-full px-[11px] py-[3px] text-[11.5px] font-bold" style={{ background: "var(--app-success-bg)", color: "var(--app-success-text)" }}>
                Open since {formatTime(shift.openedAt)}
              </span>
            ) : (
              <span className="rounded-full px-[11px] py-[3px] text-[11.5px] font-bold" style={{ background: "var(--app-surface-2)", color: "var(--app-text-faintest)" }}>Closed</span>
            )}
          </div>
          <p className="mt-[3px] text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>
            {branchName ? `Physical drawer for ${branchName} branch` : "Physical drawer for this business"}
          </p>
        </div>
        <div className="ms-auto flex flex-wrap gap-[9px]">
          {!shift ? (
            <button type="button" onClick={() => setOpenShiftOpen(true)} style={btnPrimary}>Open Shift</button>
          ) : (
            <>
              <button type="button" onClick={() => setCashModal("in")} style={btnOutline}>Cash In</button>
              <button type="button" onClick={() => setCashModal("out")} style={btnOutline}>Cash Out</button>
              <button type="button" onClick={() => router.push("/sales/shift-closing")} style={btnDark}>Close Shift</button>
            </>
          )}
        </div>
      </div>

      {!shift ? (
        <div className="rounded-[16px] p-[48px_20px] text-center" style={{ background: "var(--app-surface)", border: "1px dashed var(--app-border-strong)" }}>
          <div className="text-[14.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>No open shift — open one to start recording cash</div>
          <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Cash movements are only tracked while a shift is open.</div>
          <button type="button" onClick={() => setOpenShiftOpen(true)} className="mt-[15px] rounded-[12px] p-[13px_22px] text-[13px] font-extrabold text-white" style={{ background: "var(--app-primary)", minHeight: 48 }}>Open Shift</button>
        </div>
      ) : (
        <div className="flex flex-col gap-[15px]">
          <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(185px,1fr))" }}>
            <StatCard label="Opening Float" value={formatCurrency(shift.openingFloat, session.business.currency)} />
            <StatCard label="Cash Sales" value={formatCurrency(cashSales, session.business.currency)} valueColor="var(--app-primary)" />
            <StatCard label="Cash Refunds" value={formatCurrency(cashRefunds, session.business.currency)} valueColor="var(--app-danger-strong)" />
            <StatCard label="Cash In / Out" value={`${cashInOut >= 0 ? "+ " : "− "}${formatCurrency(Math.abs(cashInOut), session.business.currency)}`} />
            <StatCard
              label="Expected In Drawer"
              value={isOwnerOrManager ? formatCurrency(expectedCash, session.business.currency) : <span className="text-[13px] font-bold" style={{ color: "#8FF0BB" }}>Hidden for your role</span>}
              dark
            />
          </div>

          <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <h3 className="m-0 mb-2 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Cash Movement Timeline</h3>
            <CashTimeline movements={shift.movements} openingFloat={shift.openingFloat} currency={session.business.currency} />
          </div>

          <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <div className="flex flex-wrap items-center gap-[9px] p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
              <h3 className="m-0 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Movements</h3>
              <div className="ms-auto flex flex-wrap gap-2">
                {staff && staff.length > 0 && (
                  <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} aria-label="Staff" style={selectStyle}>
                    <option value="all">All staff</option>
                    {staff.map((s) => (
                      <option key={s.userId} value={s.userId}>{s.name}</option>
                    ))}
                  </select>
                )}
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as CashMovementType | "all")} aria-label="Movement type" style={selectStyle}>
                  <option value="all">All types</option>
                  {(Object.keys(MOVEMENT_LABEL) as CashMovementType[]).map((t) => (
                    <option key={t} value={t}>{MOVEMENT_LABEL[t]}</option>
                  ))}
                </select>
              </div>
            </div>
            {filteredMovements.length === 0 ? (
              <div className="p-[44px_18px] text-center text-[13px]" style={{ color: "var(--app-text-disabled)" }}>No movements match these filters.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: 640 }}>
                  <thead>
                    <tr style={{ background: "var(--app-surface-2)" }}>
                      <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Time</th>
                      <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Type</th>
                      <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Amount</th>
                      <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Staff</th>
                      <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMovements.slice().reverse().map((m) => {
                      const positive = MOVEMENT_SIGN[m.type] === 1;
                      const badge = MOVEMENT_BADGE[m.type];
                      return (
                        <tr key={m.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                          <td className="p-[12px_17px] text-[12.5px] font-bold whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>{formatTime(m.createdAt)}</td>
                          <td className="p-[12px]">
                            <span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: badge.bg, color: badge.fg }}>{MOVEMENT_LABEL[m.type]}</span>
                          </td>
                          <td className="p-[12px] text-end text-[12.5px] font-extrabold" style={{ color: positive ? "var(--app-text)" : "var(--app-danger-strong)" }}>
                            {positive ? "+" : "−"}{formatCurrency(m.amount, session.business.currency)}
                          </td>
                          <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{m.recordedByUserId ? staffNameByUserId.get(m.recordedByUserId) ?? "Staff" : "—"}</td>
                          <td className="p-[12px_17px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>{m.note ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <PosModalShell
        open={openShiftOpen}
        onClose={() => setOpenShiftOpen(false)}
        title="Open Shift"
        footer={
          <>
            <button type="button" onClick={() => setOpenShiftOpen(false)} style={cancelStyle}>Cancel</button>
            <button type="button" onClick={() => openMutation.mutate(Number(openingFloatDraft) || 0)} disabled={openMutation.isPending} style={{ ...btnPrimary, opacity: openMutation.isPending ? 0.6 : 1 }}>
              {openMutation.isPending ? "Opening…" : "Open Shift"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5 p-[17px]">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>OPENING FLOAT</span>
            <input
              type="number"
              min={0}
              value={openingFloatDraft}
              onChange={(e) => setOpeningFloatDraft(e.target.value)}
              autoFocus
              className="w-full rounded-[11px] p-[12px] text-[17px] font-extrabold"
              style={{ border: "1px solid var(--app-border)" }}
            />
          </label>
        </div>
      </PosModalShell>

      <PosModalShell
        open={cashModal != null}
        onClose={() => setCashModal(null)}
        title={cashModal === "in" ? "Cash In" : "Cash Out"}
        footer={
          <>
            <button type="button" onClick={() => setCashModal(null)} style={cancelStyle}>Cancel</button>
            <button
              type="button"
              onClick={() => movementMutation.mutate()}
              disabled={!cashAmount || Number(cashAmount) <= 0 || movementMutation.isPending}
              style={cashModal === "in" ? { ...btnPrimary, opacity: movementMutation.isPending ? 0.6 : 1 } : { ...btnDark, opacity: movementMutation.isPending ? 0.6 : 1 }}
            >
              {movementMutation.isPending ? "Saving…" : cashModal === "in" ? "Add Cash" : "Record Cash Out"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5 p-[17px]">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>AMOUNT</span>
            <input
              type="number"
              min={0}
              value={cashAmount}
              onChange={(e) => setCashAmount(e.target.value)}
              autoFocus
              className="w-full rounded-[11px] p-[12px] text-[17px] font-extrabold"
              style={{ border: "1px solid var(--app-border)" }}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>NOTE (OPTIONAL)</span>
            <input
              value={cashReason}
              onChange={(e) => setCashReason(e.target.value)}
              placeholder={cashModal === "in" ? "e.g. Petty cash" : "e.g. Expense"}
              className="w-full rounded-[11px] p-[12px] text-[13.5px]"
              style={{ border: "1px solid var(--app-border)" }}
            />
          </label>
        </div>
      </PosModalShell>
    </main>
  );
}

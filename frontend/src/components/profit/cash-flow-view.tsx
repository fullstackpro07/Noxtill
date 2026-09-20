"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, Power, AlertTriangle } from "lucide-react";
import {
  fetchCashForecast,
  fetchRecurringObligations,
  updateRecurringObligation,
  deleteRecurringObligation,
  type RecurringObligation,
} from "@/lib/cash-forecast-api";
import { fetchPnl } from "@/lib/profit-api";
import { fetchDebtors } from "@/lib/credit-api";
import { RecurringObligationDialog } from "./recurring-obligation-dialog";
import { formatCurrency, formatDate } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { useSession } from "@/lib/session";

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function CashFlowView() {
  const session = useSession();
  const currency = session.business.currency;
  const [horizon, setHorizon] = useState(30);
  const [includeObligations, setIncludeObligations] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<RecurringObligation | null>(null);
  const [deleting, setDeleting] = useState<RecurringObligation | null>(null);
  const [shortfallOpen, setShortfallOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: forecast, isPending, isError, refetch } = useQuery({ queryKey: ["cash-forecast", horizon], queryFn: () => fetchCashForecast(horizon) });
  const { data: obligations = [], isPending: obligationsPending } = useQuery({ queryKey: ["recurring-obligations"], queryFn: fetchRecurringObligations });
  const { data: pnl } = useQuery({ queryKey: ["profit-pnl", currentMonth()], queryFn: () => fetchPnl(currentMonth()) });
  const { data: debtors = [] } = useQuery({ queryKey: ["credit-debtors"], queryFn: () => fetchDebtors() });

  const toggleMutation = useMutation({
    mutationFn: (o: RecurringObligation) => updateRecurringObligation(o.id, { active: !o.active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring-obligations"] });
      queryClient.invalidateQueries({ queryKey: ["cash-forecast"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this — please try again."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRecurringObligation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring-obligations"] });
      queryClient.invalidateQueries({ queryKey: ["cash-forecast"] });
      toast.success("Obligation removed.");
      setDeleting(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't remove this — please try again."),
  });

  const projection = useMemo(() => {
    if (!forecast) return [];
    let cumulative = 0;
    return forecast.projection.map((d) => {
      const netFlow = includeObligations ? d.netFlow : round2(d.inflow - d.outflow + d.obligationsDue);
      cumulative = round2(cumulative + netFlow);
      return { ...d, cumulativeNet: cumulative };
    });
  }, [forecast, includeObligations]);

  if (isError) {
    return (
      <div className="mx-6 mt-6 rounded-[16px] p-6 text-center" style={{ background: "var(--app-surface)", border: "1px solid #FDD9D6" }}>
        <p className="m-0 text-[14.5px] font-extrabold" style={{ color: "#B42318" }}>Couldn&apos;t load the cash flow forecast</p>
        <button type="button" onClick={() => refetch()} className="mt-3 rounded-[12px] px-5 py-2.5 text-[13px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>Retry</button>
      </div>
    );
  }

  const shortfallDate = projection.find((d) => d.cumulativeNet < 0)?.date ?? null;
  const shortfallAmount = shortfallDate ? projection.find((d) => d.date === shortfallDate)!.cumulativeNet : 0;
  const lowPoint = projection.length ? Math.min(...projection.map((d) => d.cumulativeNet)) : 0;
  const receivablesTotal = debtors.reduce((sum, d) => sum + d.balance, 0);

  const min = Math.min(0, ...projection.map((d) => d.cumulativeNet));
  const max = Math.max(0, ...projection.map((d) => d.cumulativeNet), 1);
  const W = 620, PH = 108, T = 14;
  const x = (i: number) => 34 + i * ((W - 48) / Math.max(1, projection.length - 1));
  const y = (v: number) => T + PH * (1 - (v - min) / (max - min));
  const pts = projection.map((d, i) => ({ x: +x(i).toFixed(1), y: +y(d.cumulativeNet).toFixed(1) }));
  const linePath = pts.map((p, i) => (i ? "L" : "M") + p.x + " " + p.y).join(" ");
  const areaPath = pts.length ? `${linePath} L${pts[pts.length - 1].x} ${T + PH} L${pts[0].x} ${T + PH} Z` : "";
  const zeroY = +y(0).toFixed(1);
  const gridVals = [max, (max + min) / 2, min];

  const obligationTotal = obligations.filter((o) => o.active).reduce((sum, o) => sum + o.amount, 0);
  const inOut = pnl ? [
    { l: "Cash in", label: formatCurrency(pnl.revenue, currency), w: 100, color: "#12A150" },
    { l: "Cash out", label: formatCurrency(pnl.cogs + pnl.totalExpenses + pnl.wastageCost, currency), w: Math.min(100, ((pnl.cogs + pnl.totalExpenses + pnl.wastageCost) / Math.max(1, pnl.revenue)) * 100), color: "#F97316" },
  ] : [];

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[9px]">
        <select
          value={String(horizon)}
          onChange={(e) => {
            if (e.target.value.indexOf("+ Add") === 0) { toast.info("Custom option builder — not available yet."); return; }
            if (e.target.value === "Custom") { toast.info("Custom horizon — not available yet."); return; }
            setHorizon(Number(e.target.value));
          }}
          aria-label="Horizon"
          className="rounded-[11px] text-[12.5px] font-semibold"
          style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", padding: "10px 12px", minHeight: 44 }}
        >
          <option value="14">14 Days</option>
          <option value="30">30 Days</option>
          <option value="60">60 Days</option>
          <option>Custom</option>
          <option>+ Add your own…</option>
        </select>
        <span className="flex items-center gap-[9px] rounded-[11px]" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", padding: "9px 13px", minHeight: 44 }}>
          <span className="text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>Include projections</span>
          <button
            type="button"
            role="switch"
            aria-checked={includeObligations}
            aria-label="Include projections"
            onClick={() => setIncludeObligations((v) => !v)}
            className="relative rounded-full"
            style={{ width: 38, height: 21, border: 0, background: includeObligations ? "#12A150" : "#D5DCE4" }}
          >
            <span className="absolute rounded-full bg-white" style={{ top: 2, width: 17, height: 17, left: includeObligations ? 19 : 2 }} />
          </button>
        </span>
        <div className="ml-auto flex flex-wrap gap-[9px]">
          {shortfallDate && (
            <button type="button" onClick={() => setShortfallOpen(true)} className="rounded-[11px] text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", padding: "11px 15px", minHeight: 44 }}>
              View Suggestions
            </button>
          )}
          <button type="button" onClick={() => setCreating(true)} className="rounded-[11px] text-[12.5px] font-extrabold text-white" style={{ background: "var(--app-primary)", padding: "11px 18px", minHeight: 44 }}>
            Add Obligation
          </button>
        </div>
      </div>

      {shortfallDate && (
        <div className="rounded-[16px] p-4" style={{ background: "#FEF3F2", border: "1.5px solid #FDD9D6" }}>
          <div className="flex flex-wrap items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "#B42318" }} aria-hidden />
            <div className="min-w-[200px] flex-1">
              <div className="text-[13.5px] font-extrabold" style={{ color: "#912018" }}>Projected cash goes below zero around {formatDate(shortfallDate)}</div>
              <div className="mt-1 text-[12.5px] leading-relaxed" style={{ color: "#B42318" }}>
                The forecast dips to {formatCurrency(shortfallAmount, currency)}. These are projections from your recurring obligations and trailing sales pace, not certainties.
              </div>
            </div>
            <button type="button" onClick={() => setShortfallOpen(true)} className="rounded-[11px] text-[12.5px] font-extrabold text-white" style={{ background: "#B42318", padding: "11px 16px", minHeight: 44 }}>
              See ranked actions
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(175px,1fr))" }}>
        {isPending || !pnl ? (
          Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-[86px] animate-pulse rounded-[14px]" style={{ background: "var(--app-surface-2)" }} />)
        ) : (
          <>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faint)" }}>Cash In This Month</div>
              <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "#12A150" }}>{formatCurrency(pnl.revenue, currency)}</div>
            </div>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faint)" }}>Cash Out</div>
              <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "#F97316" }}>{formatCurrency(pnl.cogs + pnl.totalExpenses + pnl.wastageCost, currency)}</div>
            </div>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faint)" }}>Net</div>
              <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(pnl.netProfit, currency)}</div>
            </div>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1.5px solid #FDD9D6" }}>
              <div className="text-[12px] font-bold" style={{ color: "#B42318" }}>Projected Low Point</div>
              <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: lowPoint < 0 ? "#B42318" : "var(--app-text)" }}>{formatCurrency(lowPoint, currency)}</div>
              <div className="mt-1 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>Forecast, not actual</div>
            </div>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faint)" }}>Receivables Outstanding</div>
              <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(receivablesTotal, currency)}</div>
            </div>
          </>
        )}
      </div>

      <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="mb-1.5 flex flex-wrap items-center gap-3">
          <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Cash flow forecast</h3>
          <span className="rounded-[6px] text-[10.5px] font-extrabold uppercase tracking-[.4px]" style={{ color: "#B54708", background: "#FEF6E7", padding: "3px 8px" }}>Projection</span>
        </div>
        {projection.length === 0 ? (
          <div className="flex h-[150px] items-center justify-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Not enough data yet.</div>
        ) : (
          <svg viewBox="0 0 620 150" style={{ width: "100%", height: 150, display: "block" }}>
            {gridVals.map((v, i) => (
              <g key={i}>
                <line x1={44} x2={608} y1={y(v)} y2={y(v)} stroke="#EDF0F4" strokeDasharray="4 4" />
                <text x={38} y={y(v) + 3.5} textAnchor="end" fontSize={10} fill="#98A2B3" fontWeight={600}>{formatCurrency(v, currency)}</text>
              </g>
            ))}
            <line x1={34} x2={608} y1={zeroY} y2={zeroY} stroke="#B42318" strokeWidth={1.5} />
            <text x={612} y={zeroY} fontSize={9.5} fill="#B42318" fontWeight={800}>0</text>
            <path d={areaPath} fill="rgba(37,99,235,.09)" />
            <path d={linePath} fill="none" stroke="#2563EB" strokeWidth={2.4} strokeLinejoin="round" />
          </svg>
        )}
      </div>

      <div className="grid gap-[15px]" style={{ gridTemplateColumns: "340px minmax(0,1fr)", alignItems: "start" }}>
        <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-3 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Inflow vs outflow — this month</h3>
          {inOut.length === 0 ? (
            <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Loading…</p>
          ) : (
            <div className="flex flex-col gap-3">
              {inOut.map((i) => (
                <div key={i.l}>
                  <div className="mb-[5px] flex justify-between">
                    <span className="text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{i.l}</span>
                    <span className="text-[12px] font-extrabold" style={{ color: "var(--app-text)" }}>{i.label}</span>
                  </div>
                  <div className="h-[12px] overflow-hidden rounded-[7px]" style={{ background: "var(--app-surface-2)" }}>
                    <div className="h-full rounded-[7px]" style={{ width: `${i.w}%`, background: i.color }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0 overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="flex items-center gap-2.5" style={{ padding: "13px 17px", borderBottom: "1px solid var(--app-surface-2)" }}>
            <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Recurring obligations</h3>
            <span className="ml-auto text-[11.5px] font-bold" style={{ color: "#B54708" }}>{formatCurrency(obligationTotal, currency)} / month</span>
          </div>
          {obligationsPending ? (
            <div className="p-4 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Loading…</div>
          ) : obligations.length === 0 ? (
            <div className="text-center" style={{ padding: "48px 18px" }}>
              <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Add your recurring costs to see the forecast</div>
              <button type="button" onClick={() => setCreating(true)} className="mt-[15px] rounded-[12px] text-[13px] font-extrabold text-white" style={{ background: "var(--app-primary)", padding: "12px 22px", minHeight: 46 }}>Add Obligation</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: 560 }}>
                <thead>
                  <tr style={{ background: "var(--app-surface-2)" }}>
                    <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Name</th>
                    <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Amount</th>
                    <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Frequency</th>
                    <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Category</th>
                    <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Next due</th>
                    <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {obligations.map((o) => (
                    <tr key={o.id} onClick={() => setEditing(o)} style={{ borderTop: "1px solid var(--app-border-strong)", opacity: o.active ? 1 : 0.55, cursor: "pointer" }}>
                      <td style={{ padding: "11px 17px", fontSize: 12.5, fontWeight: 700, color: "#0E8442" }}>{o.name}{!o.active && " (paused)"}</td>
                      <td style={{ padding: 11, fontSize: 12.5, fontWeight: 700, color: "var(--app-text)", textAlign: "right" }}>{formatCurrency(o.amount, currency)}</td>
                      <td style={{ padding: 11, fontSize: 12.5, color: "var(--app-text-faint)" }}>{FREQUENCY_LABELS[o.frequency]}</td>
                      <td style={{ padding: 11, fontSize: 12, color: "var(--app-text-faint)" }}>{o.category ?? "—"}</td>
                      <td style={{ padding: 11, fontSize: 12, color: "var(--app-text-disabled)", whiteSpace: "nowrap" }}>{formatDate(o.nextDueDate)}</td>
                      <td style={{ padding: "11px 17px", textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                        <span className="inline-flex gap-1.5">
                          <button type="button" aria-label={o.active ? "Pause" : "Resume"} onClick={() => toggleMutation.mutate(o)} className="rounded-[9px]" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", padding: "8px 10px", minHeight: 40 }}>
                            <Power className="h-3.5 w-3.5" aria-hidden />
                          </button>
                          <button type="button" aria-label="Edit" onClick={() => setEditing(o)} className="rounded-[9px]" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", padding: "8px 10px", minHeight: 40 }}>
                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                          </button>
                          <button type="button" aria-label="Delete" onClick={() => setDeleting(o)} className="rounded-[9px]" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", padding: "8px 10px", minHeight: 40 }}>
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {creating && <RecurringObligationDialog onClose={() => setCreating(false)} />}
      {editing && <RecurringObligationDialog obligation={editing} onClose={() => setEditing(null)} />}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5" style={{ background: "rgba(10,27,42,.42)" }} onClick={() => setDeleting(null)}>
          <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="w-full max-w-[420px] rounded-[18px]" style={{ background: "var(--app-surface)", boxShadow: "0 30px 80px rgba(10,27,42,.32)" }}>
            <div className="p-[17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
              <h3 className="m-0 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>Remove &quot;{deleting.name}&quot;?</h3>
            </div>
            <div className="flex justify-end gap-2.5 p-[17px]">
              <button type="button" onClick={() => setDeleting(null)} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Cancel</button>
              <button type="button" onClick={() => deleteMutation.mutate(deleting.id)} disabled={deleteMutation.isPending} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-extrabold text-white" style={{ background: "#B42318" }}>
                {deleteMutation.isPending ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}

      {shortfallOpen && shortfallDate && (
        <ShortfallDrawer
          shortfallDate={shortfallDate}
          shortfallAmount={shortfallAmount}
          currency={currency}
          obligations={obligations}
          receivablesTotal={receivablesTotal}
          debtorCount={debtors.length}
          onClose={() => setShortfallOpen(false)}
        />
      )}
    </main>
  );
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function ShortfallDrawer({
  shortfallDate,
  shortfallAmount,
  currency,
  obligations,
  receivablesTotal,
  debtorCount,
  onClose,
}: {
  shortfallDate: string;
  shortfallAmount: number;
  currency: string;
  obligations: RecurringObligation[];
  receivablesTotal: number;
  debtorCount: number;
  onClose: () => void;
}) {
  const upcoming = [...obligations]
    .filter((o) => o.active && new Date(o.nextDueDate) <= new Date(shortfallDate))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);

  const actions: { label: string; note: string }[] = [];
  if (receivablesTotal > 0) {
    actions.push({
      label: `Chase outstanding receivables — ${formatCurrency(receivablesTotal, currency)}`,
      note: `Owed by ${debtorCount} customer${debtorCount === 1 ? "" : "s"}, not yet counted in this forecast`,
    });
  }
  for (const o of upcoming) {
    actions.push({
      label: `Review "${o.name}" — ${formatCurrency(o.amount, currency)}`,
      note: `Due ${formatDate(o.nextDueDate)}, before the projected shortfall`,
    });
  }

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[80]" style={{ background: "rgba(10,27,42,.42)" }} />
      <div className="fixed inset-0 z-[85] flex items-center justify-center p-5" style={{ pointerEvents: "none" }}>
        <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="w-full max-w-[490px] rounded-[18px]" style={{ background: "var(--app-surface)", boxShadow: "0 30px 80px rgba(10,27,42,.32)", pointerEvents: "auto" }}>
          <div className="p-[17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
            <h3 className="m-0 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>Ranked actions</h3>
          </div>
          <div className="flex flex-col gap-3 p-[17px]">
            <div className="rounded-[12px] p-3" style={{ background: "#FEF3F2", border: "1px solid #FDD9D6" }}>
              <div className="text-[12.5px] font-extrabold" style={{ color: "#912018" }}>Forecast dips {formatCurrency(shortfallAmount, currency)} below zero around {formatDate(shortfallDate)}</div>
              <div className="mt-1.5 text-[12px] leading-relaxed" style={{ color: "#B42318" }}>This is a projection from your recurring obligations and recent sales pattern — not a certainty.</div>
            </div>
            {actions.length === 0 ? (
              <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No specific levers found — review your obligations and receivables directly.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {actions.map((a, i) => (
                  <div key={i} className="flex items-center gap-2.5 rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
                    <span className="flex shrink-0 items-center justify-center rounded-full text-[11.5px] font-extrabold text-white" style={{ width: 26, height: 26, background: "#0A1B2A" }}>{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{a.label}</span>
                      <span className="mt-0.5 block text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{a.note}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="m-0 text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>These are suggestions ordered by likely impact. None of them guarantees the shortfall is covered.</p>
          </div>
          <div className="flex justify-end p-[14px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
            <button type="button" onClick={onClose} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>Close</button>
          </div>
        </div>
      </div>
    </>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/session";
import { formatCurrency, formatDate, formatRelativeTime } from "@/lib/format";
import { useNow } from "@/hooks/use-now";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { approveReturn, fetchReturns, rejectReturn, type LiveReturn, type ReturnStatus } from "@/lib/returns-api";
import { fetchOrders } from "@/lib/orders-api";
import { ReturnFormDrawer } from "./return-form-drawer";
import { PosModalShell } from "@/components/pos/pos-modal-shell";

const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 42 };
const primaryBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };
const cancelBtn: React.CSSProperties = { background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" };
const smallOutline: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 12px", fontSize: 11.5, fontWeight: 700, color: "var(--app-text-faintest)", minHeight: 40 };
const smallPrimary: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 9, padding: "8px 13px", fontSize: 11.5, fontWeight: 800, color: "#fff", minHeight: 40 };

const METHOD_LABEL: Record<string, string> = { cash: "Cash", card: "Card reversal", online: "Online reversal", credit: "Credit adjustment", store_credit: "Store credit" };
const STATUS_BADGE: Record<ReturnStatus, { bg: string; fg: string }> = {
  pending: { bg: "var(--app-warning-bg)", fg: "var(--app-warning-text)" },
  approved: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)" },
  rejected: { bg: "#FEF3F2", fg: "var(--app-danger-strong)" },
};

function startOfMonthIso(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

export function ReturnsPanel() {
  const session = useSession();
  const now = useNow(60_000);
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<ReturnStatus | "all">("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [approving, setApproving] = useState<LiveReturn | null>(null);
  const [rejecting, setRejecting] = useState<LiveReturn | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: allReturns } = useQuery({ queryKey: ["returns", "all"], queryFn: () => fetchReturns() });
  const { data: monthOrders } = useQuery({ queryKey: ["orders", "month-count"], queryFn: () => fetchOrders({ from: startOfMonthIso(), limit: 500 }) });

  const filtered = useMemo(() => (allReturns ?? []).filter((r) => statusFilter === "all" || r.status === statusFilter), [allReturns, statusFilter]);
  const monthReturns = useMemo(() => (allReturns ?? []).filter((r) => new Date(r.createdAt) >= new Date(startOfMonthIso())), [allReturns]);
  const pending = useMemo(() => (allReturns ?? []).filter((r) => r.status === "pending"), [allReturns]);

  const refundValue = monthReturns.reduce((s, r) => s + r.refundAmount, 0);
  const restockedValue = monthReturns.filter((r) => r.restock).reduce((s, r) => s + r.refundAmount, 0);
  const writeOffValue = monthReturns.filter((r) => !r.restock).reduce((s, r) => s + r.refundAmount, 0);
  const returnRate = monthOrders && monthOrders.length > 0 ? (monthReturns.length / monthOrders.length) * 100 : 0;

  const reasonGroups = useMemo(() => {
    const map = new Map<string, { count: number; value: number; restocked: number; writtenOff: number }>();
    for (const r of monthReturns) {
      const g = map.get(r.reason) ?? { count: 0, value: 0, restocked: 0, writtenOff: 0 };
      g.count += 1;
      g.value += r.refundAmount;
      if (r.restock) g.restocked += 1;
      else g.writtenOff += 1;
      map.set(r.reason, g);
    }
    const rows = Array.from(map.entries()).map(([reason, g]) => ({ reason, ...g }));
    rows.sort((a, b) => b.count - a.count);
    const maxCount = Math.max(1, ...rows.map((r) => r.count));
    return rows.map((r) => ({ ...r, pct: monthReturns.length > 0 ? Math.round((r.count / monthReturns.length) * 100) : 0, widthPct: Math.round((r.count / maxCount) * 100) }));
  }, [monthReturns]);

  const topReason = reasonGroups[0];

  // A customer with 2+ returns this quarter is flagged in the approval queue — a real, computed
  // signal (not fabricated), matching the design's "third return this quarter" pattern.
  const returnCountByCustomer = useMemo(() => {
    const quarterAgo = new Date();
    quarterAgo.setMonth(quarterAgo.getMonth() - 3);
    const map = new Map<string, number>();
    for (const r of allReturns ?? []) {
      if (!r.customerName || new Date(r.createdAt) < quarterAgo) continue;
      map.set(r.customerName, (map.get(r.customerName) ?? 0) + 1);
    }
    return map;
  }, [allReturns]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["returns"] });
  }

  const approveMutation = useMutation({
    mutationFn: (id: string) => approveReturn(id),
    onSuccess: () => {
      invalidate();
      toast.success("Return approved and refunded.");
      setApproving(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't approve this return."),
  });
  const rejectMutation = useMutation({
    mutationFn: () => rejectReturn(rejecting!.id, rejectReason.trim() || undefined),
    onSuccess: () => {
      invalidate();
      toast.success("Return rejected.");
      setRejecting(null);
      setRejectReason("");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't reject this return."),
  });

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Returns &amp; Refunds</h2>
        <button type="button" onClick={() => setDrawerOpen(true)} className="ms-auto" style={primaryBtn}>New Return</button>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Returns this month</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{monthReturns.length}</div>
          <div className="mt-1 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>{returnRate.toFixed(1)}% of orders</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Refund value</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(refundValue, session.business.currency)}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1.5px solid var(--app-success-border)" }}>
          <div className="text-[12px] font-bold" style={{ color: "var(--app-success-text)" }}>Value restocked</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(restockedValue, session.business.currency)}</div>
          <div className="mt-1 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>Back on the shelf</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1.5px solid #FDD9D6" }}>
          <div className="text-[12px] font-bold" style={{ color: "var(--app-danger-strong)" }}>Value written off</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(writeOffValue, session.business.currency)}</div>
          <div className="mt-1 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>Not resaleable</div>
        </div>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "minmax(0,1fr) 340px" }}>
        <div className="min-w-0 rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Why things come back</h3>
            <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: "var(--app-text-faint)" }}><span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: "var(--app-success-border)" }} />Restocked</span>
            <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: "var(--app-text-faint)" }}><span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: "#FDA29B" }} />Written off</span>
          </div>
          {reasonGroups.length === 0 ? (
            <p className="text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No returns recorded this month.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {reasonGroups.map((r) => (
                <div key={r.reason}>
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="min-w-[120px] flex-1 text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>{r.reason}</span>
                    <span className="text-[11.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{r.count} · {formatCurrency(r.value, session.business.currency)}</span>
                  </div>
                  <div className="h-[11px] overflow-hidden rounded-[6px]" style={{ background: "var(--app-surface-2)" }}>
                    <div className="h-full rounded-[6px]" style={{ width: `${r.widthPct}%`, background: r.restocked >= r.writtenOff ? "var(--app-success-border)" : "#FDA29B" }} />
                  </div>
                  <div className="mt-1 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>{r.pct}% of all returns</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-page-bg, #F7FCF9)", border: "1px solid var(--app-success-border)" }}>
          <div className="text-[10.5px] font-extrabold uppercase" style={{ color: "var(--app-success-text)", letterSpacing: ".4px" }}>Pattern worth noting</div>
          <div className="mt-2.5 text-[12.5px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
            {topReason ? `"${topReason.reason}" accounts for ${topReason.pct}% of this month's returns (${topReason.count} of ${monthReturns.length}).` : "Not enough returns this month to spot a pattern yet."}
          </div>
          <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--app-success-border)" }}>
            <div className="flex justify-between p-[5px_0] text-[12px]"><span style={{ color: "var(--app-success-text)" }}>Top reason</span><span className="font-bold" style={{ color: "var(--app-text-muted)" }}>{topReason?.reason ?? "—"}</span></div>
            <div className="flex justify-between p-[5px_0] text-[12px]"><span style={{ color: "var(--app-success-text)" }}>Return rate</span><span className="font-bold" style={{ color: "var(--app-text-muted)" }}>{returnRate.toFixed(1)}%</span></div>
          </div>
          <div className="mt-2.5 text-[11px] leading-relaxed" style={{ color: "var(--app-text-disabled)" }}>Drawn from this month&apos;s returns. A pattern is not a cause — worth checking before acting.</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap items-center gap-2.5 p-[14px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Waiting on approval</h3>
          <span className="text-[11px]" style={{ color: "var(--app-text-disabled)" }}>Refund and restock both happen only once approved</span>
        </div>
        {pending.length === 0 ? (
          <div className="p-[24px_17px] text-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Nothing waiting on approval.</div>
        ) : (
          pending.map((r) => {
            const flagCount = r.customerName ? returnCountByCustomer.get(r.customerName) ?? 0 : 0;
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-3 p-[13px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
                <span className="min-w-[190px] flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[12.5px] font-extrabold" style={{ color: "var(--app-success-text)" }}>#{r.orderNo}</span>
                    <span className="text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{r.customerName ?? "Walk-in"}</span>
                    {flagCount >= 2 && <span className="rounded-full px-2 py-0.5 text-[10px] font-extrabold" style={{ background: "var(--app-warning-bg)", color: "var(--app-warning-text)" }}>{flagCount}{flagCount === 1 ? "st" : flagCount === 2 ? "nd" : flagCount === 3 ? "rd" : "th"} return this quarter</span>}
                  </span>
                  <span className="mt-1 block text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>{r.reason} · raised {formatRelativeTime(now - new Date(r.createdAt).getTime())} ago</span>
                </span>
                <span className="whitespace-nowrap rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: STATUS_BADGE.pending.bg, color: STATUS_BADGE.pending.fg }}>Pending</span>
                <span className="whitespace-nowrap text-[13px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(r.refundAmount, session.business.currency)}</span>
                <button type="button" onClick={() => setApproving(r)} className="whitespace-nowrap rounded-[10px] px-[15px] py-[10px] text-[12px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>Review</button>
              </div>
            );
          })
        )}
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap items-center gap-2 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ReturnStatus | "all")} aria-label="Status" style={selectStyle}>
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        {allReturns && filtered.length === 0 ? (
          <div className="p-[52px_18px] text-center">
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No returns — good sign</div>
            <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>When a customer brings something back, start here so stock and money both reverse.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 1000 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Return #</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Original Order</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Customer</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Items</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Reason</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Refund Method</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Amount</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Date</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Status</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const badge = STATUS_BADGE[r.status];
                  return (
                    <tr key={r.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                      <td className="p-[12px_17px] text-[12.5px] font-extrabold" style={{ color: "var(--app-success-text)" }}>{r.id.slice(0, 8)}</td>
                      <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>#{r.orderNo}</td>
                      <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{r.customerName ?? "Walk-in"}</td>
                      <td className="p-[12px] text-end text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{r.itemsCount}</td>
                      <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{r.reason}</td>
                      <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{METHOD_LABEL[r.refundMethod] ?? r.refundMethod}</td>
                      <td className="p-[12px] text-end text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(r.refundAmount, session.business.currency)}</td>
                      <td className="whitespace-nowrap p-[12px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>{formatDate(r.createdAt)}</td>
                      <td className="p-[12px]"><span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: badge.bg, color: badge.fg }}>{r.status}</span></td>
                      <td className="p-[12px_17px] text-end">
                        {r.status === "pending" ? (
                          <span className="inline-flex gap-1.5">
                            <button type="button" onClick={() => setRejecting(r)} style={smallOutline}>Reject</button>
                            <button type="button" onClick={() => setApproving(r)} style={smallPrimary}>Approve</button>
                          </span>
                        ) : (
                          <span className="text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ReturnFormDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} currency={session.business.currency} />

      <PosModalShell
        open={approving != null}
        onClose={() => setApproving(null)}
        title="Approve Return"
        footer={
          <>
            <button type="button" onClick={() => setApproving(null)} style={cancelBtn}>Cancel</button>
            <button type="button" onClick={() => approving && approveMutation.mutate(approving.id)} disabled={approveMutation.isPending} style={{ ...primaryBtn, opacity: approveMutation.isPending ? 0.6 : 1 }}>
              {approveMutation.isPending ? "Approving…" : "Approve"}
            </button>
          </>
        }
      >
        {approving && (
          <div className="p-[17px]">
            <div className="rounded-[12px] p-[13px]" style={{ background: "var(--app-surface-2)" }}>
              <div className="flex justify-between p-[4px_0] text-[12.5px]"><span style={{ color: "var(--app-text-faintest)" }}>Original order</span><span className="font-bold" style={{ color: "var(--app-success-text)" }}>#{approving.orderNo}</span></div>
              <div className="flex justify-between p-[4px_0] text-[12.5px]"><span style={{ color: "var(--app-text-faintest)" }}>Reason</span><span className="font-bold" style={{ color: "var(--app-text-muted)" }}>{approving.reason}</span></div>
              <div className="flex justify-between p-[4px_0] text-[12.5px]"><span style={{ color: "var(--app-text-faintest)" }}>Refund amount</span><span className="font-bold" style={{ color: "var(--app-text-muted)" }}>{formatCurrency(approving.refundAmount, session.business.currency)}</span></div>
              <div className="flex justify-between p-[4px_0] text-[12.5px]"><span style={{ color: "var(--app-text-faintest)" }}>Refund method</span><span className="font-bold" style={{ color: "var(--app-text-muted)" }}>{METHOD_LABEL[approving.refundMethod]}</span></div>
              <div className="flex justify-between p-[4px_0] text-[12.5px]"><span style={{ color: "var(--app-text-faintest)" }}>Stock</span><span className="font-bold" style={{ color: approving.restock ? "var(--app-success-text)" : "var(--app-danger-strong)" }}>{approving.restock ? "Restock" : "Write off"}</span></div>
            </div>
            <div className="mt-3 rounded-[11px] p-[11px_13px] text-[12px]" style={{ background: "var(--app-success-bg)", color: "var(--app-success-text)" }}>
              Stock is restored for returned physical products; services are not restocked.
            </div>
          </div>
        )}
      </PosModalShell>

      <PosModalShell
        open={rejecting != null}
        onClose={() => setRejecting(null)}
        title="Reject Return"
        footer={
          <>
            <button type="button" onClick={() => setRejecting(null)} style={cancelBtn}>Cancel</button>
            <button type="button" onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending} style={{ background: "var(--app-danger-strong)", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff", opacity: rejectMutation.isPending ? 0.6 : 1 }}>
              {rejectMutation.isPending ? "Rejecting…" : "Reject"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-2.5 p-[17px]">
          <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>The requester will need to raise a new return if this was a mistake.</p>
          <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason (optional)" className="w-full rounded-[11px] p-3 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
        </div>
      </PosModalShell>
    </main>
  );
}

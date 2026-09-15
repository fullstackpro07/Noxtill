"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/session";
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import {
  convertQuotation,
  declineQuotation,
  duplicateQuotation,
  fetchQuotations,
  fetchQuotationsSummary,
  sendQuotation,
  type LiveQuotation,
  type QuotationStatus,
} from "@/lib/quotations-api";
import { QuotationFormDrawer } from "./quotation-form-drawer";
import { PosModalShell } from "@/components/pos/pos-modal-shell";

const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 11, padding: "10px 12px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 44 };
const primaryBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };
const smallOutline: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 11px", fontSize: 11.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 40 };
const smallPrimary: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 9, padding: "8px 13px", fontSize: 11.5, fontWeight: 800, color: "#fff", minHeight: 40 };
const cancelBtn: React.CSSProperties = { background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" };

const STATUS_LABEL: Record<QuotationStatus, string> = { draft: "Draft", sent: "Sent", accepted: "Accepted", declined: "Declined", expired: "Expired" };
const STATUS_BADGE: Record<QuotationStatus, { bg: string; fg: string }> = {
  draft: { bg: "var(--app-surface-2)", fg: "var(--app-text-faint)" },
  sent: { bg: "#EEF4FF", fg: "#3538CD" },
  accepted: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)" },
  declined: { bg: "#FEF3F2", fg: "var(--app-danger-strong)" },
  expired: { bg: "var(--app-warning-bg)", fg: "var(--app-warning-text)" },
};
const DECLINE_REASONS = ["Price too high", "Went with another supplier", "Project postponed", "No response"];

function ConversionTrendChart({ data }: { data: { month: string; rate: number }[] }) {
  const chart = useMemo(() => {
    const W = 700, L = 20, R = 20, T = 10, B = 26, PH = 150 - T - B, PW = W - L - R;
    const max = Math.max(10, ...data.map((d) => d.rate));
    const x = (i: number) => L + (data.length <= 1 ? 0 : i * (PW / (data.length - 1)));
    const y = (v: number) => T + PH * (1 - v / max);
    const pts = data.map((d, i) => ({ x: x(i), y: y(d.rate) }));
    const line = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const area = pts.length > 0 ? `${line} L${pts[pts.length - 1].x.toFixed(1)} ${T + PH} L${pts[0].x.toFixed(1)} ${T + PH} Z` : "";
    return { pts, line, area, W };
  }, [data]);

  return (
    <svg viewBox={`0 0 ${chart.W} 150`} className="block w-full" style={{ height: 150 }}>
      <path d={chart.area} fill="rgba(18,161,80,.10)" />
      <path d={chart.line} fill="none" stroke="var(--app-primary)" strokeWidth={2.4} strokeLinejoin="round" />
      {chart.pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3.4} fill="var(--app-surface)" stroke="var(--app-primary)" strokeWidth={1.8} />
      ))}
      {data.map((d, i) => (
        <text key={d.month} x={chart.pts[i]?.x ?? 0} y={146} textAnchor="middle" fontSize={10.5} fill="#667085" fontWeight={600}>
          {new Date(`${d.month}-01`).toLocaleDateString(undefined, { month: "short" })}
        </text>
      ))}
    </svg>
  );
}

export function QuotationsPanel() {
  const session = useSession();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<QuotationStatus | "all">("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [declining, setDeclining] = useState<LiveQuotation | null>(null);
  const [declineReason, setDeclineReason] = useState(DECLINE_REASONS[0]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: quotes } = useQuery({ queryKey: ["quotations"], queryFn: fetchQuotations });
  const { data: summary } = useQuery({ queryKey: ["quotations-summary"], queryFn: fetchQuotationsSummary });

  const filtered = useMemo(() => (quotes ?? []).filter((q) => statusFilter === "all" || q.status === statusFilter), [quotes, statusFilter]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["quotations"] });
    queryClient.invalidateQueries({ queryKey: ["quotations-summary"] });
  }

  const sendMutation = useMutation({
    mutationFn: (id: string) => sendQuotation(id),
    onMutate: (id) => setBusyId(id),
    onSuccess: () => {
      invalidate();
      toast.success("Quotation emailed to the customer.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send this quotation — please try again."),
    onSettled: () => setBusyId(null),
  });

  const declineMutation = useMutation({
    mutationFn: () => declineQuotation(declining!.id, declineReason),
    onSuccess: () => {
      invalidate();
      toast.success("Quotation declined.");
      setDeclining(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't decline this quotation."),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => duplicateQuotation(id),
    onMutate: (id) => setBusyId(id),
    onSuccess: (quote) => {
      invalidate();
      toast.success(`Duplicated as Quotation ${quote.quoteNo}.`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't duplicate this quotation."),
    onSettled: () => setBusyId(null),
  });

  const convertMutation = useMutation({
    mutationFn: (id: string) => convertQuotation(id),
    onMutate: (id) => setBusyId(id),
    onSuccess: (order) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success(`Converted to Order #${order.orderNo}.`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't convert this quotation."),
    onSettled: () => setBusyId(null),
  });

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Quotations</h2>
        <div className="ms-auto flex flex-wrap gap-2.5">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as QuotationStatus | "all")} aria-label="Status" style={selectStyle}>
            <option value="all">All statuses</option>
            {(["draft", "sent", "accepted", "declined", "expired"] as QuotationStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
          <button type="button" onClick={() => setDrawerOpen(true)} style={primaryBtn}>New Quotation</button>
        </div>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(185px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Open Quotes</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{summary?.open ?? "—"}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Value Open</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(summary?.valueOpen ?? 0, session.business.currency)}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Accepted This Month</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-primary)" }}>{summary?.acceptedThisMonth ?? "—"}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Conversion Rate</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{summary ? `${summary.conversionRate}%` : "—"}</div>
        </div>
      </div>

      <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <h3 className="m-0 mb-1.5 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Quote-to-order conversion trend</h3>
        <ConversionTrendChart data={summary?.trend ?? []} />
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        {quotes && filtered.length === 0 ? (
          <div className="p-[52px_18px] text-center">
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No quotations — useful for service and project work</div>
            <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Send a priced proposal and convert it the moment it&apos;s accepted.</div>
            <button type="button" onClick={() => setDrawerOpen(true)} className="mt-[15px] rounded-[11px] px-5 py-3 text-[12.5px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>New Quotation</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 860 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Quote #</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Customer</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Value</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Valid Until</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Status</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Sent Date</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((q) => {
                  const badge = STATUS_BADGE[q.status];
                  const busy = busyId === q.id;
                  const resolved = q.status === "accepted" || q.status === "declined" || q.status === "expired";
                  return (
                    <tr key={q.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                      <td className="p-[12px_17px] text-[12.5px] font-extrabold" style={{ color: "var(--app-success-text)" }}>#{q.quoteNo}</td>
                      <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{q.customerName}</td>
                      <td className="p-[12px] text-end text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(q.total, session.business.currency)}</td>
                      <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{q.validUntil ? formatDate(q.validUntil) : "—"}</td>
                      <td className="p-[12px]"><span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: badge.bg, color: badge.fg }}>{STATUS_LABEL[q.status]}</span></td>
                      <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>{q.sentAt ? formatDate(q.sentAt) : "—"}</td>
                      <td className="p-[12px_17px] text-end">
                        <span className="inline-flex flex-wrap justify-end gap-1.5">
                          <button type="button" onClick={() => duplicateMutation.mutate(q.id)} disabled={busy} style={smallOutline}>Duplicate</button>
                          {!resolved && (
                            <button type="button" onClick={() => setDeclining(q)} disabled={busy} style={{ ...smallOutline, color: "var(--app-text-faintest)" }}>Decline</button>
                          )}
                          {q.status !== "accepted" && (
                            <button type="button" onClick={() => sendMutation.mutate(q.id)} disabled={busy} style={smallOutline}>Send PDF</button>
                          )}
                          {!resolved && (
                            <button type="button" onClick={() => convertMutation.mutate(q.id)} disabled={busy} style={smallPrimary}>Convert</button>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <QuotationFormDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <PosModalShell
        open={declining != null}
        onClose={() => setDeclining(null)}
        title="Decline Quotation"
        footer={
          <>
            <button type="button" onClick={() => setDeclining(null)} style={cancelBtn}>Cancel</button>
            <button type="button" onClick={() => declineMutation.mutate()} disabled={declineMutation.isPending} style={{ ...primaryBtn, opacity: declineMutation.isPending ? 0.6 : 1 }}>
              {declineMutation.isPending ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-2.5 p-[17px]">
          <label className="block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>DECLINE REASON</label>
          <select value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} style={selectStyle}>
            {DECLINE_REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </PosModalShell>
    </main>
  );
}

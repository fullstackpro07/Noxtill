"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchReviewRequests,
  fetchReviewRequestsConversion,
  bulkSendReviewRequests,
  fetchReviewSettings,
  updateReviewSettings,
  type LiveReviewRequest,
  type ReviewRequestEffectiveStatus,
} from "@/lib/reviews-api";
import { fetchQuotaUsage } from "@/lib/campaigns-api";
import { searchCustomers, type CustomerSearchResult } from "@/lib/customers-api";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { useSendReviewRequestDialog } from "./send-review-request-dialog";

const STATUS_TONE: Record<ReviewRequestEffectiveStatus, { bg: string; fg: string; label: string }> = {
  sent: { bg: "#EEF4FF", fg: "#3538CD", label: "Sent" },
  opened: { bg: "var(--app-warning-bg)", fg: "var(--app-warning-text)", label: "Opened" },
  rated: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)", label: "Rated" },
  no_response: { bg: "var(--app-surface-2)", fg: "var(--app-text-faint)", label: "No Response" },
};
const CHANNEL_COLORS: Record<string, string> = { Email: "var(--app-primary)", QR: "var(--app-info)", Manual: "var(--app-purple)" };

function downloadCsv(rows: LiveReviewRequest[]) {
  const header = "Customer,Source,Status,Stars,Reminders,Created\n";
  const body = rows.map((r) => `"${r.customer?.name ?? "Anonymous"}",${r.source},${r.effectiveStatus},${r.stars ?? ""},${r.reminderCount},${r.createdAt}`).join("\n");
  const blob = new Blob([header + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `review-requests-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const primaryBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };

export function ReviewRequestsView() {
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [sourceFilter, setSourceFilter] = useState("All sources");
  const [timingOpen, setTimingOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const sendDialog = useSendReviewRequestDialog();

  const { data: requests = [] } = useQuery({ queryKey: ["review-requests"], queryFn: fetchReviewRequests });
  const { data: conversion = [] } = useQuery({ queryKey: ["review-requests-conversion"], queryFn: fetchReviewRequestsConversion });

  const filtered = requests.filter(
    (r) => (statusFilter === "All statuses" || STATUS_TONE[r.effectiveStatus].label === statusFilter) && (sourceFilter === "All sources" || r.source.toLowerCase() === sourceFilter.toLowerCase()),
  );

  const rated = requests.filter((r) => r.effectiveStatus === "rated");
  const conv = requests.length > 0 ? Math.round((rated.length / requests.length) * 100) : 0;
  const totalReminders = requests.reduce((s, r) => s + r.reminderCount, 0);
  const avgRespondMs = useMemo(() => {
    const withResponse = requests.filter((r) => r.respondedAt);
    if (withResponse.length === 0) return null;
    return withResponse.reduce((s, r) => s + (new Date(r.respondedAt!).getTime() - new Date(r.createdAt).getTime()), 0) / withResponse.length;
  }, [requests]);

  const sources = useMemo(() => [...new Set(requests.map((r) => r.source))], [requests]);

  const monthly = useMemo(() => {
    const months: { label: string; year: number; month: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getUTCFullYear(), now.getUTCMonth() - i, 1);
      months.push({ label: d.toLocaleString(undefined, { month: "short" }), year: d.getUTCFullYear(), month: d.getUTCMonth() });
    }
    return months.map(({ label, year, month }) => ({
      label,
      sent: requests.filter((r) => new Date(r.createdAt).getUTCFullYear() === year && new Date(r.createdAt).getUTCMonth() === month).length,
      rated: requests.filter((r) => r.effectiveStatus === "rated" && new Date(r.createdAt).getUTCFullYear() === year && new Date(r.createdAt).getUTCMonth() === month).length,
    }));
  }, [requests]);
  const maxMonthly = Math.max(1, ...monthly.map((m) => m.sent));

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[10px]">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Review Requests</h2>
        <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: "var(--app-success-bg)", color: "var(--app-success-text)" }}>
          Same link for every customer — no gating
        </span>
        <div className="ml-auto flex flex-wrap gap-[9px]">
          <button type="button" onClick={() => downloadCsv(filtered)} style={outlineBtn}>Export</button>
          <button type="button" onClick={() => setTimingOpen(true)} style={outlineBtn}>Configure Timing</button>
          <button type="button" onClick={() => setBulkOpen(true)} style={outlineBtn}>Bulk Send</button>
          <button type="button" onClick={sendDialog.open} style={primaryBtn}>Send Request</button>
        </div>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))" }}>
        <Kpi label="Sent This Month" value={String(requests.length)} />
        <Kpi label="Responded" value={String(rated.length)} />
        <Kpi label="Conversion" value={`${conv}%`} color="var(--app-primary)" />
        <Kpi label="Avg Time to Respond" value={avgRespondMs != null ? `${Math.round(avgRespondMs / 3_600_000)} hours` : "—"} />
        <Kpi label="Reminders Sent" value={String(totalReminders)} />
      </div>

      <div className="grid gap-[15px]" style={{ gridTemplateColumns: "minmax(0,1fr) 320px" }}>
        <div className="min-w-0 rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="mb-1.5 flex items-center gap-3.5">
            <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Requests vs reviews</h3>
            <Legend color="#C7D7FE" label="Requests" />
            <Legend color="var(--app-primary)" label="Reviews" />
          </div>
          <svg viewBox="0 0 620 130" className="block w-full" style={{ height: 130 }}>
            {monthly.map((m, i) => {
              const slot = (620 - 44) / monthly.length;
              const w = slot * 0.6;
              const x = 34 + i * slot + slot * 0.18;
              const hSent = (m.sent / maxMonthly) * 100;
              const hRated = (m.rated / maxMonthly) * 100;
              return (
                <g key={m.label + i}>
                  <rect x={x} y={12 + (100 - hSent)} width={w} height={hSent} rx={5} fill="#C7D7FE" />
                  <rect x={x} y={12 + (100 - hRated)} width={w} height={hRated} rx={5} fill="var(--app-primary)" />
                  <text x={x + w / 2} y={124} textAnchor="middle" fontSize={10.5} fill="var(--app-text-faintest)" fontWeight={600}>{m.label}</text>
                </g>
              );
            })}
          </svg>
        </div>
        <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-3 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Conversion by channel</h3>
          {conversion.length === 0 ? (
            <p className="m-0 text-[12px]" style={{ color: "var(--app-text-disabled)" }}>No requests sent yet.</p>
          ) : (
            <div className="flex flex-col gap-[11px]">
              {conversion.map((c) => (
                <div key={c.source}>
                  <div className="mb-[5px] flex justify-between">
                    <span className="text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{c.source}</span>
                    <span className="text-[11.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{c.conversionRate}%</span>
                  </div>
                  <span className="block h-2 overflow-hidden rounded-[6px]" style={{ background: "var(--app-surface-2)" }}>
                    <span className="block h-full rounded-[6px]" style={{ width: `${c.conversionRate}%`, background: CHANNEL_COLORS[c.source] ?? "var(--app-primary)" }} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap gap-2 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <TableSelect value={statusFilter} onChange={setStatusFilter} options={["All statuses", "Sent", "Opened", "Rated", "No Response"]} />
          <TableSelect value={sourceFilter} onChange={setSourceFilter} options={["All sources", ...sources]} />
        </div>
        {filtered.length === 0 ? (
          <div className="p-[52px_18px] text-center">
            <p className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Send your first review request</p>
            <p className="m-0 mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Every customer gets the same link — no filtering by sentiment.</p>
            <button type="button" onClick={sendDialog.open} className="mt-[15px]" style={{ ...primaryBtn, padding: "12px 22px" }}>Send Request</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 900 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  {["Customer", "Sent At", "Source", "Status", "Stars Given", "Reminders"].map((h) => (
                    <th key={h} className="p-[10px_17px] text-left text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const tone = STATUS_TONE[r.effectiveStatus];
                  return (
                    <tr key={r.id} style={{ borderTop: "1px solid var(--app-surface-2)" }}>
                      <td className="p-3 pl-[17px] text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{r.customer?.name ?? "Anonymous"}</td>
                      <td className="whitespace-nowrap p-3 text-[12px]" style={{ color: "var(--app-text-faintest)" }}>{formatDate(r.createdAt)}</td>
                      <td className="p-3 text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{r.source}</td>
                      <td className="p-3"><span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: tone.bg, color: tone.fg }}>{tone.label}</span></td>
                      <td className="p-3 text-center text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{r.stars ? "★".repeat(r.stars) : "—"}</td>
                      <td className="p-3 pr-[17px] text-center text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{r.reminderCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {timingOpen && <TimingDialog onClose={() => setTimingOpen(false)} />}
      {bulkOpen && <BulkSendDialog onClose={() => setBulkOpen(false)} />}
    </main>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
      <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>{label}</div>
      <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: color ?? "var(--app-text)" }}>{value}</div>
    </div>
  );
}
function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: "var(--app-text-faint)" }}>
      <span className="h-2 w-2 rounded-[2px]" style={{ background: color }} />
      {label}
    </span>
  );
}
function TableSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-[10px] p-[9px_11px] text-[12.5px] font-semibold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", minHeight: 42 }}>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

function TimingDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["review-settings"], queryFn: fetchReviewSettings });
  const [days, setDays] = useState(3);

  const mutation = useMutation({
    mutationFn: () => updateReviewSettings({ reminderDayOffsets: [days] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review-settings"] });
      toast.success(`Reminder timing saved: follow up after ${days} day${days === 1 ? "" : "s"}.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this — please try again."),
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-5" style={{ background: "rgba(10,27,42,.42)" }} onClick={onClose}>
      <div className="w-[490px] max-w-full rounded-[18px]" style={{ background: "var(--app-surface)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 p-[17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 flex-1 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>Request Timing</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-[9px]" style={{ border: "1px solid var(--app-border)" }}>×</button>
        </div>
        <div className="flex flex-col gap-3 p-[17px]">
          <div className="rounded-[12px] p-[13px] text-[12.5px] leading-relaxed" style={{ background: "var(--app-surface-2)", color: "var(--app-text-faint)" }}>
            The first request always goes out 2 hours after the visit — this is fixed for every business, so it never feels automated to the customer.
          </div>
          <div>
            <label className="mb-[5px] block text-[11px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>Reminder — days after the first request</label>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-full rounded-[11px] p-3 text-[13px] font-bold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", minHeight: 48 }}>
              <option value={2}>2 days later</option>
              <option value={3}>3 days later</option>
              <option value={7}>7 days later</option>
            </select>
            <p className="mt-[5px] text-[11px]" style={{ color: "var(--app-text-disabled)" }}>Current setting: {settings?.reminderDayOffsets?.join(", ") ?? "3"} day(s).</p>
          </div>
        </div>
        <div className="flex justify-end gap-[10px] p-[14px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
          <button type="button" onClick={onClose} style={outlineBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} style={primaryBtn}>{mutation.isPending ? "Saving…" : "Save Timing"}</button>
        </div>
      </div>
    </div>
  );
}

function BulkSendDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CustomerSearchResult[]>([]);

  const { data: results = [] } = useQuery({ queryKey: ["customer-search", query], queryFn: () => searchCustomers(query), enabled: query.trim().length > 1 });
  const { data: quota } = useQuery({ queryKey: ["quota-usage"], queryFn: fetchQuotaUsage });
  const used = quota?.used ?? 0;
  const total = quota?.quota ?? 0;
  const remaining = total - used;
  const selectedIds = new Set(selected.map((c) => c.id));

  const mutation = useMutation({
    mutationFn: () => bulkSendReviewRequests(selected.map((c) => c.id)),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["review-requests"] });
      queryClient.invalidateQueries({ queryKey: ["quota-usage"] });
      toast.success(`Sent to ${result.sent} of ${result.requested} customer(s).`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send these requests — please try again."),
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-5" style={{ background: "rgba(10,27,42,.42)" }} onClick={onClose}>
      <div className="w-[490px] max-h-[88vh] max-w-full overflow-y-auto rounded-[18px]" style={{ background: "var(--app-surface)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 p-[17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 flex-1 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>Bulk Send Preview</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-[9px]" style={{ border: "1px solid var(--app-border)" }}>×</button>
        </div>
        <div className="flex flex-col gap-3 p-[17px]">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customers by name or phone…" className="w-full rounded-[11px] p-3 text-[13.5px]" style={{ border: "1px solid var(--app-border)" }} autoFocus />
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((c) => (
                <span key={c.id} className="flex items-center gap-1 rounded-full py-1 pl-2.5 pr-1.5 text-[12px]" style={{ background: "var(--app-surface-2)", color: "var(--app-text)" }}>
                  {c.name}
                  <button type="button" onClick={() => setSelected((prev) => prev.filter((s) => s.id !== c.id))} aria-label={`Remove ${c.name}`} className="flex h-4 w-4 items-center justify-center rounded-full">×</button>
                </span>
              ))}
            </div>
          )}
          {results.filter((c) => !selectedIds.has(c.id)).length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-[11px]" style={{ border: "1px solid var(--app-border)" }}>
              {results.filter((c) => !selectedIds.has(c.id)).map((c) => (
                <button key={c.id} type="button" onClick={() => { setSelected((prev) => [...prev, c]); setQuery(""); }} className="flex w-full flex-col items-start px-3 py-2 text-left text-[13px]">
                  <span style={{ color: "var(--app-text)" }}>{c.name}</span>
                  <span className="text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{c.phone}</span>
                </button>
              ))}
            </div>
          )}
          {total > 0 && (
            <div>
              <div className="mb-1.5 flex justify-between"><span className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Monthly quota</span><span className="text-[11.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{used} of {total} used</span></div>
              <span className="block h-2 overflow-hidden rounded-[6px]" style={{ background: "var(--app-surface-2)" }}>
                <span className="block h-full rounded-[6px]" style={{ width: `${Math.min(100, (used / total) * 100)}%`, background: "var(--app-primary)" }} />
              </span>
              {selected.length > remaining && <p className="mt-1.5 text-[11.5px] font-bold" style={{ color: "var(--app-danger-strong)" }}>Not enough quota for this send.</p>}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-[10px] p-[14px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
          <button type="button" onClick={onClose} style={outlineBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={selected.length === 0 || selected.length > remaining || mutation.isPending} style={primaryBtn}>
            {mutation.isPending ? "Sending…" : `Send ${selected.length || ""} Requests`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}

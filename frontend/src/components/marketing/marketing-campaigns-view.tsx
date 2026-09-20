"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { fetchCampaigns, fetchCampaignReport, type LiveCampaign, type CampaignReport } from "@/lib/campaigns-api";
import { fetchEmailCampaigns, fetchEmailFunnel, type LiveEmailCampaign, type EmailFunnel } from "@/lib/email-marketing-api";
import { fetchMarketingOverview } from "@/lib/marketing-overview-api";
import { useSession } from "@/lib/session";
import { formatCurrency } from "@/lib/format";

interface Row {
  id: string;
  channel: "WhatsApp" | "Email";
  segment: string;
  sentCount: number;
  scheduledFor: string | null;
  createdAt: string;
}

function toRows(whatsapp: LiveCampaign[], email: LiveEmailCampaign[]): Row[] {
  const a: Row[] = whatsapp.map((c) => ({ id: c.id, channel: "WhatsApp", segment: c.segment, sentCount: c.sentCount, scheduledFor: c.scheduledFor, createdAt: c.createdAt }));
  const b: Row[] = email.map((c) => ({ id: c.id, channel: "Email", segment: c.segment, sentCount: c.sentCount, scheduledFor: null, createdAt: c.createdAt }));
  return [...a, ...b].sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1));
}

function statusFor(row: Row): { label: string; bg: string; fg: string } {
  if (row.scheduledFor && new Date(row.scheduledFor) > new Date()) {
    return { label: "Scheduled", bg: "#EEF4FF", fg: "#3538CD" };
  }
  return { label: "Done", bg: "#E8F7EE", fg: "#0E8442" };
}

function withinDateFilter(row: Row, filter: string): boolean {
  const created = new Date(row.createdAt).getTime();
  const now = Date.now();
  if (filter === "Last 90 days") return created >= now - 90 * 24 * 60 * 60 * 1000;
  if (filter === "This month") {
    const d = new Date(row.createdAt);
    const n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
  }
  return true;
}

export function MarketingCampaignsView() {
  const session = useSession();
  const currency = session.business.currency;
  const router = useRouter();
  const [channelFilter, setChannelFilter] = useState("All channels");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [segmentFilter, setSegmentFilter] = useState("All segments");
  const [dateFilter, setDateFilter] = useState("This month");
  const [reporting, setReporting] = useState<Row | null>(null);

  const { data: whatsapp = [] } = useQuery({ queryKey: ["campaigns"], queryFn: fetchCampaigns });
  const { data: email = [] } = useQuery({ queryKey: ["email-campaigns"], queryFn: fetchEmailCampaigns });
  const { data: overview } = useQuery({ queryKey: ["marketing-overview"], queryFn: fetchMarketingOverview });

  const rows = useMemo(() => toRows(whatsapp, email), [whatsapp, email]);
  const segments = useMemo(() => Array.from(new Set(rows.map((r) => r.segment))), [rows]);

  const filtered = rows.filter((r) => {
    if (channelFilter !== "All channels" && r.channel !== channelFilter) return false;
    if (segmentFilter !== "All segments" && r.segment !== segmentFilter) return false;
    if (statusFilter !== "All statuses" && statusFor(r).label !== statusFilter) return false;
    if (!withinDateFilter(r, dateFilter)) return false;
    return true;
  });

  const totals = overview?.totals;
  const kpis = totals
    ? [
        { label: "Total Sent", value: String(totals.results), color: "var(--app-text)" },
        { label: "Delivered", value: totals.results ? `${Math.round((totals.delivered / totals.results) * 100)}%` : "—", color: "var(--app-primary)" },
        { label: "Read", value: totals.delivered ? `${Math.round((totals.read / totals.delivered) * 100)}%` : "—", color: "var(--app-text)" },
        { label: "Redemptions", value: String(totals.redemptions), color: "var(--app-text)" },
        { label: "Revenue Attributed", value: formatCurrency(totals.revenue, currency), color: "var(--app-primary)" },
      ]
    : [];

  const topBySent = [...rows].sort((a, b) => b.sentCount - a.sentCount).slice(0, 4);
  const maxSent = Math.max(1, ...topBySent.map((r) => r.sentCount));

  function exportReport() {
    const exportRows = [
      ["Segment", "Channel", "Sent", "Status", "Created"],
      ...filtered.map((r) => [r.segment, r.channel, String(r.sentCount), statusFor(r).label, r.createdAt]),
    ];
    const csv = exportRows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "marketing-campaigns.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[10px]">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Campaigns</h2>
        <div className="ml-auto flex flex-wrap gap-[9px]">
          <button
            type="button"
            onClick={exportReport}
            className="rounded-[11px] text-[12.5px] font-bold"
            style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", padding: "11px 15px", minHeight: 44 }}
          >
            Export Report
          </button>
          <button
            type="button"
            onClick={() => router.push("/marketing/builder")}
            className="rounded-[11px] text-[12.5px] font-extrabold text-white"
            style={{ background: "var(--app-primary)", padding: "11px 18px", minHeight: 44 }}
          >
            New Campaign
          </button>
        </div>
      </div>

      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))" }}>
        {kpis.map((k) => (
          <div key={k.label} className="rounded-[14px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 15 }}>
            <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>{k.label}</div>
            <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 17 }}>
        <h3 className="m-0 mb-1.5 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Campaign comparison — messages sent</h3>
        {topBySent.length === 0 ? (
          <div className="flex h-[134px] items-center justify-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No campaigns yet.</div>
        ) : (
          <svg viewBox="0 0 620 134" style={{ width: "100%", height: 134, display: "block" }}>
            {topBySent.map((r, i) => {
              const slot = (620 - 44) / topBySent.length;
              const h = (r.sentCount / maxSent) * 96;
              const x = 34 + i * slot + slot * 0.18;
              const w = slot * 0.64;
              return (
                <g key={r.id}>
                  <rect x={x} y={112 - h} width={w} height={h} rx={5} fill="#BFE7CF" />
                  <text x={x + w / 2} y={128} textAnchor="middle" fontSize={10.5} fill="#667085" fontWeight={600}>{r.segment.length > 12 ? `${r.segment.slice(0, 12)}…` : r.segment}</text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap gap-2" style={{ padding: "13px 17px", borderBottom: "1px solid var(--app-surface-2)" }}>
          <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} aria-label="Channel" className="rounded-[10px] text-[12.5px] font-semibold" style={{ border: "1px solid var(--app-border)", padding: "9px 11px", color: "var(--app-text-muted)", minHeight: 42 }}>
            <option>All channels</option>
            <option>WhatsApp</option>
            <option>Email</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status" className="rounded-[10px] text-[12.5px] font-semibold" style={{ border: "1px solid var(--app-border)", padding: "9px 11px", color: "var(--app-text-muted)", minHeight: 42 }}>
            <option>All statuses</option>
            <option>Scheduled</option>
            <option>Done</option>
          </select>
          <select value={segmentFilter} onChange={(e) => setSegmentFilter(e.target.value)} aria-label="Segment" className="rounded-[10px] text-[12.5px] font-semibold" style={{ border: "1px solid var(--app-border)", padding: "9px 11px", color: "var(--app-text-muted)", minHeight: 42 }}>
            <option>All segments</option>
            {segments.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} aria-label="Date" className="rounded-[10px] text-[12.5px] font-semibold" style={{ border: "1px solid var(--app-border)", padding: "9px 11px", color: "var(--app-text-muted)", minHeight: 42 }}>
            <option>This month</option>
            <option>Last 90 days</option>
            <option>All time</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center" style={{ padding: "52px 18px" }}>
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Create your first campaign — win back customers who haven&apos;t visited in 60 days</div>
            <button type="button" onClick={() => router.push("/marketing/builder")} className="mt-[15px] rounded-[12px] text-[13px] font-extrabold text-white" style={{ background: "var(--app-primary)", padding: "12px 22px", minHeight: 46 }}>
              New Campaign
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 1140 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Campaign</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Channel</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Segment</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Recipients</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Sent</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Delivered</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Read</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Redeemed</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Revenue</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Status</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <CampaignTableRow key={`${row.channel}:${row.id}`} row={row} onReport={() => setReporting(row)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {reporting && <ReportDialog row={reporting} onClose={() => setReporting(null)} />}
    </main>
  );
}

function CampaignTableRow({ row, onReport }: { row: Row; onReport: () => void }) {
  const status = statusFor(row);
  const { data: waReport } = useQuery<CampaignReport>({ queryKey: ["campaign-report", row.id], queryFn: () => fetchCampaignReport(row.id), enabled: row.channel === "WhatsApp" });
  const { data: emailReport } = useQuery<EmailFunnel>({ queryKey: ["email-funnel", row.id], queryFn: () => fetchEmailFunnel(row.id), enabled: row.channel === "Email" });

  const delivered = row.channel === "WhatsApp" ? waReport?.delivered : emailReport?.delivered;
  const read = row.channel === "WhatsApp" ? waReport?.read : emailReport?.opened;

  return (
    <tr style={{ borderTop: "1px solid var(--app-border-strong)" }}>
      <td style={{ padding: "12px 17px" }}>
        <button type="button" onClick={onReport} className="text-[12.5px] font-bold" style={{ color: "var(--app-success-text)", background: "none", border: 0, padding: 0, cursor: "pointer" }}>
          {row.segment}
        </button>
      </td>
      <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)" }}>{row.channel}</td>
      <td style={{ padding: 12, fontSize: 12, color: "var(--app-text-faintest)" }}>{row.segment}</td>
      <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{row.sentCount}</td>
      <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{row.sentCount}</td>
      <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{delivered ?? "…"}</td>
      <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{read ?? "…"}</td>
      <td style={{ padding: 12, fontSize: 12.5, fontWeight: 700, color: "var(--app-text-disabled)", textAlign: "right" }}>—</td>
      <td style={{ padding: 12, fontSize: 12.5, fontWeight: 700, color: "var(--app-text-disabled)", textAlign: "right" }}>—</td>
      <td style={{ padding: 12 }}>
        <span className="rounded-full text-[10.5px] font-bold" style={{ padding: "3px 9px", background: status.bg, color: status.fg }}>{status.label}</span>
      </td>
      <td style={{ padding: "12px 17px", textAlign: "right" }}>
        <button
          type="button"
          onClick={onReport}
          className="rounded-[9px] text-[11.5px] font-extrabold text-white"
          style={{ border: 0, background: "var(--app-primary)", padding: "8px 13px", minHeight: 40 }}
        >
          Report
        </button>
      </td>
    </tr>
  );
}

function ReportDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const { data: waReport } = useQuery<CampaignReport>({
    queryKey: ["campaign-report", row.id],
    queryFn: () => fetchCampaignReport(row.id),
    enabled: row.channel === "WhatsApp",
  });
  const { data: emailReport } = useQuery<EmailFunnel>({
    queryKey: ["email-funnel", row.id],
    queryFn: () => fetchEmailFunnel(row.id),
    enabled: row.channel === "Email",
  });

  const rows: { label: string; value: number }[] =
    row.channel === "WhatsApp" && waReport
      ? [
          { label: "Sent", value: waReport.sent },
          { label: "Delivered", value: waReport.delivered },
          { label: "Read", value: waReport.read },
          { label: "Failed", value: waReport.failed },
        ]
      : row.channel === "Email" && emailReport
        ? [
            { label: "Sent", value: emailReport.sent },
            { label: "Delivered", value: emailReport.delivered },
            { label: "Opened", value: emailReport.opened },
            { label: "Clicked", value: emailReport.clicked },
            { label: "Unsubscribed", value: emailReport.unsubscribed },
          ]
        : [];
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5" style={{ background: "rgba(10,27,42,.42)" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="w-full max-w-[440px] rounded-[18px]" style={{ background: "var(--app-surface)" }}>
        <div className="p-[17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>{row.segment}</h3>
        </div>
        <div className="flex flex-col gap-2.5 p-[17px]">
          {rows.length === 0 && <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Loading…</p>}
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-3">
              <span className="w-[90px] shrink-0 text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{r.label}</span>
              <span className="h-[9px] flex-1 overflow-hidden rounded-[6px]" style={{ background: "var(--app-surface-2)" }}>
                <span className="block h-full rounded-[6px]" style={{ width: `${(r.value / max) * 100}%`, background: "var(--app-primary)" }} />
              </span>
              <span className="w-[40px] text-end text-[12px] font-extrabold" style={{ color: "var(--app-text)" }}>{r.value}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-end p-[14px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
          <button type="button" onClick={onClose} className="rounded-[10px] px-4 py-2.5 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { fetchMarketingOverview, suggestMarketingReallocation, type ChannelOverviewRow } from "@/lib/marketing-overview-api";
import { useSession } from "@/lib/session";
import { formatCurrency } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const KPI_STYLE: { bg: string; color: string; icon: string }[] = [
  { bg: "#E8F7EE", color: "#12A150", icon: "m3 11 18-5v12L3 14v-3ZM11.6 16.8a3 3 0 1 1-5.8-1.6" },
  { bg: "#EEF4FF", color: "#3538CD", icon: "m22 2-7.5 20-4-9-9-4ZM22 2 11 13" },
  { bg: "#F5EBFE", color: "#9333EA", icon: "M3 9a2 2 0 0 0 0 6v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a2 2 0 0 1 0-6V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z" },
  { bg: "#E8F7EE", color: "#0E8442", icon: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6.5v11M14 9.5A2.6 2.6 0 0 0 11.5 8" },
  { bg: "#FEF0E6", color: "#F97316", icon: "M20 8H5a3 3 0 0 1 0-6h13v6M2 5v13a3 3 0 0 0 3 3h16a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H5" },
  { bg: "#F2F4F7", color: "#475467", icon: "M6 3h12v18H6ZM9 7h6M9 11h.01M12 11h.01M15 11h.01M9 15h.01M12 15h.01M15 15h.01" },
];

const RESULT_TYPE: Record<string, string> = { WhatsApp: "Messages", Email: "Emails" };

function bars(vals: number[], max: number, w: number, ph: number, t: number) {
  const slot = (w - 44) / Math.max(1, vals.length);
  return vals.map((v, i) => ({
    x: +(34 + i * slot + slot * 0.18).toFixed(1),
    w: +(slot * 0.6).toFixed(1),
    h: +((v / max) * ph).toFixed(1),
    y: +(t + ph - (v / max) * ph).toFixed(1),
    cx: +(34 + i * slot + slot / 2).toFixed(1),
  }));
}

export function MarketingOverviewView() {
  const session = useSession();
  const currency = session.business.currency;
  const router = useRouter();
  const [channelFilter, setChannelFilter] = useState("All channels");
  const [aiOpen, setAiOpen] = useState(false);

  const { data, isPending } = useQuery({ queryKey: ["marketing-overview"], queryFn: fetchMarketingOverview });
  const channels = useMemo(() => data?.channels ?? [], [data]);
  const totals = data?.totals;

  const filteredChannels = useMemo(
    () => (channelFilter === "All channels" ? channels : channels.filter((c) => c.channel === channelFilter)),
    [channels, channelFilter],
  );

  const kpis = totals
    ? [
        { label: "Campaigns Sent", value: String(totals.results), note: "All time" },
        { label: "Messages Delivered", value: String(totals.delivered), note: totals.results ? `${Math.round((totals.delivered / totals.results) * 100)}% delivery` : "—" },
        { label: "Redemptions", value: String(totals.redemptions), note: "Coupons/vouchers used" },
        { label: "Revenue Attributed", value: formatCurrency(totals.revenue, currency), note: "Across coupon/voucher orders" },
        { label: "Total Ad Spend", value: formatCurrency(totals.spend, currency), note: "Billed by the platforms" },
        { label: "Blended Cost / Result", value: totals.blendedCostPerResult != null ? formatCurrency(totals.blendedCostPerResult, currency) : "—", note: "Paid channels only" },
      ]
    : [];

  const maxSpend = Math.max(1, ...channels.map((c) => c.spend));
  const maxResults = Math.max(1, ...channels.map((c) => c.results));
  const spendBars = bars(channels.map((c) => c.spend), maxSpend, 620, 100, 12);
  const resultBars = bars(channels.map((c) => c.results), maxResults, 620, 100, 12);

  function exportCsv() {
    const rows = [["Channel", "Spend", "Results", "Delivered", "Cost per result"], ...channels.map((c) => [c.channel, String(c.spend), String(c.results), String(c.delivered ?? ""), String(c.costPerResult ?? "")])];
    const csv = rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "marketing-channel-performance.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function openChannel(channel: string) {
    router.push(channel === "WhatsApp" || channel === "Email" ? "/marketing/campaigns" : "/advertising");
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[9px]">
        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          aria-label="Channel"
          className="rounded-[11px] text-[12.5px] font-semibold"
          style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", padding: "10px 12px", minHeight: 44 }}
        >
          <option>All channels</option>
          {channels.map((c) => (
            <option key={c.channel}>{c.channel}</option>
          ))}
        </select>
        <div className="ml-auto flex flex-wrap gap-[9px]">
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-[11px] text-[12.5px] font-bold"
            style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", padding: "11px 15px", minHeight: 44 }}
          >
            Export
          </button>
          <button
            type="button"
            onClick={() => setAiOpen(true)}
            className="flex items-center gap-[7px] rounded-[11px] text-[12.5px] font-bold"
            style={{ border: "1px solid var(--app-border)", color: "var(--app-primary)", background: "var(--app-surface)", padding: "11px 15px", minHeight: 44 }}
          >
            <Sparkles className="h-[15px] w-[15px]" aria-hidden />
            AI Recommendation
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

      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(175px,1fr))" }}>
        {isPending
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[86px] animate-pulse rounded-[14px]" style={{ background: "var(--app-surface-2)" }} />
            ))
          : kpis.map((kpi, i) => {
              const s = KPI_STYLE[i % KPI_STYLE.length];
              return (
                <div key={kpi.label} className="rounded-[14px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 15 }}>
                  <div className="mb-[9px] flex items-center gap-[9px]">
                    <span className="flex items-center justify-center rounded-[9px]" style={{ width: 30, height: 30, background: s.bg, flex: "0 0 30px" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d={s.icon} />
                      </svg>
                    </span>
                    <span className="text-[12px] font-semibold" style={{ color: "var(--app-text-faint)" }}>{kpi.label}</span>
                  </div>
                  <div className="text-[22px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.5px" }}>{kpi.value}</div>
                  <div className="mt-1 text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{kpi.note}</div>
                </div>
              );
            })}
      </div>

      <div className="grid gap-[15px]" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        <div className="min-w-0 rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 17 }}>
          <div className="mb-1.5 flex flex-wrap items-center gap-[14px]">
            <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Spend vs results by channel</h3>
            <span className="flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: "var(--app-text-faint)" }}>
              <span className="h-2 w-2 rounded-[2px]" style={{ background: "#C7D7FE" }} />Spend
            </span>
            <span className="flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: "var(--app-text-faint)" }}>
              <span className="h-2 w-2 rounded-[2px]" style={{ background: "var(--app-primary)" }} />Results
            </span>
          </div>
          {channels.length === 0 ? (
            <div className="flex h-[140px] items-center justify-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No channel data yet.</div>
          ) : (
            <svg viewBox="0 0 620 140" style={{ width: "100%", height: 140, display: "block" }}>
              {channels.map((c, i) => (
                <g key={c.channel}>
                  <rect x={spendBars[i].x} y={spendBars[i].y} width={spendBars[i].w} height={spendBars[i].h} rx={5} fill="#C7D7FE" />
                  <rect x={resultBars[i].x} y={resultBars[i].y} width={resultBars[i].w} height={resultBars[i].h} rx={5} fill="#12A150" />
                  <text x={spendBars[i].cx} y={134} textAnchor="middle" fontSize={10} fill="#667085" fontWeight={600}>{c.channel}</text>
                </g>
              ))}
            </svg>
          )}
        </div>

        <div className="min-w-0 rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 17 }}>
          <h3 className="m-0 mb-1.5 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Attribution trend</h3>
          <div className="flex h-[140px] flex-col items-center justify-center gap-1 text-center">
            <span className="text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>Not enough history yet</span>
            <span className="max-w-[240px] text-[11px]" style={{ color: "var(--app-text-disabled)" }}>A monthly trend needs a few months of real campaign data to plot — nothing is shown rather than a fabricated line.</span>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div style={{ padding: "13px 17px", borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Channel performance</h3>
        </div>
        {filteredChannels.length === 0 ? (
          <div className="text-center" style={{ padding: "52px 18px" }}>
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Run your first campaign to see performance here</div>
            <button type="button" onClick={() => router.push("/marketing/builder")} className="mt-[15px] rounded-[12px] text-[13px] font-extrabold text-white" style={{ background: "var(--app-primary)", padding: "12px 22px", minHeight: 46 }}>
              New Campaign
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 840 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Channel</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Spend</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Reach</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Results</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Result Type</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Cost / Result</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>ROI</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Open</th>
                </tr>
              </thead>
              <tbody>
                {filteredChannels.map((c: ChannelOverviewRow) => (
                  <tr key={c.channel} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                    <td style={{ padding: "12px 17px" }}>
                      <span className="flex items-center gap-[9px]">
                        <span className="h-2 w-2 rounded-[2px]" style={{ background: "var(--app-primary)" }} />
                        <span className="text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{c.channel}</span>
                      </span>
                    </td>
                    <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{c.spend ? formatCurrency(c.spend, currency) : "—"}</td>
                    <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-disabled)", textAlign: "right" }}>—</td>
                    <td style={{ padding: 12, fontSize: 12.5, fontWeight: 700, color: "var(--app-text)", textAlign: "right" }}>{c.results}</td>
                    <td style={{ padding: 12, fontSize: 12, color: "var(--app-text-faintest)" }}>{RESULT_TYPE[c.channel] ?? "Results"}</td>
                    <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{c.costPerResult != null ? formatCurrency(c.costPerResult, currency) : "—"}</td>
                    <td style={{ padding: 12, textAlign: "right", fontSize: 12, fontWeight: 800, color: "var(--app-text-disabled)" }}>—</td>
                    <td style={{ padding: "12px 17px", textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => openChannel(c.channel)}
                        className="rounded-[9px] text-[11.5px] font-bold"
                        style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-success-text)", padding: "8px 12px", minHeight: 40 }}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {aiOpen && <ReallocationDialog onClose={() => setAiOpen(false)} />}
    </main>
  );
}

function ReallocationDialog({ onClose }: { onClose: () => void }) {
  const mutation = useMutation({
    mutationFn: () => suggestMarketingReallocation(),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't get a suggestion right now."),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5" style={{ background: "rgba(10,27,42,.42)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] rounded-[18px]"
        style={{ background: "var(--app-surface)", boxShadow: "0 30px 80px rgba(10,27,42,.32)" }}
      >
        <div className="p-[17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>AI reallocation ideas</h3>
        </div>
        <div className="flex flex-col gap-3 p-[17px]">
          <p className="m-0 text-[12px]" style={{ color: "var(--app-text-disabled)" }}>
            Based on your own real spend and results over this period. Past performance does not guarantee future results — review before applying.
          </p>
          {mutation.data ? (
            <p className="m-0 text-[13px] leading-relaxed" style={{ color: "var(--app-text)" }}>{mutation.data.suggestion}</p>
          ) : (
            <button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="self-start rounded-[10px] px-4 py-2.5 text-[12.5px] font-extrabold text-white disabled:opacity-60"
              style={{ background: "var(--app-primary)" }}
            >
              {mutation.isPending ? "Thinking…" : "Get suggestion"}
            </button>
          )}
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

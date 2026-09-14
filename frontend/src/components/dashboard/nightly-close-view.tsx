"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Moon, Eye, Send } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { useSession } from "@/lib/session";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  fetchNightlyCloseHistory,
  fetchNightlyCloseSettings,
  previewNightlyClose,
  sendNightlyCloseTest,
  type NightlyCloseHistoryRow,
} from "@/lib/nightly-close-api";
import { SlideDrawer } from "./slide-drawer";
import { NightlyCloseTimeModal } from "./nightly-close-time-modal";
import { NightlyCloseCustomLineModal } from "./nightly-close-custom-line-modal";
import { NightlyCloseChannelDrawer } from "./nightly-close-channel-drawer";
import { NightlyCloseVoiceDrawer } from "./nightly-close-voice-drawer";
import { NightlyCloseSectionsDrawer } from "./nightly-close-sections-drawer";

const outlineBtnStyle: React.CSSProperties = {
  border: "1px solid var(--app-border)",
  borderRadius: 10,
  padding: "9px 14px",
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--app-text-muted)",
  background: "var(--app-surface)",
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const selectStyle: React.CSSProperties = {
  border: "1px solid var(--app-border)",
  borderRadius: 9,
  padding: "7px 10px",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--app-text-muted)",
  background: "var(--app-surface)",
};

function to12Hour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

type Panel = "time" | "customLine" | "channel" | "voice" | "sections" | "preview" | null;

export function NightlyCloseView() {
  const session = useSession();
  const queryClient = useQueryClient();
  const [panel, setPanel] = useState<Panel>(null);
  const [rangeDays, setRangeDays] = useState<7 | 30 | 90>(30);
  const [statusFilter, setStatusFilter] = useState<"all" | NightlyCloseHistoryRow["deliveryStatus"]>("all");

  const { data: settings } = useQuery({ queryKey: ["nightly-close-settings"], queryFn: fetchNightlyCloseSettings });

  const { data: history, isPending, isError, refetch } = useQuery({
    queryKey: ["nightly-close-history", rangeDays],
    queryFn: () => fetchNightlyCloseHistory({ from: new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) }),
  });

  const previewQuery = useQuery({
    queryKey: ["nightly-close-preview"],
    queryFn: previewNightlyClose,
    enabled: panel === "preview",
  });

  const testSendMutation = useMutation({
    mutationFn: sendNightlyCloseTest,
    onSuccess: () => {
      toast.success("Test close sent.");
      queryClient.invalidateQueries({ queryKey: ["nightly-close-history"] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't send the test close — please try again.");
    },
  });

  const filteredHistory = useMemo(() => {
    if (!history) return history;
    return statusFilter === "all" ? history : history.filter((h) => h.deliveryStatus === statusFilter);
  }, [history, statusFilter]);

  const stats = useMemo(() => {
    if (!history || history.length === 0) return null;
    const last = history[0];
    const sentCount = history.filter((h) => h.deliveryStatus === "sent").length;
    return {
      lastSent: last.date,
      lastStatus: last.deliveryStatus,
      successRate: Math.round((sentCount / history.length) * 100),
      channel: last.channel,
    };
  }, [history]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <Moon className="h-4 w-4" style={{ color: "var(--app-text-faint)" }} aria-hidden />
            <h2 className="text-[19px] font-extrabold tracking-tight" style={{ color: "var(--app-text)" }}>Nightly Close</h2>
            {settings && (
              <span className="rounded-full px-2.5 py-1 text-[11.5px] font-bold" style={{ background: "var(--app-success-bg)", color: "var(--app-success-text)" }}>
                Scheduled · Sends at {to12Hour(settings.time)}
              </span>
            )}
          </div>
          <p className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>A daily wrap of your business, delivered to you every night.</p>
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setPanel("customLine")} style={outlineBtnStyle}>Add custom line</button>
          <button type="button" onClick={() => setPanel("time")} style={outlineBtnStyle}>Change time</button>
          <button type="button" onClick={() => setPanel("sections")} style={outlineBtnStyle}>Customize Report</button>
          <button type="button" onClick={() => setPanel("channel")} style={outlineBtnStyle}>Change Channel</button>
          <button type="button" onClick={() => setPanel("voice")} style={outlineBtnStyle}>Voice Note</button>
          <button type="button" onClick={() => testSendMutation.mutate()} disabled={testSendMutation.isPending} style={{ ...outlineBtnStyle, opacity: testSendMutation.isPending ? 0.6 : 1 }}>
            <Send className="h-3.5 w-3.5" aria-hidden />
            {testSendMutation.isPending ? "Sending…" : "Send test now"}
          </button>
          <button
            type="button"
            onClick={() => setPanel("preview")}
            className="flex items-center gap-1.5 rounded-[10px] px-4 py-[9px] text-[12.5px] font-bold text-white"
            style={{ background: "var(--app-primary)" }}
          >
            <Eye className="h-3.5 w-3.5" aria-hidden />
            Preview tonight&apos;s close
          </button>
        </div>
      </div>

      <div className="rounded-[14px] p-[18px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        {stats ? (
          <>
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
              <StatCard label="Last sent" value={formatDate(stats.lastSent)} />
              <StatCard label="Delivery status" value={stats.lastStatus === "sent" ? "Sent" : "Failed"} />
              <StatCard label="Success rate (30 days)" value={`${stats.successRate}%`} />
              <StatCard label="Channel used" value={stats.channel} />
            </div>
            {history && (
              <div className="mt-4">
                <p className="mb-2 text-[13px] font-bold" style={{ color: "var(--app-text)" }}>Nightly sales trend — 30 days</p>
                <NightlyCloseTrendBars history={history} />
              </div>
            )}
          </>
        ) : (
          <p className="text-[13px]" style={{ color: "var(--app-text-faintest)" }}>No history yet — your first Nightly Close sends tonight.</p>
        )}
      </div>

      <div className="rounded-[14px] overflow-hidden" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap items-center gap-2.5 p-[14px_18px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="text-[15px] font-bold" style={{ color: "var(--app-text)" }}>Close history</h3>
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <select value={rangeDays} onChange={(e) => setRangeDays(Number(e.target.value) as 7 | 30 | 90)} style={selectStyle} aria-label="Date range">
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} style={selectStyle} aria-label="Delivery status">
              <option value="all">All</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
            </select>
            <button type="button" onClick={() => setPanel("sections")} style={selectStyle}>Reorder sections</button>
          </div>
        </div>
        {isPending && (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-[10px]" style={{ background: "var(--app-surface-2)" }} />)}
          </div>
        )}
        {isError && (
          <div className="p-4">
            <ErrorBanner title="Couldn't load Nightly Close history" onRetry={() => refetch()} />
          </div>
        )}
        {filteredHistory && filteredHistory.length === 0 && (
          <EmptyState icon={Moon} title="Your first Nightly Close sends tonight" description="A daily summary of sales, profit, reviews and bookings, delivered automatically." />
        )}
        {filteredHistory && filteredHistory.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="px-[18px] py-2.5 text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Date</th>
                  <th className="px-2.5 py-2.5 text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Sales</th>
                  <th className="px-2.5 py-2.5 text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Profit</th>
                  <th className="px-2.5 py-2.5 text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Reviews</th>
                  <th className="px-2.5 py-2.5 text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Bookings tomorrow</th>
                  <th className="px-2.5 py-2.5 text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Credit recovered</th>
                  <th className="px-[18px] py-2.5 text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Delivery</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((row) => (
                  <tr key={row.date} style={{ borderTop: "1px solid var(--app-surface-2)" }}>
                    <td className="px-[18px] py-2.5 font-semibold" style={{ color: "var(--app-text-muted)" }}>{formatDate(row.date)}</td>
                    <td className="px-2.5 py-2.5 text-end tabular-nums" style={{ color: "var(--app-text)" }}>{row.sales}</td>
                    <td className="px-2.5 py-2.5 text-end tabular-nums" style={{ color: "var(--app-text)" }}>{formatCurrency(row.profit, session.business.currency)}</td>
                    <td className="px-2.5 py-2.5 text-end tabular-nums" style={{ color: "var(--app-text)" }}>{row.newReviews}</td>
                    <td className="px-2.5 py-2.5 text-end tabular-nums" style={{ color: "var(--app-text)" }}>{row.bookingsTomorrow}</td>
                    <td className="px-2.5 py-2.5 text-end tabular-nums" style={{ color: "var(--app-text)" }}>{formatCurrency(row.creditRecovered, session.business.currency)}</td>
                    <td className="px-[18px] py-2.5">
                      <span
                        className="rounded-full px-2 py-0.5 text-[10.5px] font-bold"
                        style={
                          row.deliveryStatus === "sent"
                            ? { background: "var(--app-success-bg)", color: "var(--app-success-text)" }
                            : { background: "#FEE4E2", color: "var(--app-danger-strong)" }
                        }
                      >
                        {row.deliveryStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NightlyCloseTimeModal open={panel === "time"} onClose={() => setPanel(null)} current={settings} />
      <NightlyCloseCustomLineModal open={panel === "customLine"} onClose={() => setPanel(null)} current={settings} />
      <NightlyCloseChannelDrawer open={panel === "channel"} onClose={() => setPanel(null)} current={settings} />
      <NightlyCloseVoiceDrawer open={panel === "voice"} onClose={() => setPanel(null)} current={settings} />
      <NightlyCloseSectionsDrawer open={panel === "sections"} onClose={() => setPanel(null)} current={settings} />

      <SlideDrawer open={panel === "preview"} onClose={() => setPanel(null)} title="Tonight's Nightly Close">
        {previewQuery.isPending && <div className="h-24 animate-pulse rounded-[10px]" style={{ background: "var(--app-surface-2)" }} />}
        {previewQuery.data && (
          <div className="flex flex-col gap-3">
            <div className="rounded-[14px] p-4" style={{ background: "var(--app-sidebar-bg)" }}>
              <p className="text-[11.5px] font-bold" style={{ color: "#8FF0BB" }}>
                Nightly Close · {settings ? to12Hour(settings.time) : ""}
              </p>
              <p className="mt-1 text-[17px] font-extrabold text-white">{previewQuery.data.businessName} — daily wrap</p>
            </div>
            <PreviewRow label="Orders" value={String(previewQuery.data.ordersCount)} />
            <PreviewRow label="Revenue" value={formatCurrency(previewQuery.data.revenue, session.business.currency)} />
            <PreviewRow label="Gross profit" value={formatCurrency(previewQuery.data.grossProfit, session.business.currency)} />
            <PreviewRow label="Bookings tomorrow" value={String(previewQuery.data.appointmentsTomorrowCount)} />
            <PreviewRow label="New reviews" value={String(previewQuery.data.newReviewsCount)} />
            <PreviewRow label="Credit recovered today" value={formatCurrency(previewQuery.data.creditPaymentsTodayTotal, session.business.currency)} last />
            {previewQuery.data.lowStockProducts.length > 0 && (
              <p className="text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>{previewQuery.data.lowStockProducts.length} low-stock item(s) will be flagged.</p>
            )}
            {settings?.config.voiceNoteEnabled && (
              <div className="rounded-[12px] p-[14px]" style={{ background: "var(--app-success-bg)", border: "1px solid var(--app-success-border)" }}>
                <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>Voice note attached — a spoken summary will be sent alongside this close.</p>
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPanel("channel")}
                className="flex-1 rounded-[10px] py-[10px] text-[12.5px] font-semibold"
                style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}
              >
                Change Channel
              </button>
              <button
                type="button"
                onClick={() => testSendMutation.mutate()}
                disabled={testSendMutation.isPending}
                className="flex-1 rounded-[10px] py-[10px] text-[12.5px] font-bold text-white disabled:opacity-60"
                style={{ background: "var(--app-primary)" }}
              >
                {testSendMutation.isPending ? "Sending…" : "Send test now"}
              </button>
            </div>
          </div>
        )}
      </SlideDrawer>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] px-3.5 py-2.5" style={{ background: "var(--app-surface-2)" }}>
      <p className="text-[16px] font-bold" style={{ color: "var(--app-text)" }}>{value}</p>
      <p className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>{label}</p>
    </div>
  );
}

function PreviewRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className="flex justify-between p-[10px_0]" style={{ borderBottom: last ? "none" : "1px solid var(--app-surface-2)" }}>
      <span className="text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>{label}</span>
      <span className="text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{value}</span>
    </div>
  );
}

/** Bar-style trend, matching the design's exact chart type (not a line) — real 30-day sales counts. */
function NightlyCloseTrendBars({ history }: { history: NightlyCloseHistoryRow[] }) {
  const points = [...history].reverse();
  if (points.length < 2) {
    return <p className="py-8 text-center text-[13px]" style={{ color: "var(--app-text-faintest)" }}>Not enough history yet to chart a trend.</p>;
  }
  const max = Math.max(...points.map((p) => p.sales), 1);
  return (
    <div className="flex h-[150px] items-end gap-1">
      {points.map((p, i) => (
        <div key={p.date} className="group relative flex h-full flex-1 flex-col items-center justify-end" title={`${formatDate(p.date)} — ${p.sales} sale(s)`}>
          <div
            className="w-full rounded-t-[4px]"
            style={{ height: `${Math.max(2, (p.sales / max) * 100)}%`, background: i === points.length - 1 ? "var(--app-primary-hover)" : "var(--app-success-border)" }}
          />
        </div>
      ))}
    </div>
  );
}

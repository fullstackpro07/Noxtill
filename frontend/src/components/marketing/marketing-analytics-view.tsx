"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMarketingOverview } from "@/lib/marketing-overview-api";
import { fetchSegments } from "@/lib/segments-api";
import { useSession } from "@/lib/session";
import { formatCurrency } from "@/lib/format";

type BreakdownKey = "Channel" | "Audience";

export function MarketingAnalyticsView() {
  const session = useSession();
  const currency = session.business.currency;
  const [lineageOpen, setLineageOpen] = useState(false);
  const [breakdownBy, setBreakdownBy] = useState<BreakdownKey>("Channel");

  const { data } = useQuery({ queryKey: ["marketing-overview"], queryFn: fetchMarketingOverview });
  const { data: segments = [] } = useQuery({ queryKey: ["segments"], queryFn: fetchSegments });
  const totals = data?.totals;
  const channels = useMemo(() => data?.channels ?? [], [data]);

  const kpis = totals
    ? [
        { label: "Sent", value: String(totals.results), color: "var(--app-text)" },
        { label: "Engagement", value: String(totals.read), color: "var(--app-text)" },
        { label: "Conversions", value: String(totals.redemptions), color: "var(--app-text)" },
        { label: "Attributed Revenue", value: formatCurrency(totals.revenue, currency), color: "var(--app-text)", highlight: true },
        { label: "Marketing Cost", value: formatCurrency(totals.spend, currency), color: "var(--app-warning-text)" },
        { label: "Return", value: totals.spend > 0 ? `${(totals.revenue / totals.spend).toFixed(1)}×` : "—", color: "var(--app-primary)" },
      ]
    : [];

  const funnel = totals
    ? [
        { l: "Sent", v: totals.results, color: "#3538CD" },
        { l: "Delivered", v: totals.delivered, color: "#2563EB" },
        { l: "Engaged", v: totals.read, color: "#0D7C74" },
        { l: "Converted", v: totals.redemptions, color: "var(--app-primary)" },
      ]
    : [];
  const funnelMax = Math.max(1, ...funnel.map((f) => f.v));

  const breakdownRows =
    breakdownBy === "Channel"
      ? channels.map((c) => ({ l: c.channel, valueLabel: c.spend ? formatCurrency(c.spend, currency) : "—", sub: `${c.results} results`, width: c.spend }))
      : segments.map((s) => ({ l: s.name, valueLabel: formatCurrency(s.spend, currency), sub: `${s.count} customers`, width: s.spend }));
  const breakdownMax = Math.max(1, ...breakdownRows.map((r) => r.width));

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[10px]">
        <span className="text-[13px] font-bold" style={{ color: "var(--app-text-faint)" }}>Attributed, not caused — figures show what marketing was associated with</span>
        <div className="ml-auto flex flex-wrap gap-[9px]">
          <button type="button" onClick={() => setLineageOpen(true)} className="rounded-[11px] text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", padding: "11px 15px", minHeight: 44 }}>
            Where does this come from?
          </button>
        </div>
      </div>

      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))" }}>
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-[14px]"
            style={{ background: "var(--app-surface)", border: k.highlight ? "1.5px solid var(--app-success-border)" : "1px solid var(--app-border)", padding: 15 }}
          >
            <div className="text-[12px]" style={{ color: k.highlight ? "var(--app-success-text)" : "var(--app-text-faintest)", fontWeight: k.highlight ? 700 : 600 }}>{k.label}</div>
            <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div className="grid items-start gap-[15px]" style={{ gridTemplateColumns: "minmax(0,1fr) 340px" }}>
        <div className="min-w-0 rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 17 }}>
          <div className="mb-3 flex flex-wrap items-center gap-2.5">
            <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Breakdown</h3>
            <select value={breakdownBy} onChange={(e) => setBreakdownBy(e.target.value as BreakdownKey)} aria-label="Break down by" className="ml-auto rounded-[10px] text-[12.5px] font-semibold" style={{ border: "1px solid var(--app-border)", padding: "9px 11px", color: "var(--app-text-muted)", minHeight: 42 }}>
              <option>Channel</option>
              <option>Audience</option>
            </select>
          </div>
          <div className="flex flex-col gap-3">
            {breakdownRows.length === 0 && <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No data yet.</p>}
            {breakdownRows.map((r) => (
              <div key={r.l}>
                <div className="mb-1 flex justify-between gap-2">
                  <span className="text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{r.l}</span>
                  <span className="text-[12px] font-extrabold" style={{ color: "var(--app-text)" }}>{r.valueLabel}</span>
                </div>
                <div className="h-[10px] overflow-hidden rounded-[6px]" style={{ background: "var(--app-surface-2)" }}>
                  <div className="h-full rounded-[6px]" style={{ background: "var(--app-primary)", width: `${(r.width / breakdownMax) * 100}%` }} />
                </div>
                <div className="mt-1 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>{r.sub}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 17 }}>
          <h3 className="m-0 mb-3 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Conversion funnel</h3>
          <div className="flex flex-col gap-2.5">
            {funnel.map((f) => (
              <div key={f.l}>
                <div className="mb-1 flex justify-between">
                  <span className="text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{f.l}</span>
                  <span className="text-[12px] font-extrabold" style={{ color: "var(--app-text)" }}>{f.v}</span>
                </div>
                <div className="h-[11px] overflow-hidden rounded-[7px]" style={{ background: "var(--app-surface-2)" }}>
                  <div className="h-full rounded-[7px]" style={{ background: f.color, width: `${(f.v / funnelMax) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap items-center gap-2.5" style={{ padding: "13px 17px", borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Channel performance</h3>
          <button type="button" onClick={() => setLineageOpen(true)} className="ml-auto rounded-[10px] text-[12px] font-bold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", padding: "9px 13px", minHeight: 42 }}>
            Where does this number come from?
          </button>
        </div>
        {channels.length === 0 ? (
          <div className="p-[40px_18px] text-center text-[13px]" style={{ color: "var(--app-text-disabled)" }}>No channel data yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 620 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  {["Channel", "Spend", "Results", "Cost / Result"].map((h) => (
                    <th key={h} className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {channels.map((c) => (
                  <tr key={c.channel} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                    <td className="p-[12px_17px] text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{c.channel}</td>
                    <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{c.spend ? formatCurrency(c.spend, currency) : "—"}</td>
                    <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{c.results}</td>
                    <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{c.costPerResult != null ? formatCurrency(c.costPerResult, currency) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="text-[11.5px]" style={{ borderTop: "1px solid var(--app-surface-2)", color: "var(--app-text-disabled)", padding: "11px 17px" }}>
          Revenue is counted only once payment confirms, from real orders that redeemed a coupon or voucher.
        </div>
      </div>

      {lineageOpen && <LineageDialog onClose={() => setLineageOpen(false)} />}
    </main>
  );
}

function LineageDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[88] flex items-center justify-center p-5" style={{ background: "rgba(10,27,42,.42)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[440px] rounded-[18px]" style={{ background: "var(--app-surface)" }}>
        <div className="p-[17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>Where attributed revenue comes from</h3>
        </div>
        <div className="flex flex-col gap-2.5 p-[17px] text-[12.5px]" style={{ color: "var(--app-text)" }}>
          <Step n={1} text="A customer placed a real order or made a real booking." />
          <Step n={2} text="That order or booking used a coupon or voucher code." />
          <Step n={3} text="Payment confirmed — only then does it count." />
          <p className="m-0 mt-1 rounded-[11px] p-[11px_13px] text-[11.5px]" style={{ background: "var(--app-warning-bg)", color: "var(--app-warning-text)" }}>
            This is not a multi-touch or last-click model across campaigns — there is no per-campaign click/open tracking joined to orders in this system. It only counts orders that redeemed a real code, so a customer who would have bought anyway is still counted.
          </p>
        </div>
        <div className="flex justify-end p-[14px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
          <button type="button" onClick={onClose} className="rounded-[10px] px-4 py-2.5 text-[12.5px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-[11px] p-[11px]" style={{ border: "1px solid var(--app-border)" }}>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] text-[11px] font-extrabold" style={{ background: "var(--app-surface-2)", color: "var(--app-text-muted)" }}>{n}</span>
      <span className="text-[12.5px]" style={{ color: "var(--app-text)" }}>{text}</span>
    </div>
  );
}

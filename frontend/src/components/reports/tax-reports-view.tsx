"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { useSession } from "@/lib/session";
import { generateReport } from "@/lib/reports-api";
import { fetchTaxExcel, fetchTaxSummary, setTaxReminder } from "@/lib/tax-reports-api";
import {
  ErrorCard,
  Kpi,
  KpiGrid,
  KpiSkeletons,
  R,
  RIcon,
  cardShellStyle,
  chipStyle,
  dayMonth,
  formatMoney,
  formatMoney2,
  monthName,
  ordinal,
  shortDate,
  smallBtnStyle,
  thStyle,
  type Tone,
} from "./reports-ui";
import { useReports } from "./reports-context";

export function TaxReportsView() {
  const { period, openPanel, notify } = useReports();
  const session = useSession();
  const qc = useQueryClient();
  const isOwner = session.user.role === "owner";
  const q = useQuery({ queryKey: ["reports", "tax", period], queryFn: () => fetchTaxSummary(period) });

  const remind = useMutation({
    mutationFn: (forPeriod: string) => setTaxReminder(forPeriod),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["reports", "tax"] });
      notify("Reminder set", `You will be reminded on ${shortDate(r.remindOn)}, three days before ${shortDate(r.filingDate)}.`);
    },
    onError: (e) => notify("Couldn't set the reminder", e instanceof ApiError ? e.message : "Please try again."),
  });

  const pdf = useMutation({
    mutationFn: async (then: "download" | "send") => {
      const { url, run } = await generateReport("tax", period);
      return { url, run, then };
    },
    onSuccess: ({ url, run, then }) => {
      void qc.invalidateQueries({ queryKey: ["reports"] });
      if (then === "download") {
        window.open(url, "_blank", "noopener");
        notify("Tax summary ready", `${monthName(period)} · v${run.version} · secure link expires in 24 hours.`);
      } else {
        openPanel({ type: "send", runId: run.id, name: "Tax summary", periodLabel: monthName(period) });
      }
    },
    onError: (e) => notify("Couldn't generate the tax summary", e instanceof ApiError ? e.message : "Please try again."),
  });

  const excel = useMutation({
    mutationFn: () => fetchTaxExcel(period),
    onSuccess: ({ url }) => {
      window.open(url, "_blank", "noopener");
      notify("Excel ready", `${monthName(period)} · secure link expires in 24 hours.`);
    },
    onError: (e) => notify("Couldn't export", e instanceof ApiError ? e.message : "Please try again."),
  });

  if (q.isError) return <ErrorCard message={q.error instanceof ApiError ? q.error.message : "Tax figures could not be loaded."} onRetry={() => void q.refetch()} />;
  const t = q.data;
  const money = (n: number) => (t ? formatMoney(n, t.currency) : "");
  const money2 = (n: number) => (t ? formatMoney2(n, t.currency) : "");

  const kpiPanel = (label: string, value: string, meta: string, calc: string, tone: Tone) =>
    t &&
    openPanel({
      type: "static",
      spec: {
        kicker: "Tax figure",
        title: `${label} · ${value}`,
        badge: meta,
        badgeTone: tone,
        rows: [
          { label: "Value", value },
          { label: "Period", value: t.periodLabel },
          { label: "Tax", value: `${t.taxLabel} · ${t.taxRate}% standard rate` },
          { label: "Transactions", value: t.kpis.transactions.toLocaleString("en-US") },
          { label: "Left out", value: t.kpis.unratedTransactions > 0 ? `${t.kpis.unratedTransactions} with no tax rate recorded` : "Nothing" },
          { label: "Calculation", value: calc },
        ],
        bulletsTitle: "What this is and is not",
        bullets: [
          "This is a reporting figure prepared from your recorded sales",
          "It is not a legal determination of what you owe",
          "Sales with no recorded tax rate are listed separately, not assumed to be zero-rated",
        ],
        note: "Noxtill does not file returns or submit to any tax authority.",
      },
    });

  const maxBar = t ? Math.max(...t.trend.map((b) => b.taxCollected), 1) : 1;
  const filing = t?.filing;
  const filingPast = !!filing && filing.daysUntil < 0;
  const daysLabel = (n: number) => `${Math.abs(n)} day${Math.abs(n) === 1 ? "" : "s"}`;
  const filingTone: Tone = filing && (filing.daysUntil <= 7 || filingPast) ? "amber" : "neutral";
  const noRate = t?.rows.filter((r) => r.ratePercent === null).reduce((n, r) => n + r.orders, 0) ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ ...cardShellStyle, borderColor: "#FDE49B", borderRadius: 12, boxShadow: "0 1px 2px rgba(16,24,40,.04)", padding: "14px 17px", display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap" }}>
        <RIcon name="info" size={16} style={{ color: "#B45309" }} />
        <div style={{ flex: 1, minWidth: 240, fontSize: 11.5, color: "#B45309", lineHeight: 1.5, textWrap: "pretty" }}>
          Noxtill prepares tax reporting from your business data. It does not file returns, submit to any tax authority, or determine your legal liability — recording something as filed here means you filed it, not that Noxtill did.
        </div>
      </div>

      {!t ? (
        <KpiSkeletons count={6} />
      ) : (
        <KpiGrid>
          <Kpi label="Taxable sales" value={money(t.kpis.taxableSales)} meta={t.periodLabel} onClick={() => kpiPanel("Taxable sales", money2(t.kpis.taxableSales), t.periodLabel, "Order subtotals less discounts, for completed sales, excluding tax already inside tax-inclusive prices", "neutral")} />
          <Kpi label="Tax collected" value={money(t.kpis.taxCollected)} meta={`at ${t.taxRate}% ${t.taxLabel}`} onClick={() => kpiPanel("Tax collected", money2(t.kpis.taxCollected), `at ${t.taxRate}%`, "Sum of the tax charged on completed sales", "neutral")} />
          <Kpi label="Tax on purchases" value="Not tracked" meta="no input tax is recorded" compact onClick={() => kpiPanel("Tax on purchases", "Not tracked", "no input tax is recorded", "Not calculated — no supplier invoice or expense records tax paid", "amber")} />
          <Kpi label="Adjustments" value={t.kpis.refundsApproved.count ? `− ${money(t.kpis.refundsApproved.amount)}` : "—"} meta={t.kpis.refundsApproved.count ? `${t.kpis.refundsApproved.count} approved return${t.kpis.refundsApproved.count === 1 ? "" : "s"} · not netted` : "no approved returns"} onClick={() => kpiPanel("Adjustments", t.kpis.refundsApproved.count ? `− ${money2(t.kpis.refundsApproved.amount)}` : "None", "refunds, shown not netted", "Sum of approved return refunds — how much of each was tax is not recorded, so it is not deducted", "neutral")} />
          <Kpi label="Net tax" value={money(t.kpis.netTax)} meta="tax collected · purchases not tracked" tone="amber" onClick={() => kpiPanel("Net tax", money2(t.kpis.netTax), "collected only", "Tax collected (input tax on purchases is not tracked, so nothing is deducted)", "amber")} />
          <Kpi label="Next filing date" value={filing ? dayMonth(filing.nextDate) : "—"} meta={filing ? `${filingPast ? `${daysLabel(filing.daysUntil)} past` : daysLabel(filing.daysUntil)} · as configured` : ""} tone="amber" />
        </KpiGrid>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 18, alignItems: "start" }}>
        <div style={{ ...cardShellStyle, minWidth: 0, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Tax collected by month</div>
            <div style={{ marginLeft: "auto", fontSize: 11, color: R.faint }}>{t ? `${t.taxLabel} · ${t.taxRate}%` : ""}</div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 9, height: 150, marginTop: 16 }}>
            {(t?.trend ?? Array.from({ length: 8 }, (_, i) => ({ period: String(i), label: "", taxCollected: 0, partial: false }))).map((b, i, arr) => (
              <button
                key={b.period}
                type="button"
                onClick={() => t && notify(`${monthName(b.period)}`, b.partial ? "Partial month — labelled as partial, never annualised." : `Tax collected ${money2(b.taxCollected)}.`)}
                style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", height: "100%", gap: 6, cursor: "pointer", border: 0, background: "transparent", padding: 0 }}
              >
                <div style={{ width: "100%", height: `${t ? Math.max((b.taxCollected / maxBar) * 100, 3) : 30}%`, borderRadius: "4px 4px 0 0", background: !t ? "#F1F3F6" : b.partial ? "#C3CAD4" : R.green, opacity: t ? (i === arr.length - 1 || b.partial ? 1 : 0.82) : 1 }} />
                <div style={{ fontSize: 9.5, color: R.faint }}>{b.label}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ ...cardShellStyle, padding: 17 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <RIcon name="calendar-clock" size={16} style={{ color: R.text }} />
              <div style={{ fontSize: 13.5, fontWeight: 800 }}>Next filing date</div>
              <div style={{ marginLeft: "auto" }}>
                <span style={chipStyle(filingTone, { height: 22 })}>{filing ? (filing.daysUntil === 0 ? "Today" : filingPast ? `${daysLabel(filing.daysUntil)} past` : daysLabel(filing.daysUntil)) : "…"}</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginTop: 11 }}>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.03em" }}>{filing ? shortDate(filing.nextDate) : "—"}</div>
            </div>
            <div style={{ fontSize: 11.5, color: R.muted, marginTop: 6, lineHeight: 1.5, textWrap: "pretty" }}>
              {filing
                ? `This is the day you configured — the ${ordinal(filing.day)} of each month — for the ${filing.forPeriodLabel} return.${filingPast ? " That date has passed and no filing is recorded for this period." : ""}${filing.reminderOn ? ` Reminder set for ${shortDate(filing.reminderOn)}.` : ""} Noxtill reminds you — it does not track statutory deadlines on your behalf or confirm they are correct.`
                : ""}
            </div>
            <div style={{ display: "flex", gap: 7, marginTop: 12, flexWrap: "wrap" }}>
              <button type="button" disabled={!filing || remind.isPending} onClick={() => filing && remind.mutate(filing.forPeriod)} style={smallBtnStyle}>
                {filing?.reminderOn ? "Reset reminder" : "Remind me"}
              </button>
              <button type="button" disabled={!isOwner || !filing} title={isOwner ? undefined : "Only the owner can record a return as filed"} onClick={() => filing && openPanel({ type: "tax-record", period: filing.forPeriod })} style={{ ...smallBtnStyle, opacity: isOwner ? 1 : 0.5, cursor: isOwner ? "pointer" : "not-allowed" }}>
                Record as filed
              </button>
              {isOwner ? (
                <button type="button" onClick={() => openPanel({ type: "tax-settings" })} style={smallBtnStyle}>
                  Change date
                </button>
              ) : null}
            </div>
          </div>

          <div style={{ ...cardShellStyle, borderColor: "#FDE49B", padding: 17 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <RIcon name="triangle-alert" size={16} style={{ color: "#B45309" }} />
              <div style={{ fontSize: 13.5, fontWeight: 800 }}>Tax validation</div>
              <div style={{ marginLeft: "auto" }}>
                <span style={chipStyle("amber", { height: 22 })}>{t ? `${t.issues.length} issue${t.issues.length === 1 ? "" : "s"}` : "…"}</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 12 }}>
              {(t?.issues ?? []).map((i) => (
                <button
                  key={i.key}
                  type="button"
                  onClick={() => openPanel({ type: "tax-issue", issueKey: i.key })}
                  style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 11px", borderRadius: 10, border: `1px solid ${R.divider}`, cursor: "pointer", background: "#fff", textAlign: "left", width: "100%" }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{i.title}</div>
                    <div style={{ fontSize: 10.5, color: R.faint, marginTop: 2 }}>{i.meta}</div>
                  </div>
                  <span style={chipStyle(i.tone, { height: 20, fontSize: 9.5 })}>{i.count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ ...cardShellStyle, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Tax by rate and period</div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 7, flexWrap: "wrap" }}>
            <button type="button" disabled={pdf.isPending} onClick={() => pdf.mutate("download")} style={smallBtnStyle}>
              <RIcon name="download" size={13} />
              Download PDF
            </button>
            <button type="button" disabled={excel.isPending} onClick={() => excel.mutate()} style={smallBtnStyle}>
              <RIcon name="file-down" size={13} />
              Export Excel
            </button>
            <button type="button" disabled={pdf.isPending} onClick={() => pdf.mutate("send")} style={smallBtnStyle}>
              <RIcon name="send" size={13} />
              Send to accountant
            </button>
          </div>
        </div>
        <div className="nx-scroll" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 1040, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#FAFBFC", borderTop: `1px solid ${R.divider}`, borderBottom: `1px solid ${R.border}` }}>
                <th style={{ ...thStyle("left"), paddingLeft: 18 }}>Period</th>
                <th style={thStyle("left")}>Rate</th>
                <th style={thStyle("right")}>Taxable amount</th>
                <th style={thStyle("right")}>Tax collected</th>
                <th style={thStyle("right")}>Tax on purchases</th>
                <th style={thStyle("right")}>Adjustments</th>
                <th style={thStyle("right")}>Net tax</th>
                <th style={thStyle("center")}>Transactions</th>
                <th style={{ ...thStyle("left"), paddingRight: 18 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {!t ? (
                <tr>
                  <td colSpan={9} style={{ padding: 28, textAlign: "center", fontSize: 12.5, color: R.faint }}>
                    Loading tax figures…
                  </td>
                </tr>
              ) : t.rows.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: "34px 18px", textAlign: "center", fontSize: 12.5, color: R.muted }}>
                    No completed sales with tax recorded in these months.
                  </td>
                </tr>
              ) : (
                t.rows.map((r, i) => {
                  const unrated = r.ratePercent === null;
                  return (
                    <tr key={`${r.period}-${r.rateLabel}-${i}`} onClick={() => openPanel({ type: "tax-row", row: r })} style={{ borderBottom: `1px solid ${R.rowLine}`, cursor: "pointer", background: r.statusTone === "red" ? "#FEFBFB" : "#fff" }}>
                      <td style={{ padding: "11px 12px 11px 18px", fontSize: 12.5, fontWeight: 700 }}>{r.periodLabel}</td>
                      <td style={{ padding: "11px 12px" }}>
                        <span style={chipStyle(unrated ? "red" : r.ratePercent === 0 ? "neutral" : "blue", { height: 21, fontSize: 10 })}>{r.rateLabel}</span>
                      </td>
                      <td style={{ padding: "11px 12px", textAlign: "right", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{money(r.taxable)}</td>
                      <td style={{ padding: "11px 12px", textAlign: "right", fontSize: 12.5, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: unrated ? "#B42318" : R.ink }}>{r.collected === null ? "Unknown" : money(r.collected)}</td>
                      <td style={{ padding: "11px 12px", textAlign: "right", fontSize: 12, color: R.label }}>Not tracked</td>
                      <td style={{ padding: "11px 12px", textAlign: "right", fontSize: 12 }}>—</td>
                      <td style={{ padding: "11px 12px", textAlign: "right", fontSize: 12.5, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{r.collected === null ? "—" : money(r.collected)}</td>
                      <td style={{ padding: "11px 12px", textAlign: "center", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{r.orders.toLocaleString("en-US")}</td>
                      <td style={{ padding: "11px 18px 11px 12px" }}>
                        <span style={chipStyle(r.statusTone, { height: 21, fontSize: 10 })}>{r.status}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "12px 18px", borderTop: `1px solid ${R.divider}`, background: "#FCFCFD", fontSize: 11, color: R.faint }}>
          {noRate > 0
            ? `${noRate} transaction${noRate === 1 ? " has" : "s have"} no tax rate recorded. ${noRate === 1 ? "It is" : "They are"} listed separately rather than assumed to be zero-rated, because that assumption would change your tax.`
            : "Every completed sale in these months carries a recorded tax rate. Tax on purchases is not tracked, so net tax equals tax collected."}
        </div>
      </div>
    </div>
  );
}

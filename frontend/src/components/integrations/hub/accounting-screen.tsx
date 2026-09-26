"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CardEmpty, ErrorCard, KpiSkeletons, thStyle } from "@/components/reports/reports-ui";
import { HUB_KEYS, fetchAccountingOverview, fetchAccountingTransactions, syncAccounting, type AccountingTransaction } from "@/lib/integrations-hub-api";
import { EmptyRow, HIcon, Legend, R, StackedBars, TableFootnote, card, chipStyle, errorMessage, ghostBtn, greenBtn, money, shortStamp, tableAction, whenLabel } from "./hub-ui";
import { useHubOverview, useHubActions, useRefreshHub } from "./use-hub";
import { useIntegrations } from "./integrations-store";

const PROVIDER_NAME: Record<string, string> = { quickbooks: "QuickBooks", xero: "Xero" };

function Kpi({ label, value, meta, tone = "neutral", long }: { label: string; value: string | number; meta: string; tone?: "neutral" | "green" | "red" | "amber"; long?: boolean }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: "14px 15px", boxShadow: "0 1px 2px rgba(16,24,40,.04)", border: `1px solid ${tone === "red" ? "#FBD5D2" : tone === "amber" ? "#FDE49B" : R.border}` }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: R.muted }}>{label}</div>
      <div style={{ fontSize: long ? 15 : 19, fontWeight: 800, letterSpacing: "-.03em", marginTop: 7, fontVariantNumeric: "tabular-nums", color: tone === "red" ? "#B42318" : tone === "amber" ? "#B45309" : R.ink }}>{value}</div>
      <div style={{ fontSize: 10.5, color: R.faint, marginTop: 4 }}>{meta}</div>
    </div>
  );
}

const statusTone = { posted: "green", failed: "red", pending: "neutral" } as const;
const statusIcon = { posted: "circle-check", failed: "circle-alert", pending: "clock-3" } as const;

function csvOf(rows: AccountingTransaction[]): string {
  const esc = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Date", "Order", "Amount", "Ledger account", "Status", "Reason"];
  return [head.join(","), ...rows.map((r) => [r.date.slice(0, 10), `#${r.orderNo}`, r.amount, r.ledgerAccounts.join(" / "), r.status, r.error ?? ""].map(esc).join(","))].join("\n");
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function AccountingScreen() {
  const overview = useQuery({ queryKey: HUB_KEYS.accounting, queryFn: fetchAccountingOverview });
  const tx = useQuery({ queryKey: HUB_KEYS.accountingTx, queryFn: fetchAccountingTransactions });
  const hub = useHubOverview();
  const { openPanel, openConfirm, notify, openDrawer } = useIntegrations();
  const { startConnect } = useHubActions();
  const refresh = useRefreshHub();
  const [onlyUnposted, setOnlyUnposted] = useState(false);

  const sync = useMutation({
    mutationFn: (orderIds?: string[]) => syncAccounting(orderIds),
    onSuccess: (r) => {
      notify(r.failed ? `${r.pushed} posted · ${r.failed} failed` : `${r.pushed} posted`, r.failed ? (r.results.find((x) => x.status === "failed")?.message ?? "See the failed rows for the reason.") : "Each record now has an accounting reference.");
      refresh();
    },
    onError: (e) => notify("Sync did not run", errorMessage(e)),
    onSettled: () => useIntegrations.setState({ confirm: null }),
  });

  const o = overview.data;
  const rows = useMemo(() => tx.data ?? [], [tx.data]);
  const failed = rows.filter((r) => r.status === "failed");
  const unposted = rows.filter((r) => r.status !== "posted");
  const shown = onlyUnposted ? unposted : rows;
  const provider = o?.provider ?? null;
  const name = provider ? PROVIDER_NAME[provider] : "your accounting provider";
  const currency = o?.currency ?? "USD";

  if (overview.error) return <ErrorCard message={errorMessage(overview.error)} onRetry={() => void overview.refetch()} />;
  if (!o) return <KpiSkeletons count={5} />;

  if (!o.connected) {
    const accountingCards = (hub.data?.providers ?? []).filter((p) => p.category === "Accounting");
    return (
      <div style={{ ...card, padding: "40px 24px", textAlign: "center" }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: "#F1F3F6", color: R.label, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
          <HIcon name="receipt-text" size={21} />
        </div>
        <div style={{ fontSize: 15, fontWeight: 800 }}>No accounting provider is connected</div>
        <div style={{ fontSize: 12.5, color: R.muted, marginTop: 6, maxWidth: "58ch", marginInline: "auto", lineHeight: 1.6 }}>
          Connect QuickBooks or Xero and completed sales are posted to it as invoices, using the ledger accounts you map. Nothing is marked as posted until the provider confirms it.
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
          {accountingCards.map((p) => (
            <button key={p.key} type="button" onClick={() => startConnect(p)} style={tableAction(true)}>
              Connect {p.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const failedCount = o.kpis.failed;
  const blockedTotal = o.mapping.blocked.reduce((n, b) => n + b.orders, 0);
  const unpostedTotal = unposted.reduce((n, r) => n + r.amount, 0);

  const askSyncNow = () => {
    const willPost = Math.min(o.kpis.pending + failedCount, o.batchSize);
    openConfirm({
      title: `Post ${willPost} transaction${willPost === 1 ? "" : "s"} to ${name}?`,
      tone: "amber",
      icon: "refresh-cw",
      body: `Up to ${o.batchSize} completed sales that have not posted yet are sent now. A sale whose category has no mapped ledger account is held back instead of being posted to a guess.`,
      rows: [
        { label: "Will post (up to)", value: `${willPost} transaction${willPost === 1 ? "" : "s"}` },
        { label: "Held back · no mapped account", value: blockedTotal ? `${blockedTotal}` : "None", tone: blockedTotal ? "neg" : "pos" },
        { label: "Total value not yet posted", value: money(unpostedTotal, currency) },
        { label: "Direction", value: `Noxtill → ${name}` },
        { label: "Reversible", value: `Only in ${name} · not from Noxtill`, tone: "neg" },
      ],
      review: { label: `Review the ${unposted.length}`, onClick: () => { setOnlyUnposted(true); useIntegrations.setState({ confirm: null }); } },
      primary: "Post now",
      cancel: "Cancel",
      onConfirm: async () => {
        await sync.mutateAsync(undefined);
      },
    });
  };

  const askRetryFailed = () =>
    openConfirm({
      title: `Retry ${failed.length} failed post${failed.length === 1 ? "" : "s"}?`,
      tone: "amber",
      icon: "refresh-cw",
      body: "Only the failed records are tried again. If their cause (usually a missing account mapping) is still there, they fail again with the same reason.",
      rows: [
        { label: "Records retried", value: String(failed.length) },
        { label: "Other pending sales", value: "Not touched", tone: "pos" },
      ],
      primary: "Retry failed",
      cancel: "Cancel",
      onConfirm: async () => {
        await sync.mutateAsync(failed.map((f) => f.id));
      },
    });

  const kpiSyncTone = o.kpis.lastAttemptOk === false ? "red" : "green";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 12 }}>
        <Kpi label="Posted this month" value={o.kpis.postedThisMonth.toLocaleString("en-US")} meta={`to ${name}`} />
        <Kpi label="Pending" value={o.kpis.pending} meta="waiting for the next sync" />
        <Kpi label="Errors" value={failedCount} meta={failedCount ? "post failed · reason kept" : "no failed posts"} tone={failedCount ? "red" : "neutral"} />
        <Kpi label="Last sync" value={o.kpis.lastSyncAt ? whenLabel(o.kpis.lastSyncAt) : "Never"} meta={o.kpis.lastAttemptOk === false ? "the latest attempt failed" : o.kpis.lastSyncAt ? "succeeded" : "no sync yet"} tone={o.kpis.lastSyncAt ? kpiSyncTone : "neutral"} long />
        <Kpi label="Sync trigger" value="On demand" meta={o.kpis.connectedSince ? `connected ${shortStamp(o.kpis.connectedSince)}` : "run Sync now"} long />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 18, alignItems: "start" }}>
        <div style={{ ...card, minWidth: 0, padding: 17 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Sync volume</div>
            <Legend items={[{ color: "#16A34A", label: "Posted" }, { color: "#DC2626", label: "Failed" }]} />
          </div>
          <StackedBars
            data={o.bars.map((b) => ({ label: b.label, ok: b.posted, top: b.failed }))}
            okColor="#16A34A"
            topColor="#DC2626"
            onClick={(i) => notify(o.bars[i].day, `${o.bars[i].posted} posted · ${o.bars[i].failed} failed attempt${o.bars[i].failed === 1 ? "" : "s"}.`)}
          />
        </div>

        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ ...card, padding: "16px 17px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800 }}>Account mapping</div>
              <button type="button" onClick={() => openPanel({ type: "accounting-mapping" })} style={{ ...ghostBtn, marginLeft: "auto" }}>
                Map accounts
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 12 }}>
              {o.mapping.rows.length === 0 && o.mapping.blocked.length === 0 ? (
                <div style={{ fontSize: 12, color: R.muted, padding: 10, lineHeight: 1.5 }}>No mapping yet. Add a default account so completed sales can post.</div>
              ) : null}
              {o.mapping.rows.map((m) => (
                <div key={m.id} onClick={() => openPanel({ type: "accounting-mapping" })} style={{ display: "flex", alignItems: "center", gap: 9, padding: 10, borderRadius: 10, cursor: "pointer", flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 120px", minWidth: 100, fontSize: 12, fontWeight: 700 }}>{m.category ?? "Default · every other category"}</div>
                  <HIcon name="arrow-right" size={13} style={{ color: R.faint }} />
                  <div style={{ flex: "1 1 120px", minWidth: 100, fontSize: 11.5, color: R.text }}>
                    {m.accountCode}
                    {m.taxCode ? ` · tax ${m.taxCode}` : ""}
                  </div>
                  <span style={chipStyle("green", { height: 20, fontSize: 9.5, flexShrink: 0 })}>Mapped</span>
                </div>
              ))}
              {o.mapping.blocked.map((b) => (
                <div key={b.category} onClick={() => openPanel({ type: "accounting-mapping" })} style={{ display: "flex", alignItems: "center", gap: 9, padding: 10, borderRadius: 10, cursor: "pointer", flexWrap: "wrap", background: "#FEFBFB" }}>
                  <div style={{ flex: "1 1 120px", minWidth: 100, fontSize: 12, fontWeight: 700 }}>{b.category === "(none)" ? "Uncategorised products" : b.category}</div>
                  <HIcon name="arrow-right" size={13} style={{ color: R.faint }} />
                  <div style={{ flex: "1 1 120px", minWidth: 100, fontSize: 11.5, color: R.text }}>Not mapped</div>
                  <span style={chipStyle("red", { height: 20, fontSize: 9.5, flexShrink: 0 })}>Blocks {b.orders}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...card, padding: "16px 17px" }}>
            <div style={{ fontSize: 13.5, fontWeight: 800 }}>Sync settings</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 12 }}>
              {o.settings.map((s) => (
                <div key={s.label} onClick={() => notify(s.label, `${s.detail} · currently ${s.value}.`)} style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, borderRadius: 10, cursor: "pointer" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{s.label}</div>
                    <div style={{ fontSize: 10.5, color: R.faint, marginTop: 2, lineHeight: 1.4 }}>{s.detail}</div>
                  </div>
                  <span style={chipStyle(s.value === "Block" ? "amber" : "neutral", { height: 21, fontSize: 10 })}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Posted transactions</div>
          {onlyUnposted ? (
            <button type="button" onClick={() => setOnlyUnposted(false)} style={{ ...chipStyle("blue", { height: 22, fontSize: 10.5 }), cursor: "pointer" }}>
              Showing unposted only · clear
            </button>
          ) : null}
          <div style={{ marginLeft: "auto", display: "flex", gap: 7, flexWrap: "wrap" }}>
            <button type="button" onClick={askSyncNow} disabled={sync.isPending || o.providerPaused} style={tableAction(true, o.providerPaused)}>
              Sync now
            </button>
            <button type="button" onClick={askRetryFailed} disabled={failed.length === 0} style={tableAction(false, failed.length === 0)}>
              Retry {failed.length} failed
            </button>
            <button
              type="button"
              onClick={() => {
                if (unposted.length === 0) return notify("Nothing to export", "Every completed sale has posted.");
                download(`unsynced-${new Date().toISOString().slice(0, 10)}.csv`, csvOf(unposted));
                notify("Exported", `${unposted.length} unposted record${unposted.length === 1 ? "" : "s"} saved as CSV.`);
              }}
              style={tableAction(false)}
            >
              Export unsynced
            </button>
            <button type="button" onClick={() => openPanel({ type: "accounting-mapping" })} style={tableAction(false)}>
              Map accounts
            </button>
          </div>
        </div>
        {o.providerPaused ? (
          <div style={{ padding: "0 18px 12px" }}>
            <span style={chipStyle("amber", { height: 24, fontSize: 11 })}>
              {name} sync is paused ·{" "}
              <button type="button" onClick={() => openDrawer(provider ?? "quickbooks")} style={{ border: 0, background: "transparent", color: "inherit", textDecoration: "underline", cursor: "pointer", font: "inherit" }}>
                resume it in Connections
              </button>
            </span>
          </div>
        ) : null}
        <div style={{ overflowX: "auto" }} className="nx-scroll">
          <table style={{ width: "100%", minWidth: 1080, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#FAFBFC", borderTop: `1px solid ${R.divider}`, borderBottom: `1px solid ${R.border}` }}>
                <th style={thStyle("left")}>Date</th>
                <th style={thStyle("left")}>Type</th>
                <th style={thStyle("left")}>Noxtill reference</th>
                <th style={thStyle("left")}>Accounting reference</th>
                <th style={thStyle("right")}>Amount</th>
                <th style={thStyle("left")}>Ledger account</th>
                <th style={thStyle("left")}>Status</th>
                <th style={thStyle("right")}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tx.isLoading ? (
                <EmptyRow colSpan={8}>Loading transactions…</EmptyRow>
              ) : shown.length === 0 ? (
                <EmptyRow colSpan={8}>{onlyUnposted ? "Every completed sale has posted." : "No completed sales yet — they appear here once a sale is completed."}</EmptyRow>
              ) : (
                shown.map((r) => {
                  const tone = statusTone[r.status];
                  const label = r.status === "posted" ? "Posted" : r.status === "failed" ? "Failed" : "Pending";
                  return (
                    <tr key={r.id} onClick={() => openPanel({ type: "accounting-record", id: r.id })} style={{ borderBottom: `1px solid ${R.rowLine}`, cursor: "pointer", background: tone === "red" ? "#FEFBFB" : tone === "neutral" ? "#FCFCFD" : "#fff" }}>
                      <td style={{ padding: "11px 12px 11px 18px", fontSize: 12, color: R.text }}>{shortStamp(r.date)}</td>
                      <td style={{ padding: "11px 12px" }}>
                        <span style={chipStyle("neutral", { height: 20, fontSize: 9.5 })}>Sale</span>
                      </td>
                      <td style={{ padding: "11px 12px", fontSize: 11.5, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>#{r.orderNo}</td>
                      <td style={{ padding: "11px 12px", fontSize: 11.5, fontFamily: "'JetBrains Mono', monospace" }}>
                        <span style={{ color: r.externalId ? R.text : "#B42318", fontWeight: r.externalId ? 500 : 800 }}>{r.externalId ?? "—"}</span>
                      </td>
                      <td style={{ padding: "11px 12px", textAlign: "right", fontSize: 12.5, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{money(r.amount, currency)}</td>
                      <td style={{ padding: "11px 12px", fontSize: 11.5, color: R.text }}>{r.ledgerAccounts.length ? r.ledgerAccounts.join(" · ") : <span style={{ color: "#B42318", fontWeight: 700 }}>Not mapped</span>}</td>
                      <td style={{ padding: "11px 12px" }}>
                        <span style={chipStyle(tone, { height: 21, fontSize: 10 })}>
                          <HIcon name={statusIcon[r.status]} size={12} />
                          <span>{label}</span>
                        </span>
                      </td>
                      <td style={{ padding: "11px 18px 11px 12px", textAlign: "right" }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (r.status === "failed") sync.mutate([r.id]);
                            else openPanel({ type: "accounting-record", id: r.id });
                          }}
                          style={r.status === "failed" ? greenBtn : ghostBtn}
                        >
                          {r.status === "failed" ? "Retry" : "View"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <TableFootnote>A transaction with no accounting reference has not posted. Noxtill never marks a record as synced before the provider confirms it. Only completed sales are posted — expenses, refunds and payments are not sent to {name}.</TableFootnote>
      </div>
      {tx.error ? <CardEmpty icon="circle-alert" title="Transactions could not be loaded" text={errorMessage(tx.error)} /> : null}
    </div>
  );
}

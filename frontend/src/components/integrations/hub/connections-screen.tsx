"use client";

import { ErrorCard, KpiSkeletons, thStyle } from "@/components/reports/reports-ui";
import type { HubProvider } from "@/lib/integrations-hub-api";
import { EmptyRow, HIcon, LogoTile, R, StatusChip, TableFootnote, card, chipStyle, dirIcon, errorMessage, greenBtn, ghostBtn, recordsLabel, statusMeta, whenLabel } from "./hub-ui";
import { useHubActions, useHubOverview } from "./use-hub";
import { useIntegrations } from "./integrations-store";

function KpiCard({ label, value, meta, tone = "neutral", onClick }: { label: string; value: string | number; meta: string; tone?: "neutral" | "green" | "amber" | "red"; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ background: "#fff", borderRadius: 12, padding: "14px 15px", cursor: "pointer", textAlign: "left", font: "inherit", boxShadow: "0 1px 2px rgba(16,24,40,.04)", border: `1px solid ${tone === "red" ? "#FBD5D2" : tone === "amber" ? "#FDE49B" : R.border}` }}
    >
      <div style={{ fontSize: 11.5, fontWeight: 700, color: R.muted }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-.03em", marginTop: 7, fontVariantNumeric: "tabular-nums", color: tone === "red" ? "#B42318" : tone === "amber" ? "#B45309" : R.ink }}>{value}</div>
      <div style={{ fontSize: 10.5, color: R.faint, marginTop: 4 }}>{meta}</div>
    </button>
  );
}

function tokenChip(p: HubProvider) {
  if (p.token.state === "not_applicable") return <span style={{ fontSize: 11.5, color: R.faint }}>—</span>;
  const tone = p.token.state === "valid" ? "green" : p.token.state === "expiring" ? "amber" : "red";
  // A healthy token reads simply "Valid" (its renewal detail is in the tooltip and the drawer).
  return (
    <span title={p.token.label} style={chipStyle(tone, { height: 20, fontSize: 9.5 })}>
      {p.token.state === "valid" ? "Valid" : p.token.label}
    </span>
  );
}

export function ConnectionsScreen() {
  const { data, isLoading, error, refetch } = useHubOverview();
  const { openDrawer, notify } = useIntegrations();
  const { startConnect, resume } = useHubActions();

  if (error) return <ErrorCard message={errorMessage(error)} onRetry={() => void refetch()} />;
  if (isLoading || !data) return <KpiSkeletons count={5} />;

  const live = data.providers.filter((p) => p.status !== "not_connected");
  const h = data.health;
  const categories = new Set(live.map((p) => p.category)).size;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <KpiCard label="Connected" value={h.connected} meta={`across ${categories} categor${categories === 1 ? "y" : "ies"}`} onClick={() => notify("Connected", `${h.connected} integrations are connected.`)} />
        <KpiCard label="Healthy" value={h.healthy} meta="syncing normally" tone="green" onClick={() => notify("Healthy", `${h.healthy} of ${h.connected} connections are syncing normally.`)} />
        <KpiCard label="Needs attention" value={h.needsAttention} meta="auth or sync failing" tone={h.needsAttention ? "amber" : "neutral"} onClick={() => useIntegrations.getState().openPanel({ type: "health" })} />
        <KpiCard label="Paused" value={h.paused} meta="by owner, not a fault" onClick={() => notify("Paused", "A paused connection is reported as paused, not as an error.")} />
        <KpiCard label="Sync errors today" value={h.syncErrorsToday} meta={h.syncErrorsToday ? `across ${h.syncErrorsAcrossConnections} connection${h.syncErrorsAcrossConnections === 1 ? "" : "s"}` : "none so far today"} tone={h.syncErrorsToday ? "red" : "neutral"} onClick={() => notify("Sync errors today", "Failed sync attempts since midnight in your business timezone.")} />
      </div>

      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ padding: "15px 18px", borderBottom: `1px solid ${R.divider}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Live connections</div>
          <div style={{ fontSize: 11, color: R.faint }}>Last attempted and last successful are shown separately</div>
        </div>
        <div style={{ overflowX: "auto" }} className="nx-scroll">
          <table style={{ width: "100%", minWidth: 1180, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#FAFBFC", borderBottom: `1px solid ${R.border}` }}>
                <th style={thStyle("left")}>Integration</th>
                <th style={thStyle("left")}>Category</th>
                <th style={thStyle("left")}>Direction</th>
                <th style={thStyle("left")}>Records</th>
                <th style={thStyle("left")}>Last attempted</th>
                <th style={thStyle("left")}>Last successful</th>
                <th style={thStyle("center")}>Errors</th>
                <th style={thStyle("left")}>Token</th>
                <th style={thStyle("left")}>Status</th>
                <th style={thStyle("right")}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {live.length === 0 ? (
                <EmptyRow colSpan={10}>No integration is connected yet. Connect one from the Directory.</EmptyRow>
              ) : (
                live.map((p) => {
                  const meta = statusMeta(p);
                  const needsAttention = p.status === "needs_attention";
                  const actionLabel = needsAttention ? "Reconnect" : p.status === "paused" ? "Resume" : "Manage";
                  // Red only when the connection is genuinely trying and failing to sync.
                  const failing = p.attention.some((a) => a.code === "sync_failing");
                  const syncApplies = p.canSync || p.lastAttemptAt !== null;
                  return (
                    <tr
                      key={p.key}
                      onClick={() => openDrawer(p.key)}
                      style={{ borderBottom: `1px solid ${R.rowLine}`, cursor: "pointer", background: meta.tone === "red" ? "#FEFBFB" : meta.tone === "amber" ? "#FFFDF5" : "#fff" }}
                    >
                      <td style={{ padding: "11px 12px 11px 18px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                          <LogoTile initials={p.initials} tone={meta.tone} size={28} radius={8} fontSize={10} />
                          <div style={{ fontSize: 12.5, fontWeight: 700 }}>{p.name}</div>
                        </div>
                      </td>
                      <td style={{ padding: "11px 12px", fontSize: 12, color: R.text }}>{p.category}</td>
                      <td style={{ padding: "11px 12px" }}>
                        <span style={chipStyle("blue", { height: 21, fontSize: 10 })}>
                          <HIcon name={dirIcon(p.direction)} size={11} />
                          <span>{p.direction}</span>
                        </span>
                      </td>
                      <td style={{ padding: "11px 12px", fontSize: 11.5, color: R.text, fontVariantNumeric: "tabular-nums" }}>{recordsLabel(p) ?? "Not tracked"}</td>
                      <td style={{ padding: "11px 12px", fontSize: 11.5, color: R.faint }}>{syncApplies ? whenLabel(p.lastAttemptAt, "No sync yet") : "—"}</td>
                      <td style={{ padding: "11px 12px" }}>
                        <span style={{ fontSize: 11.5, fontWeight: failing ? 800 : 500, color: failing ? "#B42318" : R.faint }}>{syncApplies ? whenLabel(p.lastSuccessAt, "Never") : "—"}</span>
                      </td>
                      <td style={{ padding: "11px 12px", textAlign: "center" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", padding: "0 7px", height: 20, borderRadius: 6, fontSize: 11, fontWeight: 800, fontVariantNumeric: "tabular-nums", background: p.errorsToday > 0 ? "#FEF3F2" : "transparent", color: p.errorsToday > 0 ? "#B42318" : R.label }}>{p.errorsToday}</span>
                      </td>
                      <td style={{ padding: "11px 12px" }}>{tokenChip(p)}</td>
                      <td style={{ padding: "11px 12px" }}>
                        <StatusChip meta={meta} />
                      </td>
                      <td style={{ padding: "11px 18px 11px 12px", textAlign: "right" }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (needsAttention) return startConnect(p);
                            if (p.status === "paused") return void resume(p);
                            openDrawer(p.key);
                          }}
                          style={needsAttention ? greenBtn : ghostBtn}
                        >
                          {actionLabel}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <TableFootnote>Where last attempted and last successful differ, the connection is trying and failing. A single sync timestamp would hide exactly that.</TableFootnote>
      </div>
    </div>
  );
}

"use client";

import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ErrorCard, KpiSkeletons, thStyle } from "@/components/reports/reports-ui";
import { HUB_KEYS, fetchApiScopes, fetchDeveloperOverview, retryDelivery, revokeApiKey, testDeveloperWebhook } from "@/lib/integrations-hub-api";
import { EmptyRow, HIcon, Legend, R, Sparkline, StackedBars, TableFootnote, card, chipStyle, errorMessage, ghostBtn, greenBtn, shortStamp, whenLabel } from "./hub-ui";
import { useIntegrations } from "./integrations-store";
import { useRefreshHub } from "./use-hub";

function Kpi({ label, value, meta, tone = "neutral" }: { label: string; value: string | number; meta: string; tone?: "neutral" | "green" | "amber" }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: "14px 15px", boxShadow: "0 1px 2px rgba(16,24,40,.04)", border: `1px solid ${tone === "amber" ? "#FDE49B" : R.border}` }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: R.muted }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-.03em", marginTop: 7, fontVariantNumeric: "tabular-nums", color: tone === "amber" ? "#B45309" : R.ink }}>{value}</div>
      <div style={{ fontSize: 10.5, color: R.faint, marginTop: 4 }}>{meta}</div>
    </div>
  );
}

export function deliveryTone(status: string): { tone: "green" | "amber" | "red" | "neutral"; label: string; icon: string } {
  if (status === "success") return { tone: "green", label: "Delivered", icon: "circle-check" };
  if (status === "failed") return { tone: "red", label: "Failed", icon: "circle-alert" };
  return { tone: "amber", label: "Retrying", icon: "refresh-cw" };
}

export function DeveloperScreen() {
  const overview = useQuery({ queryKey: HUB_KEYS.developer, queryFn: fetchDeveloperOverview });
  const scopes = useQuery({ queryKey: HUB_KEYS.scopes, queryFn: fetchApiScopes });
  const { openPanel, openConfirm, notify } = useIntegrations();
  const refresh = useRefreshHub();

  const scopeLabel = useMemo(() => new Map((scopes.data ?? []).map((s) => [s.key, s.label])), [scopes.data]);

  const test = useMutation({
    mutationFn: testDeveloperWebhook,
    onSuccess: () => {
      notify("Test event queued", "A signed payload marked test: true is on its way — your handler can ignore it.");
      refresh();
    },
    onError: (e) => notify("Could not send the test", errorMessage(e)),
  });
  const retry = useMutation({
    mutationFn: retryDelivery,
    onSuccess: () => {
      notify("Retry queued", "Same payload, sent again with the usual backoff.");
      refresh();
    },
    onError: (e) => notify("Could not retry", errorMessage(e)),
  });

  const o = overview.data;
  if (overview.error) return <ErrorCard message={errorMessage(overview.error)} onRetry={() => void overview.refetch()} />;
  if (!o) return <KpiSkeletons count={5} />;
  const k = o.kpis;

  const scopesText = (list: string[]) => {
    if (list.length === 0) return "No scopes";
    const labels = list.slice(0, 2).map((s) => scopeLabel.get(s) ?? s);
    return `${labels.join(" · ")}${list.length > 2 ? ` · +${list.length - 2} more` : ""}`;
  };

  const askRevoke = (id: string) => {
    const key = o.keys.find((x) => x.id === id);
    if (!key) return;
    openConfirm({
      title: `Revoke ${key.name}?`,
      tone: "red",
      icon: "key-round",
      body: "This takes effect immediately. Anything using this key stops working at once — there is no grace period.",
      rows: [
        { label: "Key", value: `${key.prefix}••••••••` },
        { label: "Scopes", value: scopesText(key.scopes) },
        { label: "Last used", value: key.lastUsedAt ? whenLabel(key.lastUsedAt) : "Never used" },
        { label: "Requests this month", value: key.requestsMonth.toLocaleString("en-US") },
        { label: "Effect", value: "Immediate · no grace period", tone: "neg" },
        { label: "Reversible", value: "No · generate a new key instead", tone: "neg" },
      ],
      primary: "Revoke key",
      cancel: "Keep active",
      onConfirm: async () => {
        try {
          await revokeApiKey(id);
          notify("Key revoked", "Recorded in the audit trail with your name.");
        } catch (e) {
          notify("Could not revoke", errorMessage(e));
        } finally {
          refresh();
          useIntegrations.setState({ confirm: null });
        }
      },
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 12 }}>
        <Kpi label="API keys" value={k.activeKeys} meta={`${k.totalKeys} in total${k.totalKeys > k.activeKeys ? ` · ${k.totalKeys - k.activeKeys} revoked` : ""}`} />
        <Kpi label="Requests this month" value={k.requestsMonth.toLocaleString("en-US")} meta="across every key" />
        <Kpi label="Rate limit" value={`${k.headroomPct}%`} meta={`headroom this hour · ${o.hourlyLimit.toLocaleString("en-US")} per key`} tone="green" />
        <Kpi label="Webhook deliveries" value={k.deliveriesMonth.toLocaleString("en-US")} meta="this month" />
        <Kpi label="Failed deliveries" value={k.failedDeliveriesMonth} meta={k.deliveriesMonth ? `${k.failedPct}% of deliveries` : "no deliveries yet"} tone={k.failedDeliveriesMonth ? "amber" : "neutral"} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 18, alignItems: "start" }}>
        <div style={{ ...card, minWidth: 0, padding: 17 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>API usage</div>
            <div style={{ marginLeft: "auto", fontSize: 11, color: R.faint }}>Requests per day · 14 days</div>
          </div>
          <Sparkline values={o.days.map((d) => d.requests)} />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${R.divider}`, flexWrap: "wrap" }}>
            <div style={{ fontSize: 11, color: R.faint }}>{k.requestsMonth.toLocaleString("en-US")} requests this month</div>
            <button type="button" onClick={() => openPanel({ type: "rate-limit" })} style={{ ...ghostBtn, marginLeft: "auto" }}>
              Rate limits
            </button>
          </div>
        </div>

        <div style={{ ...card, minWidth: 0, padding: 17 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Webhook success rate</div>
            <div style={{ marginLeft: "auto" }}>
              <span style={chipStyle(k.deliveredPct14d === null ? "neutral" : k.deliveredPct14d >= 95 ? "green" : "amber", { height: 22, fontSize: 10.5 })}>{k.deliveredPct14d === null ? "No deliveries yet" : `${k.deliveredPct14d}% delivered`}</span>
            </div>
          </div>
          <StackedBars
            data={o.days.map((d) => ({ label: d.label, ok: d.ok, top: d.failed }))}
            okColor="#16A34A"
            topColor="#DC2626"
            onClick={(i) => notify(o.days[i].day, `${o.days[i].ok} delivered · ${o.days[i].failed} failed.`)}
          />
          <div style={{ marginTop: 10 }}>
            <Legend items={[{ color: "#16A34A", label: "Delivered" }, { color: "#DC2626", label: "Failed" }]} />
          </div>
        </div>
      </div>

      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${R.divider}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <HIcon name="key-round" size={15} style={{ color: R.text }} />
          <div style={{ fontSize: 14, fontWeight: 800 }}>API keys</div>
          <button type="button" onClick={() => openPanel({ type: "generate-key" })} style={{ ...greenBtn, marginLeft: "auto", height: 32, borderRadius: 9, gap: 6 }}>
            <HIcon name="plus" size={13} />
            <span style={{ marginLeft: 6 }}>Generate key</span>
          </button>
        </div>
        <div style={{ overflowX: "auto" }} className="nx-scroll">
          <table style={{ width: "100%", minWidth: 980, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#FAFBFC", borderBottom: `1px solid ${R.border}` }}>
                <th style={thStyle("left")}>Name</th>
                <th style={thStyle("left")}>Key</th>
                <th style={thStyle("left")}>Scopes</th>
                <th style={thStyle("left")}>Created</th>
                <th style={thStyle("left")}>Last used</th>
                <th style={thStyle("left")}>Status</th>
                <th style={thStyle("right")}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {o.keys.length === 0 ? (
                <EmptyRow colSpan={7}>No API keys yet. Generate one to build directly against Noxtill.</EmptyRow>
              ) : (
                o.keys.map((key) => {
                  const revoked = !!key.revokedAt;
                  const never = !revoked && !key.lastUsedAt;
                  return (
                    <tr key={key.id} onClick={() => openPanel({ type: "api-key", id: key.id })} style={{ borderBottom: `1px solid ${R.rowLine}`, cursor: "pointer", background: revoked ? "#FCFCFD" : never ? "#FFFDF5" : "#fff" }}>
                      <td style={{ padding: "11px 12px 11px 18px", fontSize: 12.5, fontWeight: 700 }}>{key.name}</td>
                      <td style={{ padding: "11px 12px", fontSize: 11.5, color: R.label, fontFamily: "'JetBrains Mono', monospace" }}>{key.prefix}••••••••</td>
                      <td style={{ padding: "11px 12px", fontSize: 11.5, color: R.text }}>{scopesText(key.scopes)}</td>
                      <td style={{ padding: "11px 12px", fontSize: 11.5, color: R.faint }}>{shortStamp(key.createdAt)}</td>
                      <td style={{ padding: "11px 12px", fontSize: 11.5, color: R.faint }}>{key.lastUsedAt ? whenLabel(key.lastUsedAt) : "Never used"}</td>
                      <td style={{ padding: "11px 12px" }}>
                        <span style={chipStyle(revoked ? "neutral" : never ? "amber" : "green", { height: 21, fontSize: 10 })}>{revoked ? "Revoked" : "Active"}</span>
                      </td>
                      <td style={{ padding: "11px 18px 11px 12px", textAlign: "right" }}>
                        {revoked ? (
                          <button type="button" onClick={(e) => { e.stopPropagation(); openPanel({ type: "api-key", id: key.id }); }} style={ghostBtn}>View</button>
                        ) : (
                          <button type="button" onClick={(e) => { e.stopPropagation(); askRevoke(key.id); }} style={{ height: 30, display: "inline-flex", alignItems: "center", padding: "0 10px", borderRadius: 8, border: "1px solid #FBD5D2", background: "#fff", color: "#B42318", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <TableFootnote>A key&apos;s secret is shown once at creation and never again. If it is lost, rotate the key rather than trying to recover it.</TableFootnote>
      </div>

      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${R.divider}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <HIcon name="webhook" size={15} style={{ color: R.text }} />
          <div style={{ fontSize: 14, fontWeight: 800 }}>Outbound webhooks</div>
          <button type="button" onClick={() => openPanel({ type: "webhook-add" })} style={{ ...ghostBtn, marginLeft: "auto", height: 32, borderRadius: 9, gap: 6 }}>
            <HIcon name="plus" size={13} />
            <span>Add webhook</span>
          </button>
        </div>
        <div style={{ overflowX: "auto" }} className="nx-scroll">
          <table style={{ width: "100%", minWidth: 1060, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#FAFBFC", borderBottom: `1px solid ${R.border}` }}>
                <th style={thStyle("left")}>Event</th>
                <th style={thStyle("left")}>Target URL</th>
                <th style={thStyle("center")}>Attempts</th>
                <th style={thStyle("center")}>Response</th>
                <th style={thStyle("left")}>Last delivery</th>
                <th style={thStyle("left")}>Status</th>
                <th style={thStyle("right")}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {o.webhooks.length === 0 ? (
                <EmptyRow colSpan={7}>No webhooks yet. Add one and Noxtill validates the endpoint before it goes live.</EmptyRow>
              ) : (
                o.webhooks.map((w) => {
                  const d = w.latest;
                  const t = d ? deliveryTone(d.status) : null;
                  const code = d?.responseStatus ? String(d.responseStatus) : d?.error ? "error" : "—";
                  const ok = code.startsWith("2");
                  return (
                    <tr key={w.id} onClick={() => openPanel({ type: "delivery", webhookId: w.id })} style={{ borderBottom: `1px solid ${R.rowLine}`, cursor: "pointer", background: t?.tone === "red" ? "#FEFBFB" : t?.tone === "amber" ? "#FFFDF5" : "#fff" }}>
                      <td style={{ padding: "11px 12px 11px 18px", fontSize: 12.5, fontWeight: 700 }}>{w.event}</td>
                      <td style={{ padding: "11px 12px", fontSize: 11, color: R.text, fontFamily: "'JetBrains Mono', monospace", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.targetUrl}</td>
                      <td style={{ padding: "11px 12px", textAlign: "center", fontSize: 11.5, fontVariantNumeric: "tabular-nums" }}>{d ? d.attempts : "—"}</td>
                      <td style={{ padding: "11px 12px", textAlign: "center" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", padding: "0 7px", height: 20, borderRadius: 6, fontSize: 11, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", background: ok ? "#ECFDF3" : code === "—" ? "transparent" : "#FEF3F2", color: ok ? "#15803D" : code === "—" ? R.faint : "#B42318" }}>{code}</span>
                      </td>
                      <td style={{ padding: "11px 12px", fontSize: 11.5, color: R.faint }}>{d?.lastAttemptAt ? whenLabel(d.lastAttemptAt) : "No deliveries yet"}</td>
                      <td style={{ padding: "11px 12px" }}>
                        {t ? (
                          <span style={chipStyle(t.tone, { height: 21, fontSize: 10 })}>
                            <HIcon name={t.icon} size={12} />
                            <span>{t.label}</span>
                          </span>
                        ) : (
                          <span style={chipStyle("neutral", { height: 21, fontSize: 10 })}>Validated</span>
                        )}
                      </td>
                      <td style={{ padding: "11px 18px 11px 12px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 6 }}>
                          <button type="button" onClick={(e) => { e.stopPropagation(); test.mutate(w.id); }} style={ghostBtn}>Test</button>
                          {d && d.status !== "success" ? (
                            <button type="button" onClick={(e) => { e.stopPropagation(); retry.mutate(d.id); }} style={greenBtn}>Retry</button>
                          ) : (
                            <button type="button" onClick={(e) => { e.stopPropagation(); openPanel({ type: "delivery", webhookId: w.id }); }} style={ghostBtn}>View</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "12px 18px", borderTop: `1px solid ${R.divider}`, background: "#FCFCFD", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 11, color: R.faint, lineHeight: 1.5, flex: 1, minWidth: 240 }}>Every delivery keeps its payload, response code and attempt count, so a failure is diagnosable rather than merely visible. Secrets never appear in a log.</div>
          <button type="button" onClick={() => notify("OpenAPI spec is not available", "Noxtill does not publish a generated OpenAPI document yet.")} style={{ ...ghostBtn, opacity: 0.6 }}>
            <HIcon name="file-down" size={13} />
            <span>OpenAPI spec · not available</span>
          </button>
        </div>
      </div>
    </div>
  );
}

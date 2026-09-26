"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CardEmpty, ErrorCard, KpiSkeletons, thStyle } from "@/components/reports/reports-ui";
import { HUB_KEYS, fetchEcommerceItems, fetchEcommerceOverview, setSourceOfTruth, syncEcommerce, type SourceOfTruth } from "@/lib/integrations-hub-api";
import { EmptyRow, HIcon, Legend, R, StackedBars, TableFootnote, card, chipStyle, errorMessage, ghostBtn, greenBtn, money, tableAction, timeStamp, whenLabel } from "./hub-ui";
import { useHubActions, useHubOverview, useRefreshHub, summarizeSync } from "./use-hub";
import { useIntegrations } from "./integrations-store";
import { useSession } from "@/lib/session";

const NAMES: Record<string, string> = { shopify: "Shopify", woocommerce: "WooCommerce" };

export const SOT_OPTIONS: Array<{ value: SourceOfTruth; label: string; icon: string; detail: (store: string) => string }> = [
  { value: "noxtill", label: "Noxtill is the source of truth", icon: "shield-check", detail: () => "Noxtill wins on conflict. Your POS and stock counts are pushed to the store." },
  { value: "store", label: "The store is the source of truth", icon: "shopping-bag", detail: (s) => `${s} wins on conflict. Useful when the store team owns stock counts.` },
  { value: "manual", label: "Two-way, conflicts queued", icon: "arrow-right-left", detail: () => "Neither wins automatically. Every difference comes to you and nothing is overwritten." },
];

function Kpi({ label, value, meta, tone = "neutral", long }: { label: string; value: string | number; meta: string; tone?: "neutral" | "green" | "amber" | "red"; long?: boolean }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: "14px 15px", boxShadow: "0 1px 2px rgba(16,24,40,.04)", border: `1px solid ${tone === "red" ? "#FBD5D2" : tone === "amber" ? "#FDE49B" : R.border}` }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: R.muted }}>{label}</div>
      <div style={{ fontSize: long ? 15 : 19, fontWeight: 800, letterSpacing: "-.03em", marginTop: 7, fontVariantNumeric: "tabular-nums", color: tone === "red" ? "#B42318" : tone === "amber" ? "#B45309" : R.ink }}>{value}</div>
      <div style={{ fontSize: 10.5, color: R.faint, marginTop: 4 }}>{meta}</div>
    </div>
  );
}

export function EcommerceScreen() {
  const overview = useQuery({ queryKey: HUB_KEYS.ecommerce, queryFn: fetchEcommerceOverview });
  const items = useQuery({ queryKey: HUB_KEYS.ecommerceItems, queryFn: fetchEcommerceItems });
  const hub = useHubOverview();
  const session = useSession();
  const { openPanel, openConfirm, notify } = useIntegrations();
  const { startConnect, pause, resume } = useHubActions();
  const refresh = useRefreshHub();
  const [providerKey, setProviderKey] = useState<string | null>(null);

  const sync = useMutation({
    mutationFn: syncEcommerce,
    onSuccess: (r) => {
      notify("Sync finished", summarizeSync(r));
      refresh();
    },
    onError: (e) => notify("Sync did not run", errorMessage(e)),
  });

  const o = overview.data;
  const active = useMemo(() => o?.connections.find((c) => c.provider === providerKey) ?? o?.connections[0], [o, providerKey]);

  if (overview.error) return <ErrorCard message={errorMessage(overview.error)} onRetry={() => void overview.refetch()} />;
  if (!o) return <KpiSkeletons count={5} />;

  if (!o.connected || !active) {
    const stores = (hub.data?.providers ?? []).filter((p) => p.category === "E-commerce");
    return (
      <div style={{ ...card, padding: "40px 24px", textAlign: "center" }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: "#F1F3F6", color: R.label, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
          <HIcon name="shopping-bag" size={21} />
        </div>
        <div style={{ fontSize: 15, fontWeight: 800 }}>No online store is connected</div>
        <div style={{ fontSize: 12.5, color: R.muted, marginTop: 6, maxWidth: "60ch", marginInline: "auto", lineHeight: 1.6 }}>
          Connect Shopify or WooCommerce and online orders arrive in Noxtill as orders, while stock is reconciled by SKU with the source of truth you choose. Nothing is overwritten unless that setting says so.
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
          {stores.map((p) => (
            <button key={p.key} type="button" onClick={() => startConnect(p)} style={tableAction(true)}>
              Connect {p.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const storeName = NAMES[active.provider] ?? active.provider;
  const pending = o.kpis.pendingConflicts;
  const card2 = hub.data?.providers.find((p) => p.key === active.provider);
  const currency = session.business.currency;

  const chooseSot = (value: SourceOfTruth) => {
    if (value === active.sourceOfTruth) return notify("Already active", SOT_OPTIONS.find((s) => s.value === value)?.label);
    const current = SOT_OPTIONS.find((s) => s.value === active.sourceOfTruth)?.label ?? active.sourceOfTruth;
    const next = SOT_OPTIONS.find((s) => s.value === value)?.label ?? value;
    openConfirm({
      title: "Change the source of truth?",
      tone: "red",
      icon: "shield-alert",
      body: "This decides which system wins whenever Noxtill and the store hold different stock for the same product. It applies from the next sync — nothing changes immediately.",
      rows: [
        { label: "Connection", value: storeName },
        { label: "Current", value: current },
        { label: "New", value: next },
        { label: "Fields affected", value: "Stock on hand" },
        { label: "Conflicts already waiting", value: pending ? `${pending} · still need a decision` : "None", tone: pending ? "neg" : "pos" },
        { label: "Applied at", value: "Next sync, not immediately" },
      ],
      primary: "Change source of truth",
      cancel: "Cancel",
      onConfirm: async () => {
        try {
          await setSourceOfTruth(active.provider, value);
          notify("Source of truth changed", `${next}. Recorded in the audit trail.`);
        } catch (e) {
          notify("Could not change it", errorMessage(e));
        } finally {
          refresh();
          useIntegrations.setState({ confirm: null });
        }
      },
    });
  };

  const rows = [
    ...(items.data?.conflicts ?? []).map((c) => ({ kind: "conflict" as const, at: c.detectedAt, c })),
    ...(items.data?.orders ?? []).map((ord) => ({ kind: "order" as const, at: ord.at, ord })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <Kpi label="Products reconciled" value={o.kpis.productsKnown ? o.kpis.productsReconciled.toLocaleString("en-US") : "Not tracked yet"} meta={o.kpis.productsKnown ? "matched by SKU in the last sync" : "appears after the first sync"} long={!o.kpis.productsKnown} />
        <Kpi label="Orders imported" value={o.kpis.ordersImportedMonth.toLocaleString("en-US")} meta={`this month · ${o.kpis.ordersImportedTotal.toLocaleString("en-US")} in total`} />
        <Kpi label="Stock conflicts" value={pending} meta={pending ? "awaiting your decision" : "none waiting"} tone={pending ? "amber" : "neutral"} />
        <Kpi label="Last sync" value={o.kpis.lastSyncAt ? whenLabel(o.kpis.lastSyncAt) : "Never"} meta={active.lastAttemptOk === false ? "the latest attempt failed" : o.kpis.lastSyncAt ? "succeeded" : "no sync yet"} tone={active.lastAttemptOk === false ? "red" : o.kpis.lastSyncAt ? "green" : "neutral"} long />
        <Kpi label="Sync trigger" value="On demand" meta="run Sync now below" long />
      </div>

      {pending > 0 ? (
        <div style={{ ...card, borderColor: "#FDE49B", padding: "15px 17px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ width: 30, height: 30, flex: "0 0 30px", borderRadius: 9, background: "#FFFBEB", color: "#B45309", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <HIcon name="git-compare" size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>{pending} stock conflict{pending === 1 ? " is" : "s are"} waiting for your decision</div>
            <div style={{ fontSize: 11.5, color: R.muted, marginTop: 3, textWrap: "pretty" }}>Noxtill and {storeName} hold different stock for these products. Nothing has been overwritten — both sides are unchanged until you choose.</div>
          </div>
          <button type="button" onClick={() => openPanel({ type: "conflict" })} style={{ ...greenBtn, height: 34, padding: "0 12px", borderRadius: 10, fontSize: 12.5, gap: 6 }}>
            <HIcon name="git-compare" size={14} />
            <span style={{ marginLeft: 6 }}>Resolve conflicts</span>
          </button>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 18, alignItems: "start" }}>
        <div style={{ ...card, minWidth: 0, padding: 17 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Orders by channel</div>
            <Legend items={[{ color: "#16A34A", label: "In-store" }, { color: "#2563EB", label: "Online" }]} />
          </div>
          <StackedBars
            gap={8}
            data={o.channelBars.map((b) => ({ label: b.label, ok: b.inStore, top: b.online }))}
            okColor="#16A34A"
            topColor="#2563EB"
            onClick={(i) => notify(o.channelBars[i].label, `${o.channelBars[i].inStore} in-store · ${o.channelBars[i].online} online orders (completed).`)}
          />
          <div style={{ fontSize: 11, color: R.faint, marginTop: 13, paddingTop: 12, borderTop: `1px solid ${R.divider}`, lineHeight: 1.5 }}>An online order becomes one Noxtill order — deduplicated by the store reference — so it is never counted twice in orders, profit or reports.</div>
        </div>

        <div style={{ ...card, minWidth: 0, padding: 17 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800 }}>Source of truth</div>
            <div style={{ marginLeft: "auto" }}>
              <span style={chipStyle("blue", { height: 22, fontSize: 10.5 })}>Per connection</span>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: R.label, marginTop: 5, lineHeight: 1.5 }}>Which system wins when both change the same stock. It is set per connection and applies from the next sync.</div>
          {o.connections.length > 1 ? (
            <div style={{ display: "flex", gap: 6, marginTop: 11 }}>
              {o.connections.map((c) => (
                <button key={c.provider} type="button" onClick={() => setProviderKey(c.provider)} style={{ ...chipStyle(c.provider === active.provider ? "green" : "neutral", { height: 24, fontSize: 11 }), cursor: "pointer" }}>
                  {NAMES[c.provider]}
                </button>
              ))}
            </div>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 13 }}>
            {SOT_OPTIONS.map((s) => {
              const on = active.sourceOfTruth === s.value;
              return (
                <div key={s.value} onClick={() => chooseSot(s.value)} style={{ border: `1px solid ${on ? R.greenLine : R.divider}`, borderRadius: 11, padding: 12, cursor: "pointer", background: on ? "#F9FEFB" : "#fff" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <HIcon name={s.icon} size={15} style={{ color: on ? "#15803D" : R.label }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700 }}>{s.label.replace("The store", storeName)}</div>
                      <div style={{ fontSize: 10.5, color: R.faint, marginTop: 2, lineHeight: 1.4 }}>{s.detail(storeName)}</div>
                    </div>
                    {on ? <span style={chipStyle("green", { height: 19, fontSize: 9 })}>Active</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Product and order sync</div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 7, flexWrap: "wrap" }}>
            <button type="button" onClick={() => sync.mutate()} disabled={sync.isPending || active.paused} style={tableAction(true, active.paused)}>
              {sync.isPending ? "Syncing…" : "Sync now"}
            </button>
            <button type="button" onClick={() => openPanel({ type: "conflict" })} disabled={pending === 0} style={tableAction(false, pending === 0)}>
              Resolve {pending} conflict{pending === 1 ? "" : "s"}
            </button>
            <button type="button" onClick={() => openPanel({ type: "source-of-truth" })} style={tableAction(false)}>
              Configure direction
            </button>
            <button
              type="button"
              onClick={() => {
                if (!card2) return;
                if (active.paused) void resume(card2);
                else pause(card2);
              }}
              style={tableAction(false)}
            >
              {active.paused ? "Resume sync" : "Pause sync"}
            </button>
          </div>
        </div>
        <div style={{ overflowX: "auto" }} className="nx-scroll">
          <table style={{ width: "100%", minWidth: 1120, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#FAFBFC", borderTop: `1px solid ${R.divider}`, borderBottom: `1px solid ${R.border}` }}>
                <th style={thStyle("left")}>Type</th>
                <th style={thStyle("left")}>Item</th>
                <th style={thStyle("left")}>Store reference</th>
                <th style={thStyle("left")}>Noxtill reference</th>
                <th style={thStyle("left")}>Direction</th>
                <th style={thStyle("left")}>Sync status</th>
                <th style={thStyle("left")}>Conflict</th>
                <th style={thStyle("right")}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.isLoading ? (
                <EmptyRow colSpan={8}>Loading…</EmptyRow>
              ) : rows.length === 0 ? (
                <EmptyRow colSpan={8}>Nothing has synced yet. Run Sync now — imported orders and stock differences appear here.</EmptyRow>
              ) : (
                rows.map((r) =>
                  r.kind === "order" ? (
                    <tr key={`o-${r.ord.id}`} onClick={() => openPanel({ type: "ecom-order", id: r.ord.id })} style={{ borderBottom: `1px solid ${R.rowLine}`, cursor: "pointer" }}>
                      <td style={{ padding: "11px 12px 11px 18px" }}><span style={chipStyle("blue", { height: 20, fontSize: 9.5 })}>Order</span></td>
                      <td style={{ padding: "11px 12px", fontSize: 12.5, fontWeight: 700 }}>#{r.ord.orderNo} · {money(r.ord.total, currency)}</td>
                      <td style={{ padding: "11px 12px", fontSize: 11.5, color: R.text, fontFamily: "'JetBrains Mono', monospace" }}>{r.ord.storeRef ?? "—"}</td>
                      <td style={{ padding: "11px 12px", fontSize: 11.5, color: R.text, fontFamily: "'JetBrains Mono', monospace" }}>#{r.ord.orderNo}</td>
                      <td style={{ padding: "11px 12px" }}><span style={chipStyle("neutral", { height: 20, fontSize: 9.5 })}><HIcon name="arrow-down-left" size={11} /><span>Inbound</span></span></td>
                      <td style={{ padding: "11px 12px" }}><span style={chipStyle("green", { height: 21, fontSize: 10 })}><HIcon name="circle-check" size={12} /><span>Imported</span></span></td>
                      <td style={{ padding: "11px 12px" }} />
                      <td style={{ padding: "11px 18px 11px 12px", textAlign: "right" }}>
                        <button type="button" onClick={(e) => { e.stopPropagation(); openPanel({ type: "ecom-order", id: r.ord.id }); }} style={ghostBtn}>View</button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={`c-${r.c.id}`} onClick={() => openPanel({ type: "conflict", id: r.c.id })} style={{ borderBottom: `1px solid ${R.rowLine}`, cursor: "pointer", background: r.c.status === "pending" ? "#FFFDF5" : "#fff" }}>
                      <td style={{ padding: "11px 12px 11px 18px" }}><span style={chipStyle("neutral", { height: 20, fontSize: 9.5 })}>Product</span></td>
                      <td style={{ padding: "11px 12px", fontSize: 12.5, fontWeight: 700 }}>{r.c.productName ?? r.c.sku}</td>
                      <td style={{ padding: "11px 12px", fontSize: 11.5, color: R.text, fontFamily: "'JetBrains Mono', monospace" }}>{r.c.sku}</td>
                      <td style={{ padding: "11px 12px", fontSize: 11.5, color: R.text, fontFamily: "'JetBrains Mono', monospace" }}>{r.c.sku}</td>
                      <td style={{ padding: "11px 12px" }}><span style={chipStyle("neutral", { height: 20, fontSize: 9.5 })}><HIcon name="arrow-right-left" size={11} /><span>Two-way</span></span></td>
                      <td style={{ padding: "11px 12px" }}>
                        <span style={chipStyle(r.c.status === "pending" ? "amber" : "green", { height: 21, fontSize: 10 })}>
                          <HIcon name={r.c.status === "pending" ? "git-compare" : "circle-check"} size={12} />
                          <span>{r.c.status === "pending" ? "Conflict" : "Resolved"}</span>
                        </span>
                      </td>
                      <td style={{ padding: "11px 12px" }}>
                        <span style={chipStyle("amber", { height: 20, fontSize: 9.5 })}><HIcon name="git-compare" size={11} /><span>Stock {r.c.localQty} vs {r.c.remoteQty}</span></span>
                      </td>
                      <td style={{ padding: "11px 18px 11px 12px", textAlign: "right" }}>
                        <button type="button" onClick={(e) => { e.stopPropagation(); openPanel({ type: "conflict", id: r.c.id }); }} style={r.c.status === "pending" ? greenBtn : ghostBtn}>
                          {r.c.status === "pending" ? "Resolve" : "View"}
                        </button>
                      </td>
                    </tr>
                  ),
                )
              )}
            </tbody>
          </table>
        </div>
        <TableFootnote>A conflicting record is left untouched on both sides until you decide. Only stock is synced — prices, names and customers are not — so a conflict here is always a stock difference. Last synced {active.lastSyncAt ? timeStamp(active.lastSyncAt) : "never"}.</TableFootnote>
      </div>
      {items.error ? <CardEmpty icon="circle-alert" title="Sync items could not be loaded" text={errorMessage(items.error)} /> : null}
    </div>
  );
}

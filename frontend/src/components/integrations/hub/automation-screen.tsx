"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ErrorCard, KpiSkeletons } from "@/components/reports/reports-ui";
import { HUB_KEYS, fetchApiScopes, fetchAutomationOverview } from "@/lib/integrations-hub-api";
import { HIcon, LogoTile, R, card, chipStyle, errorMessage, ghostBtn, whenLabel } from "./hub-ui";
import { useIntegrations } from "./integrations-store";

function Kpi({ label, value, meta, tone = "neutral" }: { label: string; value: string | number; meta: string; tone?: "neutral" | "amber" }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: "14px 15px", boxShadow: "0 1px 2px rgba(16,24,40,.04)", border: `1px solid ${tone === "amber" ? "#FDE49B" : R.border}` }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: R.muted }}>{label}</div>
      <div style={{ fontSize: typeof value === "string" && value.length > 10 ? 15 : 19, fontWeight: 800, letterSpacing: "-.03em", marginTop: 7, fontVariantNumeric: "tabular-nums", color: tone === "amber" ? "#B45309" : R.ink }}>{value}</div>
      <div style={{ fontSize: 10.5, color: R.faint, marginTop: 4 }}>{meta}</div>
    </div>
  );
}

/** Ready-made subscriptions: each pre-selects a real trigger in the subscribe form — nothing is created until it is saved. */
const RECIPES: Array<{ label: string; icon: string; trigger: string }> = [
  { label: "New sale → your automation platform", icon: "shopping-cart", trigger: "sale" },
  { label: "Booking completed → follow-up workflow", icon: "calendar-check", trigger: "booking_completed" },
  { label: "Low stock → team notification", icon: "boxes", trigger: "low_stock" },
  { label: "Credit overdue → payment reminder", icon: "credit-card", trigger: "credit_overdue" },
  { label: "New review → marketing workflow", icon: "star", trigger: "review" },
  { label: "Lapsed customer → win-back workflow", icon: "moon", trigger: "lapsed_customer" },
];

export function AutomationScreen() {
  const overview = useQuery({ queryKey: HUB_KEYS.automation, queryFn: fetchAutomationOverview });
  const scopes = useQuery({ queryKey: HUB_KEYS.scopes, queryFn: fetchApiScopes });
  const { openPanel, notify } = useIntegrations();
  const router = useRouter();

  const o = overview.data;
  if (overview.error) return <ErrorCard message={errorMessage(overview.error)} onRetry={() => void overview.refetch()} />;
  if (!o) return <KpiSkeletons count={4} min={165} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))", gap: 12 }}>
        <Kpi label="Active automations" value={o.kpis.activeAutomations} meta={`across ${o.kpis.platformsConnected} platform${o.kpis.platformsConnected === 1 ? "" : "s"}`} />
        <Kpi label="Triggers fired" value={o.kpis.triggersFiredMonth.toLocaleString("en-US")} meta="this month · events delivered" />
        <Kpi label="Actions performed" value="Not tracked" meta="calls into Noxtill are not attributed to an automation" />
        <Kpi label="Errors" value={o.kpis.failedDeliveriesMonth} meta="failed deliveries this month" tone={o.kpis.failedDeliveriesMonth ? "amber" : "neutral"} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 14 }}>
        {o.platforms.map((p) => (
          <div key={p.key} onClick={() => openPanel({ type: "subscribe", provider: p.key })} style={{ ...card, border: `1px solid ${p.connected ? R.greenLine : R.border}`, padding: 16, cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <LogoTile initials={p.initials} tone={p.connected ? "green" : "neutral"} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800 }}>{p.name}</div>
                <div style={{ fontSize: 10.5, color: R.label, marginTop: 2 }}>{p.benefit}</div>
              </div>
              <span style={chipStyle(p.connected ? "green" : "neutral", { height: 21, fontSize: 10 })}>{p.connected ? "Connected" : "Not connected"}</span>
            </div>
            {p.connected ? (
              <div style={{ fontSize: 11, color: R.muted, marginTop: 11, paddingTop: 10, borderTop: `1px solid ${R.rowLine}` }}>
                {p.automations} automation{p.automations === 1 ? "" : "s"} · {p.lastFiredAt ? `last fired ${whenLabel(p.lastFiredAt)}` : "not fired yet"}
              </div>
            ) : null}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openPanel({ type: "subscribe", provider: p.key });
              }}
              style={{ width: "100%", height: 32, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 12, borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: p.connected ? "#fff" : R.green, color: p.connected ? R.text : "#fff", border: `1px solid ${p.connected ? R.btnBorder : R.green}` }}
            >
              {p.connected ? "Manage" : "Connect"}
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", gap: 18, alignItems: "start" }}>
        <div style={{ ...card, minWidth: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 17px", borderBottom: `1px solid ${R.divider}`, display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
            <HIcon name="zap" size={15} style={{ color: "#B45309" }} />
            <div style={{ fontSize: 13.5, fontWeight: 800 }}>Available triggers</div>
            <div style={{ marginLeft: "auto", fontSize: 10.5, color: R.faint }}>Fired from real Noxtill events</div>
          </div>
          {o.triggers.map((t) => (
            <div key={t.key} onClick={() => openPanel({ type: "trigger", key: t.key })} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 17px", cursor: "pointer", borderTop: `1px solid ${R.rowLine}`, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 180px", minWidth: 150 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>{t.label}</div>
                <div style={{ fontSize: 10.5, color: R.label, marginTop: 3, lineHeight: 1.4 }}>{t.description}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", flexShrink: 0 }}>
                <span style={chipStyle(t.automations ? "green" : "neutral", { height: 20, fontSize: 9.5 })}>{t.automations ? `${t.automations} automation${t.automations === 1 ? "" : "s"}` : "Not used"}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openPanel({ type: "trigger", key: t.key });
                  }}
                  style={ghostBtn}
                >
                  Test
                </button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ ...card, overflow: "hidden" }}>
            <div style={{ padding: "14px 17px", borderBottom: `1px solid ${R.divider}`, display: "flex", alignItems: "center", gap: 9 }}>
              <HIcon name="play" size={15} style={{ color: "#15803D" }} />
              <div style={{ fontSize: 13.5, fontWeight: 800 }}>Available actions</div>
            </div>
            {(scopes.data ?? []).slice(0, 6).map((sc) => (
              <div key={sc.key} onClick={() => router.push("/integrations/developer")} style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 17px", cursor: "pointer", borderTop: `1px solid ${R.rowLine}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{sc.label}</div>
                  <div style={{ fontSize: 10.5, color: R.label, marginTop: 2, lineHeight: 1.4 }}>Callable through the REST API by a key holding this scope</div>
                </div>
                <span style={chipStyle("neutral", { height: 20, fontSize: 9.5, flexShrink: 0 })}>Scope</span>
              </div>
            ))}
            {(scopes.data?.length ?? 0) > 6 ? (
              <div onClick={() => router.push("/integrations/developer")} style={{ padding: "11px 17px", borderTop: `1px solid ${R.rowLine}`, fontSize: 11.5, color: "#15803D", fontWeight: 700, cursor: "pointer" }}>
                and {(scopes.data?.length ?? 0) - 6} more · see Developer
              </div>
            ) : null}
            <div style={{ padding: "11px 17px", borderTop: `1px solid ${R.divider}`, background: "#FCFCFD", fontSize: 11, color: R.faint, lineHeight: 1.5 }}>Automations call Noxtill through the REST API with a key. A key holds only the scopes you grant, and destructive or admin scopes can never be granted to any key.</div>
          </div>

          <div style={{ ...card, padding: "16px 17px" }}>
            <div style={{ fontSize: 13.5, fontWeight: 800 }}>Template gallery</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              {RECIPES.map((r) => (
                <div
                  key={r.label}
                  onClick={() => openPanel({ type: "subscribe", trigger: r.trigger })}
                  style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 11px", borderRadius: 10, border: `1px solid ${R.divider}`, cursor: "pointer" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#F7F8FA"; e.currentTarget.style.borderColor = R.green; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = R.divider; }}
                >
                  <HIcon name={r.icon} size={14} style={{ color: R.label }} />
                  <div style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 600, color: R.text, lineHeight: 1.4 }}>{r.label}</div>
                  <HIcon name="chevron-right" size={13} style={{ color: "#C3CAD4" }} />
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10.5, color: R.faint, marginTop: 11, lineHeight: 1.5 }} onClick={() => notify("How templates work", "A template selects the trigger for you. You paste the webhook URL your automation platform provides; nothing is created until you save.")}>
              A template only pre-selects the trigger — you add the webhook URL from your platform.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { dismissFinding, type AdvisorFinding, type HubProvider } from "@/lib/integrations-hub-api";
import { KpiSkeletons } from "@/components/reports/reports-ui";
import { CardEmpty, ErrorCard } from "@/components/reports/reports-ui";
import { DirChip, HIcon, LogoTile, R, StatusChip, card, chipStyle, errorMessage, isConnected, recordsLabel, stamp, statusMeta, whenLabel } from "./hub-ui";
import { useHubActions, useHubOverview, useRefreshHub } from "./use-hub";
import { useIntegrations } from "./integrations-store";

type StatusFilter = "All" | "Connected" | "Needs attention" | "Paused" | "Not connected";
type DirectionFilter = "All" | "Inbound" | "Outbound" | "Two-way";

const STATUS_OPTIONS: StatusFilter[] = ["All", "Connected", "Needs attention", "Paused", "Not connected"];
const DIRECTION_OPTIONS: DirectionFilter[] = ["All", "Inbound", "Outbound", "Two-way"];

function matchesStatus(p: HubProvider, f: StatusFilter): boolean {
  if (f === "All") return true;
  if (f === "Connected") return p.status === "connected";
  if (f === "Needs attention") return p.status === "needs_attention";
  if (f === "Paused") return p.status === "paused";
  return p.status === "not_connected";
}

function SummaryCards() {
  const { data } = useHubOverview();
  const router = useRouter();
  if (!data) return <KpiSkeletons count={4} min={200} />;
  const h = data.health;
  const cards: Array<{ label: string; value: number; meta: string; icon: string; tone: "green" | "amber" | "neutral" | "red"; to: string }> = [
    { label: "Connected", value: h.connected, meta: "Active connections", icon: "circle-check", tone: "green", to: "/integrations/connections" },
    { label: "Needs attention", value: h.needsAttention, meta: "Authentication or sync issues", icon: "triangle-alert", tone: "amber", to: "/integrations/connections" },
    { label: "Available", value: h.available, meta: "Ready to connect", icon: "plug-zap", tone: "neutral", to: "/integrations" },
    { label: "Sync errors today", value: h.syncErrorsToday, meta: h.syncErrorsToday ? `Across ${h.syncErrorsAcrossConnections} connection${h.syncErrorsAcrossConnections === 1 ? "" : "s"}` : "None so far today", icon: "circle-alert", tone: "red", to: "/integrations/connections" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 12 }}>
      {cards.map((c) => {
        const alert = c.value > 0 && (c.tone === "amber" || c.tone === "red");
        const iconColor = c.tone === "red" ? "#B42318" : c.tone === "amber" ? "#B45309" : c.tone === "green" ? "#15803D" : R.label;
        return (
          <button
            key={c.label}
            type="button"
            onClick={() => router.push(c.to)}
            style={{ background: "#fff", borderRadius: 12, padding: "14px 15px", cursor: "pointer", textAlign: "left", font: "inherit", boxShadow: "0 1px 2px rgba(16,24,40,.04)", border: `1px solid ${alert && c.tone === "red" ? "#FBD5D2" : alert && c.tone === "amber" ? "#FDE49B" : R.border}` }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <HIcon name={c.icon} size={15} style={{ color: iconColor }} />
              <div style={{ fontSize: 11.5, fontWeight: 700, color: R.muted }}>{c.label}</div>
            </div>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-.03em", marginTop: 7, fontVariantNumeric: "tabular-nums", color: alert && c.tone === "red" ? "#B42318" : alert && c.tone === "amber" ? "#B45309" : R.ink }}>{c.value}</div>
            <div style={{ fontSize: 10.5, color: R.faint, marginTop: 4 }}>{c.meta}</div>
          </button>
        );
      })}
    </div>
  );
}

function Advisor() {
  const { data, isLoading } = useHubOverview();
  const { openPanel, notify } = useIntegrations();
  const { startConnect } = useHubActions();
  const router = useRouter();
  const refresh = useRefreshHub();
  const dismiss = useMutation({
    mutationFn: (key: string) => dismissFinding(key),
    onSuccess: (r) => {
      notify("Dismissed", `Hidden until ${stamp(r.dismissedUntil)} — it returns then if the condition still holds.`);
      refresh();
    },
    onError: (e) => notify("Could not dismiss", errorMessage(e)),
  });

  const findings = data?.findings ?? [];
  const runPrimary = (f: AdvisorFinding) => {
    const provider = data?.providers.find((p) => p.key === f.providerKey);
    if (f.primaryAction.kind === "reconnect" && provider) return startConnect(provider);
    if (f.primaryAction.target.startsWith("provider:")) return useIntegrations.getState().openDrawer(f.primaryAction.target.slice(9));
    router.push(f.primaryAction.target);
  };

  return (
    <div style={{ ...card, borderColor: "#DDD3FE", padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ width: 28, height: 28, flex: "0 0 28px", borderRadius: 8, background: "#F5F3FF", color: "#6D28D9", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <HIcon name="sparkles" size={15} />
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 800 }}>Integration Advisor</div>
        <div style={{ marginLeft: "auto", fontSize: 10.5, color: R.faint }}>From actual connection state · {findings.length} finding{findings.length === 1 ? "" : "s"}</div>
      </div>
      {isLoading ? (
        <div style={{ marginTop: 14, fontSize: 12, color: R.muted }}>Reading your connections…</div>
      ) : findings.length === 0 ? (
        <div style={{ marginTop: 14, fontSize: 12.5, color: R.muted, lineHeight: 1.55 }}>
          {data && data.health.connected > 0
            ? "Nothing needs your attention. The Advisor reads the real state of every connection each time you open this page, and reports here the moment something breaks."
            : "No integration is connected yet, so there is nothing to advise on. Connect one from the directory below."}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 270px), 1fr))", gap: 11, marginTop: 14 }}>
          {findings.map((f) => {
            const red = f.severity === "critical";
            return (
              <div
                key={f.key}
                onClick={() => openPanel({ type: "finding", findingKey: f.key })}
                style={{ border: `1px solid ${red ? "#FBD5D2" : "#FDE49B"}`, borderRadius: 11, padding: 13, cursor: "pointer", background: red ? "#FEF3F2" : "#FFFBEB" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <HIcon name={f.icon} size={14} style={{ color: red ? "#B42318" : "#B45309" }} />
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: red ? "#B42318" : "#B45309" }}>{f.severity === "critical" ? "Critical" : f.severity === "high" ? "High" : "Medium"}</div>
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 8, lineHeight: 1.4, textWrap: "pretty" }}>{f.finding}</div>
                <div style={{ fontSize: 11, color: R.muted, marginTop: 5, lineHeight: 1.45 }}>{f.why}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      runPrimary(f);
                    }}
                    style={{ height: 28, display: "inline-flex", alignItems: "center", padding: "0 10px", borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", background: R.green, color: "#fff", border: `1px solid ${R.green}` }}
                  >
                    {f.primaryAction.label}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openPanel({ type: "finding", findingKey: f.key });
                    }}
                    style={{ height: 28, display: "inline-flex", alignItems: "center", padding: "0 10px", borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", background: "#fff", color: R.text, border: `1px solid ${R.btnBorder}` }}
                  >
                    Review
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      dismiss.mutate(f.key);
                    }}
                    style={{ height: 28, display: "inline-flex", alignItems: "center", padding: "0 10px", borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", background: "#fff", color: R.text, border: `1px solid ${R.btnBorder}` }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterMenu<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: T[]; onChange: (v: T) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const active = value !== options[0];
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{ height: 34, display: "flex", alignItems: "center", gap: 6, padding: "0 11px", borderRadius: 10, border: `1px solid ${active ? R.greenLine : R.btnBorder}`, background: active ? R.greenSoft : "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", color: active ? "#15803D" : R.ink }}
      >
        <HIcon name="filter" size={13} />
        <span>{active ? `${label}: ${value}` : label}</span>
      </button>
      {open ? (
        <div role="listbox" style={{ position: "absolute", right: 0, top: 40, zIndex: 40, minWidth: 170, background: "#fff", border: `1px solid ${R.border}`, borderRadius: 10, boxShadow: "0 14px 34px rgba(12,23,39,.14)", padding: 5 }}>
          {options.map((o) => (
            <button
              key={o}
              type="button"
              role="option"
              aria-selected={o === value}
              onClick={() => {
                onChange(o);
                setOpen(false);
              }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 7, border: 0, background: o === value ? R.greenSoft : "transparent", color: o === value ? "#15803D" : R.ink, fontSize: 12.5, fontWeight: o === value ? 700 : 600, cursor: "pointer" }}
            >
              {o}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProviderCard({ p }: { p: HubProvider }) {
  const { openDrawer, openPanel } = useIntegrations();
  const { primary } = useHubActions();
  const meta = statusMeta(p);
  const connected = isConnected(p);
  const rec = recordsLabel(p);
  const label = p.status === "connected" ? "Manage" : p.status === "needs_attention" ? "Reconnect" : p.status === "paused" ? "Resume" : "Connect";
  const border = meta.tone === "red" ? "#FBD5D2" : meta.tone === "amber" ? "#FDE49B" : R.border;
  return (
    <div
      onClick={() => openDrawer(p.key)}
      className="nx-provider-card"
      style={{ border: `1px solid ${border}`, borderRadius: 12, padding: 14, cursor: "pointer", background: "#fff", boxShadow: "0 1px 2px rgba(16,24,40,.04)", transition: "box-shadow 140ms, border-color 140ms" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = R.green;
        e.currentTarget.style.boxShadow = "0 6px 18px rgba(16,24,40,.09)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = border;
        e.currentTarget.style.boxShadow = "0 1px 2px rgba(16,24,40,.04)";
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
        <LogoTile initials={p.initials} tone={meta.tone} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.3, textWrap: "pretty" }}>{p.name}</div>
          <div style={{ fontSize: 10.5, color: R.label, marginTop: 3, lineHeight: 1.4 }}>{p.benefit}</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 11, flexWrap: "wrap" }}>
        <StatusChip meta={meta} />
        <DirChip direction={p.direction} />
        {!connected && p.setupRequired ? <span style={chipStyle("amber", { height: 21, fontSize: 10 })}>Setup required</span> : null}
      </div>
      {connected && rec ? (
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${R.rowLine}` }}>
          <HIcon name="refresh-cw" size={11} style={{ color: R.faint }} />
          <div style={{ fontSize: 10.5, color: R.muted, fontWeight: 600 }}>{rec}</div>
          <div style={{ marginLeft: "auto", fontSize: 10, color: R.faint }}>{p.syncMode === "event" ? "Event-driven" : whenLabel(p.lastSuccessAt, "No sync yet")}</div>
        </div>
      ) : null}
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 11 }}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            primary(p);
          }}
          style={{ flex: 1, height: 30, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", background: connected ? "#fff" : R.green, color: connected ? R.text : "#fff", border: `1px solid ${connected ? R.btnBorder : R.green}` }}
        >
          {label}
        </button>
        <button
          type="button"
          aria-label={`More about ${p.name}`}
          onClick={(e) => {
            e.stopPropagation();
            openPanel({ type: "provider-info", key: p.key });
          }}
          style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${R.btnBorder}`, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: R.label, cursor: "pointer", flexShrink: 0 }}
        >
          <HIcon name="more-horizontal" size={14} />
        </button>
      </div>
    </div>
  );
}

function DirectoryCard() {
  const { data, isLoading, error, refetch } = useHubOverview();
  const [category, setCategory] = useState("All");
  const [status, setStatus] = useState<StatusFilter>("All");
  const [direction, setDirection] = useState<DirectionFilter>("All");

  const providers = useMemo(() => data?.providers ?? [], [data]);
  const categories = useMemo(() => (data?.categories ?? []).filter((c) => providers.some((p) => p.category === c.label)), [data, providers]);
  const chips = useMemo(
    () => [{ label: "All", count: providers.length }, ...categories.map((c) => ({ label: c.label, count: providers.filter((p) => p.category === c.label).length }))],
    [categories, providers],
  );

  if (error) return <ErrorCard message={errorMessage(error)} onRetry={() => void refetch()} />;

  const shown = providers.filter((p) => matchesStatus(p, status) && (direction === "All" || p.direction === direction));
  const groups = categories
    .filter((c) => category === "All" || c.label === category)
    .map((c) => ({ ...c, providers: shown.filter((p) => p.category === c.label) }))
    .filter((g) => g.providers.length > 0);

  return (
    <div style={{ ...card, overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>Directory</div>
        <div style={{ fontSize: 11, color: R.faint }}>Every integration here is a real connector</div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 7, flexWrap: "wrap" }}>
          <FilterMenu label="Status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
          <FilterMenu
            label="Category"
            value={category}
            options={chips.map((c) => c.label)}
            onChange={setCategory}
          />
          <FilterMenu label="Direction" value={direction} options={DIRECTION_OPTIONS} onChange={setDirection} />
        </div>
      </div>
      <div className="nx-scroll" style={{ display: "flex", gap: 6, padding: "0 18px 14px", overflowX: "auto" }}>
        {chips.map((c) => {
          const on = category === c.label;
          return (
            <button
              key={c.label}
              type="button"
              onClick={() => setCategory(c.label)}
              style={{ height: 30, display: "flex", alignItems: "center", gap: 7, padding: "0 11px", borderRadius: 999, fontSize: 12, fontWeight: on ? 700 : 600, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, border: `1px solid ${on ? R.greenLine : "#E1E5EB"}`, background: on ? R.greenSoft : "#fff", color: on ? "#15803D" : R.muted }}
            >
              <span>{c.label}</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 7, background: on ? "#DCFCE7" : "#F1F3F6", color: on ? "#15803D" : R.faint }}>{c.count}</span>
            </button>
          );
        })}
      </div>
      <div style={{ padding: "4px 14px 16px" }}>
        {isLoading ? (
          <div style={{ padding: 30, textAlign: "center", fontSize: 12.5, color: R.muted }}>Loading integrations…</div>
        ) : groups.length === 0 ? (
          <CardEmpty icon="filter" title="No integrations match these filters" text="Clear a filter to see the rest of the directory." />
        ) : (
          groups.map((g) => (
            <div key={g.label} style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 4px 10px" }}>
                <HIcon name={g.icon} size={15} style={{ color: R.label }} />
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".09em", textTransform: "uppercase", color: R.label }}>{g.label}</div>
                <div style={{ fontSize: 10.5, color: R.faint }}>{g.providers.length} integration{g.providers.length === 1 ? "" : "s"}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 264px), 1fr))", gap: 12 }}>
                {g.providers.map((p) => (
                  <ProviderCard key={p.key} p={p} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function DirectoryScreen() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <SummaryCards />
      <Advisor />
      <DirectoryCard />
    </div>
  );
}

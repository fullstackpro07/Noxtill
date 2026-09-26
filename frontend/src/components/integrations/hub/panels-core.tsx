"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { connectProvider, dismissFinding, requestIntegration, type HubDirection, type HubProvider } from "@/lib/integrations-hub-api";
import { Bullets, Field, Note, PanelFrame, RowsBox, inputCss } from "./hub-chrome";
import { HIcon, R, chipStyle, errorMessage, isConnected, recordsLabel, stamp, statusMeta, whenLabel } from "./hub-ui";
import { useIntegrations, type StaticPanel } from "./integrations-store";
import { useHubActions, useHubOverview, useProviderCard, useRefreshHub } from "./use-hub";

// ── Connect ───────────────────────────────────────────────────────────────

export function ConnectPanel({ providerKey }: { providerKey: string }) {
  const p = useProviderCard(providerKey);
  const { notify, openDrawer } = useIntegrations();
  const refresh = useRefreshHub();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const connect = useMutation({
    mutationFn: (provider: HubProvider) => connectProvider(provider, fields),
    onSuccess: (result, provider) => {
      if (result.authUrl) {
        window.location.href = result.authUrl;
        return;
      }
      if (result.requiresToken) {
        setError("This platform needs a bot token — paste it above.");
        return;
      }
      notify(`${provider.name} connected`, "The first sync does not run until you start it.");
      refresh();
      openDrawer(provider.key);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  if (!p) return null;
  const tokenBased = p.connectKind === "social-token";
  const fieldDefs = tokenBased ? [{ key: "token", label: "Bot token", placeholder: "Paste the token from the platform", secret: true }] : p.credentialFields;
  const missing = fieldDefs.some((f) => !(fields[f.key] ?? "").trim());
  const oauthLike = p.connectKind === "oauth" || p.connectKind === "social";
  const reconnect = isConnected(p);
  const blocked = p.setupRequired;

  return (
    <PanelFrame
      kicker={reconnect ? "Reconnect" : "Connect"}
      title={`${reconnect ? "Reconnect" : "Connect"} ${p.name}`}
      badge={p.category}
      primary={{
        label: oauthLike ? `Continue to ${p.name}` : reconnect ? "Reconnect" : p.connectKind === "channel" ? `Enable ${p.name}` : `Connect ${p.name}`,
        disabled: connect.isPending || missing || blocked,
        onClick: () => {
          setError(null);
          connect.mutate(p);
        },
      }}
      secondary="Cancel"
    >
      <RowsBox
        rows={[
          { label: "What Noxtill will access", value: p.permissions },
          { label: "Direction", value: p.direction },
          { label: "Modules affected", value: p.modules.join(" · ") },
          { label: p.syncMode === "event" ? "When it acts" : "When it syncs", value: p.syncNote },
          ...(oauthLike ? [{ label: "Permissions", value: `Shown by ${p.name} before you authorise` }] : []),
          { label: "Revocable", value: "Yes · Disconnect, or from the provider's own settings", tone: "pos" as const },
          ...(blocked ? [{ label: "Platform setup", value: "Credentials not configured on this server", tone: "neg" as const }] : []),
        ]}
      />
      {fieldDefs.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {fieldDefs.map((f) => (
            <Field key={f.key} label={f.label} hint={f.secret ? "Stored encrypted. It is never shown again or written to a log." : undefined}>
              <input
                type={f.secret ? "password" : "text"}
                value={fields[f.key] ?? ""}
                placeholder={f.placeholder}
                onChange={(e) => setFields((s) => ({ ...s, [f.key]: e.target.value }))}
                style={inputCss}
                autoComplete="off"
              />
            </Field>
          ))}
        </div>
      ) : null}
      {error ? <div style={{ border: "1px solid #FBD5D2", background: "#FEF3F2", color: "#B42318", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, fontWeight: 600 }}>{error}</div> : null}
      {blocked ? (
        <Note>
          The platform credentials for {p.name} are not configured on this server, so the authorisation would be rejected. Ask whoever runs this Noxtill installation to add them — the Connect button stays disabled until then.
        </Note>
      ) : null}
      <Bullets
        title="What happens next"
        items={[
          oauthLike ? `${p.name} shows you these exact permissions before you authorise anything` : "Noxtill verifies the credentials with the provider before storing anything",
          "Noxtill requests only the access listed above — there is no allow-everything scope",
          p.syncMode === "manual" ? "After connecting you decide when the first sync runs; it does not start automatically" : p.syncNote,
          "You can review the permissions again, and revoke them, at any time",
        ]}
      />
      <Note>Permissions can be reviewed before connecting, and revoked afterwards from either side.</Note>
    </PanelFrame>
  );
}

// ── Provider info ("more") ─────────────────────────────────────────────────

export function ProviderInfoPanel({ providerKey }: { providerKey: string }) {
  const p = useProviderCard(providerKey);
  const { openDrawer } = useIntegrations();
  const { startConnect } = useHubActions();
  if (!p) return null;
  const meta = statusMeta(p);
  const connected = isConnected(p);
  return (
    <PanelFrame
      kicker={p.category}
      title={p.name}
      badge={meta.label}
      badgeTone={meta.tone}
      primary={{ label: connected ? "Open connection" : `Connect ${p.name}`, onClick: () => (connected ? openDrawer(p.key) : startConnect(p)) }}
      secondary="Close"
    >
      <RowsBox
        rows={[
          { label: "What it does", value: p.benefit },
          { label: "Direction", value: p.direction },
          { label: "Modules affected", value: p.modules.join(" · ") },
          { label: "Permissions", value: p.permissions },
          { label: "Records synced", value: recordsLabel(p) ?? (connected ? "Not tracked" : "None yet"), tone: recordsLabel(p) || !connected ? undefined : "muted" },
          { label: "Last sync", value: p.syncMode === "event" ? "Event-driven — nothing to sync" : whenLabel(p.lastSuccessAt, "Never") },
          { label: "Platform setup", value: p.setupRequired ? "Credentials not configured on this server" : "Ready to connect", tone: p.setupRequired ? "neg" : "pos" },
        ]}
      />
      <Bullets
        title="Available actions"
        items={
          connected
            ? ["Open the connection for sync history, mapping and audit", ...(p.canSync ? ["Run a sync now, outside the schedule"] : []), ...(p.canPause ? ["Pause syncing without disconnecting"] : []), "Disconnect — data already imported is kept"]
            : ["Connect, and review the exact permissions first", "Read what would sync and in which direction", p.syncNote]
        }
      />
      <Note>Every integration in this directory has a real connector in Noxtill. Where the platform credentials for a provider are missing on this server, the card says “Setup required” instead of pretending it can connect.</Note>
    </PanelFrame>
  );
}

// ── Advisor finding ────────────────────────────────────────────────────────

export function FindingPanel({ findingKey }: { findingKey: string }) {
  const { data } = useHubOverview();
  const router = useRouter();
  const { notify, closeOverlays, openDrawer, openPanel } = useIntegrations();
  const { startConnect } = useHubActions();
  const refresh = useRefreshHub();
  const finding = data?.findings.find((f) => f.key === findingKey);
  const dismiss = useMutation({
    mutationFn: () => dismissFinding(findingKey),
    onSuccess: (r) => {
      notify("Dismissed", `Hidden until ${stamp(r.dismissedUntil)} — it returns then if the condition still holds.`);
      refresh();
      closeOverlays();
    },
    onError: (e) => notify("Could not dismiss", errorMessage(e)),
  });
  if (!finding) return null;
  const provider = data?.providers.find((p) => p.key === finding.providerKey);
  const red = finding.severity === "critical";
  const act = () => {
    if (finding.primaryAction.kind === "reconnect" && provider) return startConnect(provider);
    if (finding.primaryAction.kind === "resolve") return openPanel({ type: "conflict" });
    if (finding.primaryAction.target.startsWith("provider:")) return openDrawer(finding.primaryAction.target.slice(9));
    closeOverlays();
    router.push(finding.primaryAction.target);
  };
  return (
    <PanelFrame
      kicker={`Integration Advisor · ${finding.severity}`}
      title={finding.finding}
      badge={`${finding.severity === "critical" ? "Critical" : finding.severity === "high" ? "High" : "Medium"} severity`}
      badgeTone={red ? "red" : "amber"}
      primary={{ label: finding.primaryAction.label, onClick: act }}
      secondary={{ label: "Dismiss", onClick: () => dismiss.mutate(), disabled: dismiss.isPending }}
    >
      <RowsBox
        rows={[
          { label: "Why this matters", value: finding.why },
          { label: "Affected workflows", value: finding.affectedModules.join(" · ") },
          { label: "Records affected", value: finding.recordsAffected },
          { label: "Detected from", value: "Live connection state" },
          { label: "Auto-fixed", value: "No", tone: "pos" },
          { label: "Recommended action", value: finding.primaryAction.label },
        ]}
      />
      <Bullets
        title="What Noxtill did and did not do"
        items={[
          "It read the actual connection state — this is not a generic warning",
          finding.key.startsWith("conflicts_pending") ? "It queued the conflicts rather than picking a winner" : "It changed nothing on your behalf",
          "It changed nothing on your behalf",
          "The recommendation opens the right screen with the affected records in view",
        ].filter((v, i, a) => a.indexOf(v) === i)}
      />
      <Note>The Advisor only reports what it can see in real connection data. It never invents a connection or an error. A dismissed finding returns after a few days if the condition still holds.</Note>
    </PanelFrame>
  );
}

// ── Health ─────────────────────────────────────────────────────────────────

export function HealthPanel() {
  const { data } = useHubOverview();
  const { openDrawer, closeOverlays } = useIntegrations();
  const router = useRouter();
  if (!data) return null;
  const h = data.health;
  const troubled = data.providers.filter((p) => p.status === "needs_attention");
  const paused = data.providers.filter((p) => p.status === "paused");
  const first = troubled[0];
  return (
    <PanelFrame
      kicker="Integration health"
      title={h.headline}
      badge="Derived from real connection state"
      badgeTone={h.needsAttention ? "amber" : "green"}
      primary={first ? { label: `Open ${first.name}`, onClick: () => openDrawer(first.key) } : { label: "Open Connections", onClick: () => { closeOverlays(); router.push("/integrations/connections"); } }}
      secondary="Close"
    >
      <RowsBox
        rows={[
          ...troubled.map((p) => ({ label: p.name, value: p.attention.map((a) => a.text).join(" · ") || "Needs attention", tone: "neg" as const })),
          ...data.findings.filter((f) => !f.providerKey || !troubled.some((p) => p.key === f.providerKey)).map((f) => ({ label: f.providerKey ?? "Integrations", value: f.finding, tone: "neg" as const })),
          ...paused.map((p) => ({ label: p.name, value: "Paused by owner · not a fault" })),
          { label: "Healthy connections", value: `${h.healthy} of ${h.connected}`, tone: "pos" },
          { label: "Sync errors today", value: h.syncErrorsToday ? `${h.syncErrorsToday} across ${h.syncErrorsAcrossConnections} integration${h.syncErrorsAcrossConnections === 1 ? "" : "s"}` : "None", tone: h.syncErrorsToday ? "neg" : "pos" },
        ]}
      />
      <Bullets
        title="How this status is derived"
        items={[
          "It reads the actual connection and last-sync state of each integration",
          "A paused connection is reported as paused, not as an error — pausing was a decision",
          "The banner reads healthy only if every connected integration genuinely is",
          "Each item opens the connection it concerns",
        ]}
      />
      <Note>Noxtill does not display a green status it cannot verify from real connection state.</Note>
    </PanelFrame>
  );
}

// ── Request an integration ────────────────────────────────────────────────

export function RequestPanel({ providerName }: { providerName?: string }) {
  const { notify, closeOverlays } = useIntegrations();
  const [name, setName] = useState(providerName ?? "");
  const [useCase, setUseCase] = useState("");
  const [direction, setDirection] = useState<HubDirection>("Two-way");
  const submit = useMutation({
    mutationFn: () => requestIntegration({ providerName: name, useCase, direction }),
    onSuccess: (r) => {
      notify("Request sent", r.businessesRequesting > 1 ? `${r.businessesRequesting} businesses have asked for this integration.` : "You are the first to ask for this one. Requests are counted per provider.");
      closeOverlays();
    },
    onError: (e) => notify("Could not send the request", errorMessage(e)),
  });
  const valid = name.trim().length >= 2 && useCase.trim().length >= 5;
  return (
    <PanelFrame kicker="Request an integration" title="Tell us what you need connected" badge="Goes to the product team" primary={{ label: "Submit request", disabled: !valid || submit.isPending, onClick: () => submit.mutate() }} secondary="Cancel">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Provider name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Calendly" style={inputCss} />
        </Field>
        <Field label="What you would sync">
          <textarea value={useCase} onChange={(e) => setUseCase(e.target.value)} rows={4} placeholder="Describe the data and what you want to do with it" style={{ ...inputCss, height: "auto", padding: "10px 12px", resize: "vertical", fontFamily: "inherit" }} />
        </Field>
        <Field label="Direction needed">
          <select value={direction} onChange={(e) => setDirection(e.target.value as HubDirection)} style={inputCss}>
            <option value="Inbound">Inbound · into Noxtill</option>
            <option value="Outbound">Outbound · out of Noxtill</option>
            <option value="Two-way">Two-way</option>
          </select>
        </Field>
      </div>
      <RowsBox rows={[{ label: "Your contact", value: "Your account email" }, { label: "How many businesses need it", value: "Counted across requests" }]} />
      <Bullets
        title="What happens to a request"
        items={["It is counted against other requests for the same provider", "Noxtill does not list an integration in the directory before it exists", "A provider shown as available in the directory has a real connector"]}
      />
      <Note>The directory contains only integrations that are real. Nothing here is aspirational.</Note>
    </PanelFrame>
  );
}

// ── Command bar ────────────────────────────────────────────────────────────

interface Cmd {
  id: string;
  label: string;
  hint: string;
  icon: string;
  run: () => void;
}

export function CommandPanel() {
  const { data } = useHubOverview();
  const router = useRouter();
  const { openPanel, openDrawer, closeOverlays } = useIntegrations();
  const { syncNow } = useHubActions();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const go = (path: string) => {
    closeOverlays();
    router.push(path);
  };

  const commands: Cmd[] = useMemo(() => {
    const providers = data?.providers ?? [];
    const connected = providers.filter((p) => p.status !== "not_connected");
    const base: Cmd[] = [
      { id: "c-connect", label: "connect integration", hint: "Opens the directory", icon: "plug-zap", run: () => go("/integrations") },
      { id: "c-failed", label: "view failed syncs", hint: "Connections · errors today", icon: "circle-alert", run: () => go("/integrations/connections") },
      { id: "c-keys", label: "open api keys", hint: "Developer → API keys", icon: "key-round", run: () => go("/integrations/developer") },
      { id: "c-webhook", label: "add webhook", hint: "Developer → webhook editor", icon: "webhook", run: () => openPanel({ type: "webhook-add" }) },
      { id: "c-health", label: "view integration health", hint: "The health panel", icon: "shield-check", run: () => openPanel({ type: "health" }) },
      { id: "c-request", label: "request integration", hint: "Ask for a provider that is not listed", icon: "plus", run: () => openPanel({ type: "request" }) },
      ...connected.filter((p) => p.canSync).map((p) => ({ id: `s-${p.key}`, label: `sync now ${p.name}`, hint: "Asks for confirmation first", icon: "refresh-cw", run: () => syncNow(p) })),
      ...providers.map((p) => ({ id: `p-${p.key}`, label: `open ${p.name}`, hint: `${p.category} · ${p.benefit}`, icon: "layout-grid", run: () => openDrawer(p.key) })),
    ];
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const results = commands.filter((c) => terms.every((t) => `${c.label} ${c.hint}`.toLowerCase().includes(t))).slice(0, 12);
  const active = Math.min(idx, Math.max(0, results.length - 1));

  return (
    <PanelFrame kicker="Command bar" title="Search and commands" badge="Keyboard navigable" primary={results[active] ? { label: "Run selected", onClick: () => results[active].run() } : undefined} secondary="Close">
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setIdx(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIdx((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setIdx((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && results[active]) {
            e.preventDefault();
            results[active].run();
          }
        }}
        placeholder="Search a provider, category or command…"
        style={inputCss}
        aria-label="Search integrations and commands"
      />
      <div style={{ border: `1px solid ${R.border}`, borderRadius: 12, overflow: "hidden" }}>
        {results.length === 0 ? (
          <div style={{ padding: 16, fontSize: 12.5, color: R.muted }}>Nothing matches “{q}”. Search covers integrations and these commands only — business records are searched from their own modules.</div>
        ) : (
          results.map((c, i) => (
            <div
              key={c.id}
              onClick={() => c.run()}
              onMouseEnter={() => setIdx(i)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 13px", cursor: "pointer", borderTop: i === 0 ? "none" : `1px solid ${R.divider}`, background: i === active ? "#F7FBF8" : "#fff" }}
            >
              <HIcon name={c.icon} size={14} style={{ color: R.label }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>{c.label}</div>
                <div style={{ fontSize: 10.5, color: R.faint, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.hint}</div>
              </div>
              {i === active ? <span style={chipStyle("neutral", { height: 18, fontSize: 9 })}>Enter</span> : null}
            </div>
          ))
        )}
      </div>
      <Bullets title="How search behaves" items={["It matches provider name, category and description together", "Every result is reachable by keyboard alone", "A command that would change data still asks for confirmation"]} />
      <Note>Search covers integrations only. Business records are searched from their own modules.</Note>
    </PanelFrame>
  );
}

// ── Static ────────────────────────────────────────────────────────────────

export function StaticPanelView({ spec }: { spec: StaticPanel }) {
  return (
    <PanelFrame kicker={spec.kicker} title={spec.title} badge={spec.badge} badgeTone={spec.badgeTone} secondary="Close">
      {spec.rows ? <RowsBox rows={spec.rows} /> : null}
      {spec.bullets ? <Bullets title={spec.bulletsTitle ?? "Details"} items={spec.bullets} /> : null}
      {spec.note ? <Note>{spec.note}</Note> : null}
    </PanelFrame>
  );
}

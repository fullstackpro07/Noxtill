"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { HUB_KEYS, fetchConnectionDetail, type HubConnectionDetail, type HubProvider, type HubRow } from "@/lib/integrations-hub-api";
import { CloseX, Bullets, Note, Rows } from "./hub-chrome";
import { HIcon, LogoTile, R, chipStyle, dirIcon, errorMessage, isConnected, recordsLabel, stamp, statusMeta, timeStamp, whenLabel, type Tone } from "./hub-ui";
import { DRAWER_SECTIONS, useIntegrations, type DrawerSection } from "./integrations-store";
import { useHubActions, useHubOverview } from "./use-hub";

const SECTION_LINEAGE: Record<DrawerSection, (connected: boolean) => string> = {
  Overview: (c) => (c ? "From the live connection" : "Not connected"),
  Health: () => "Measured, not asserted",
  "Sync activity": () => "Last 14 days",
  "Sync log": () => "Per sync attempt",
  "Field mapping": () => "What actually syncs",
  Permissions: () => "Granted at connection",
  "Connected modules": () => "Where this data lands",
  Errors: () => "With reasons kept",
  Audit: () => "Append-only",
};

/** Who wins when the two sides differ — stated only where that is really how this provider behaves. */
function truthNote(card: HubProvider): string {
  if (card.category === "E-commerce") return "Noxtill is the source of truth for stock unless you set the store to be — change it under Configure direction on the E-commerce tab.";
  if (card.direction === "Outbound") return `Noxtill is the source: ${card.name} only receives what Noxtill sends and nothing is read back.`;
  if (card.direction === "Inbound") return `${card.name} is the source: Noxtill only reads from it and never writes back.`;
  return `${card.name} data is used only by the modules listed under Connected modules.`;
}

function bulletsFor(section: DrawerSection, card: HubProvider, d: HubConnectionDetail): { title: string; bullets: string[]; note: string } {
  const connected = isConnected(card);
  const dir = card.direction.toLowerCase();
  switch (section) {
    case "Overview":
      return connected
        ? {
            title: "What this connection does",
            bullets: [
              `Data flows ${dir} between Noxtill and ${card.name}`,
              `It feeds ${card.modules.join(", ")}`,
              card.attention.length ? `Attention: ${card.attention.map((a) => a.text.toLowerCase()).join("; ")}` : card.token.state === "not_applicable" ? "This connection has no expiring token" : "Authentication is valid",
              "Disconnecting stops the sync but never deletes data already imported",
            ],
            note: truthNote(card),
          }
        : {
            title: "What connecting would do",
            bullets: [
              "Nothing is connected, so no data is moving in either direction",
              `${card.name} shows you the exact permissions before you authorise anything`,
              card.syncNote,
              "You can disconnect at any time and keep what was imported",
            ],
            note: card.setupRequired ? "This server does not have the platform credentials for this provider configured yet, so connecting is not possible until the platform owner adds them." : truthNote(card),
          };
    case "Health":
      return {
        title: "Why two sync timestamps",
        bullets: [
          "Last attempted and last successful are shown separately, because they diverge when something breaks",
          d.health.some((r) => r.label === "Attempted and successful differ" && r.tone === "neg") ? "Here they differ — the connection is trying and failing" : "Here they match, which means the latest attempt worked",
          "A single last-sync figure would hide exactly the failure you need to see",
          "Provider status and provider rate limits are not tracked — Noxtill does not guess them",
        ],
        note: "Noxtill does not show a green health badge it cannot verify from real connection data.",
      };
    case "Sync activity":
      return {
        title: "What these numbers are",
        bullets: [
          "Every sync attempt is logged with its outcome, records processed and records that failed",
          "A failed attempt keeps its error message, so it is diagnosable",
          "A queued conflict means both systems differ — Noxtill waits for you instead of picking a winner",
          "Duration is shown only for syncs that measured it",
        ],
        note: "Nothing is silently dropped. A record that did not sync is counted as failed, not as synced.",
      };
    case "Sync log":
      return {
        title: "Every entry records",
        bullets: [
          "Timestamp, records processed, records that failed, duration and the error where there was one",
          "A partial sync reports what succeeded and what did not, separately",
          "The log is append-only — entries are never rewritten",
        ],
        note: "The log shows the 30 most recent attempts from the last 14 days.",
      };
    case "Field mapping":
      return {
        title: "Reading this mapping",
        bullets: [
          "Each row has its own direction — two-way, inbound only, or outbound only",
          "“Not synced” means that field is never sent or received, which is often the right answer",
          "Where both sides can change a two-way field, a difference is handled by the connection’s source-of-truth setting",
        ],
        note: d.fieldMapping.note,
      };
    case "Permissions":
      return {
        title: "Scope discipline",
        bullets: [
          "The access listed is exactly what the connector asks the provider for when you authorise",
          "The provider shows you these permissions before you approve them",
          "Disconnecting in Noxtill stops the sync immediately",
          "You can also remove Noxtill’s access from the provider’s own settings",
        ],
        note: "Noxtill stores the access token encrypted and never shows it in the interface or in any log.",
      };
    case "Connected modules":
      return {
        title: "The connected data model",
        bullets: [
          `${card.name} does not sit apart from Noxtill — it feeds the parts of the app listed here`,
          "Data flows into those parts and nowhere else",
          truthNote(card),
          "The Business map tab shows the chain visually, including what depends on what",
        ],
        note: "Nothing syncs into a part of Noxtill that is not listed here.",
      };
    case "Errors":
      return {
        title: "How a failure is reported",
        bullets: [
          "What failed, when, what the provider returned, and how many records were affected",
          card.attention.some((a) => a.code === "auth_failed" || a.code === "auth_expired") ? "Authorisation has to be renewed — reconnect the account" : "A failed sync is tried again the next time a sync runs, and every attempt is logged",
          "A conflict is not a failure — it is a decision waiting for you",
        ],
        note: "An error keeps its reason so it is diagnosable rather than merely visible.",
      };
    case "Audit":
      return {
        title: "Every sensitive action is recorded",
        bullets: [
          "Who connected or disconnected, and when",
          "Who paused or resumed syncing, and who ran a sync",
          "Who changed a mapping, a source of truth, or resolved a conflict",
          "Each entry stores the actor, timestamp and integration",
        ],
        note: "Integration audit entries cannot be edited or removed from the interface.",
      };
  }
}

function toneOf(t?: HubRow["tone"]): "pos" | "neg" | "muted" | undefined {
  return t;
}

function statusTone(status: string): Tone {
  return status === "Mapped" ? "green" : status === "Conflict" ? "red" : status === "Needs review" ? "amber" : "neutral";
}

function LogRow({ e, i }: { e: HubConnectionDetail["syncLog"][number]; i: number }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 13px", borderTop: i === 0 ? "none" : `1px solid ${R.divider}`, background: i % 2 ? "#FCFCFD" : "#fff" }}>
      <div style={{ fontSize: 12, color: R.muted, fontWeight: 600, flex: "0 0 34%" }}>{timeStamp(e.at)}</div>
      <div style={{ fontSize: 12.5, fontWeight: 700, textAlign: "right", flex: 1, color: e.success ? "#15803D" : "#B42318", textWrap: "pretty" }}>
        {e.success ? `${e.records} record${e.records === 1 ? "" : "s"} · completed` : `${e.failed || 0} failed`}
        {e.durationMs !== null ? ` · ${(e.durationMs / 1000).toFixed(1)}s` : ""}
        {e.message ? <div style={{ fontWeight: 500, color: R.muted, fontSize: 11.5, marginTop: 2 }}>{e.message}</div> : null}
      </div>
    </div>
  );
}

function SectionBody({ d, section }: { d: HubConnectionDetail; section: DrawerSection }) {
  const card = d.card;
  const connected = isConnected(card);
  const { openPanel } = useIntegrations();
  const { title, bullets, note } = bulletsFor(section, card, d);

  let rows: HubRow[] = [];
  let custom: ReactNode = null;
  if (section === "Overview") rows = d.overview;
  if (section === "Health") rows = d.health;
  if (section === "Sync activity") rows = d.activity;
  if (section === "Permissions") rows = d.permissions;
  if (section === "Connected modules") rows = d.modules;
  if (section === "Errors") rows = d.errors.rows;

  if (section === "Sync log") {
    custom = d.syncLog.length ? d.syncLog.map((e, i) => <LogRow key={`${e.at}-${i}`} e={e} i={i} />) : <Rows rows={[{ label: "Sync log", value: connected ? "No syncs in the last 14 days" : "Empty", tone: "muted" }]} />;
  }
  if (section === "Audit") {
    custom = d.audit.length ? (
      d.audit.map((a, i) => (
        <div key={`${a.at}-${i}`} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 13px", borderTop: i === 0 ? "none" : `1px solid ${R.divider}`, background: i % 2 ? "#FCFCFD" : "#fff" }}>
          <div style={{ fontSize: 12, color: R.muted, fontWeight: 600, flex: "0 0 34%" }}>{timeStamp(a.at)}</div>
          <div style={{ fontSize: 12.5, fontWeight: 700, textAlign: "right", flex: 1 }}>
            {a.action} · {a.actor}
            {a.detail ? <div style={{ fontWeight: 500, color: R.muted, fontSize: 11, marginTop: 2, fontFamily: "'JetBrains Mono', monospace", wordBreak: "break-all" }}>{a.detail}</div> : null}
          </div>
        </div>
      ))
    ) : (
      <Rows rows={[{ label: "Audit history", value: "None yet", tone: "muted" }]} />
    );
  }

  return (
    <>
      {section === "Field mapping" ? (
        <div style={{ flex: "0 0 auto", border: `1px solid ${R.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "11px 13px", background: "#FAFBFC", borderBottom: `1px solid ${R.divider}`, display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: R.label }}>Field mapping</div>
            {d.fieldMapping.editor ? (
              <button type="button" onClick={() => openPanel(d.fieldMapping.editor === "accounting" ? { type: "accounting-mapping" } : { type: "source-of-truth" })} style={{ marginLeft: "auto", height: 30, display: "flex", alignItems: "center", padding: "0 10px", borderRadius: 8, border: `1px solid ${R.btnBorder}`, background: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", color: R.ink }}>
                {d.fieldMapping.editor === "accounting" ? "Edit mapping" : "Configure direction"}
              </button>
            ) : null}
          </div>
          {d.fieldMapping.rows.length === 0 ? (
            <Rows rows={[{ label: "Field mapping", value: "Not applicable to this integration", tone: "muted" }]} />
          ) : (
            d.fieldMapping.rows.map((m, i) => (
              <div
                key={`${m.noxtill}-${i}`}
                onClick={() => openPanel({ type: "mapping-row", provider: card.key, index: i })}
                style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 13px", cursor: "pointer", borderTop: `1px solid ${R.divider}`, flexWrap: "wrap", background: m.status === "Conflict" ? "#FEFBFB" : m.status === "Needs review" ? "#FFFDF5" : "#fff" }}
              >
                <div style={{ flex: "1 1 150px", minWidth: 120, fontSize: 12, fontWeight: 700 }}>{m.noxtill}</div>
                <div style={{ width: 26, height: 26, flex: "0 0 26px", borderRadius: 8, background: "#EFF6FF", color: "#1D4ED8", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <HIcon name={m.direction === "Inbound" ? "arrow-left" : m.direction === "Outbound" ? "arrow-right" : m.direction === "Two-way" ? "arrow-right-left" : "ban"} size={13} />
                </div>
                <div style={{ flex: "1 1 150px", minWidth: 120, fontSize: 12, color: R.text, fontFamily: "'JetBrains Mono', monospace" }}>{m.external}</div>
                <span style={chipStyle(statusTone(m.status), { height: 21, fontSize: 10, flexShrink: 0 })}>{m.status}</span>
              </div>
            ))
          )}
        </div>
      ) : (
        <div style={{ flex: "0 0 auto", border: `1px solid ${R.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "11px 13px", background: "#FAFBFC", borderBottom: `1px solid ${R.divider}`, display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: R.label }}>{section}</div>
            <div style={{ marginLeft: "auto", fontSize: 10.5, color: R.faint }}>{SECTION_LINEAGE[section](connected)}</div>
          </div>
          {custom ?? <Rows rows={rows.map((r) => ({ label: r.label, value: r.value, tone: toneOf(r.tone) }))} />}
        </div>
      )}
      {section === "Errors" && d.errors.log.length > 0 ? (
        <div style={{ flex: "0 0 auto", border: `1px solid ${R.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "11px 13px", background: "#FAFBFC", borderBottom: `1px solid ${R.divider}`, fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: R.label }}>Failed attempts</div>
          {d.errors.log.map((e, i) => (
            <LogRow key={`${e.at}-${i}`} e={e} i={i} />
          ))}
        </div>
      ) : null}
      <Bullets title={title} items={bullets} />
      <Note>{note}</Note>
    </>
  );
}

export function ConnectionDrawer() {
  const { drawer, closeOverlays, setDrawerSection, openPanel, notify } = useIntegrations();
  const overview = useHubOverview();
  const router = useRouter();
  const { startConnect, syncNow, pause, resume, disconnect } = useHubActions();
  const key = drawer?.key ?? null;
  const detail = useQuery({ queryKey: HUB_KEYS.connection(key ?? ""), queryFn: () => fetchConnectionDetail(key as string), enabled: !!key });
  if (!drawer || !key) return null;

  const card = detail.data?.card ?? overview.data?.providers.find((p) => p.key === key);
  const connected = card ? isConnected(card) : false;
  const meta = card ? statusMeta(card) : null;
  const tokenBad = card && card.token.state !== "valid" && card.token.state !== "not_applicable";
  const syncTrouble = !!card && card.attention.some((a) => a.code === "sync_failing" || a.code === "auth_failed" || a.code === "auth_expired");

  const subline = !card
    ? "Loading…"
    : connected
      ? [recordsLabel(card) ?? "Records not tracked", card.syncMode === "event" ? null : card.lastSuccessAt ? `last sync ${whenLabel(card.lastSuccessAt)}` : "no sync yet", card.connectedAt ? `connected since ${stamp(card.connectedAt)}` : null].filter(Boolean).join(" · ")
      : `${card.benefit} · not connected`;

  const health: Array<{ label: string; icon: string; tone: Tone; arrow: boolean }> = !card
    ? []
    : connected
      ? [
          { label: "Connected", icon: "circle-check", tone: "green", arrow: true },
          card.token.state === "not_applicable"
            ? { label: "No token needed", icon: "circle-check", tone: "green", arrow: true }
            : { label: "Authenticated", icon: tokenBad ? "triangle-alert" : "circle-check", tone: tokenBad ? "amber" : "green", arrow: true },
          card.status === "paused"
            ? { label: "Paused", icon: "pause", tone: "neutral", arrow: true }
            : card.syncMode === "event"
              ? { label: "Event-driven", icon: "zap", tone: "green", arrow: true }
              : card.syncMode === "scheduled"
                ? { label: "Scheduled sync", icon: "refresh-cw", tone: "green", arrow: true }
                : { label: "Manual sync", icon: "refresh-cw", tone: "neutral", arrow: true },
          card.syncMode === "event"
            ? { label: "No sync to run", icon: "circle-check", tone: "neutral", arrow: false }
            : { label: card.lastSuccessAt ? "Last success" : "Never synced", icon: syncTrouble ? "triangle-alert" : card.lastSuccessAt ? "circle-check" : "circle-dashed", tone: syncTrouble ? "amber" : card.lastSuccessAt ? "green" : "neutral", arrow: false },
        ]
      : [
          { label: "Not connected", icon: "circle-dashed", tone: "neutral", arrow: true },
          { label: "Not authenticated", icon: "circle-dashed", tone: "neutral", arrow: true },
          { label: "No sync", icon: "circle-dashed", tone: "neutral", arrow: true },
          { label: "No history", icon: "circle-dashed", tone: "neutral", arrow: false },
        ];

  const actionBtn = (label: string, icon: string, onClick: () => void, risky?: boolean) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      style={{ height: 34, display: "flex", alignItems: "center", gap: 6, padding: "0 11px", borderRadius: 9, cursor: "pointer", fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0, border: `1px solid ${risky ? "#FBD5D2" : R.btnBorder}`, background: "#fff", color: risky ? "#B42318" : R.text }}
    >
      <HIcon name={icon} size={14} />
      <span>{label}</span>
    </button>
  );

  const actions = !card
    ? []
    : connected
      ? [
          card.canSync ? actionBtn("Sync now", "refresh-cw", () => syncNow(card)) : null,
          card.connectKind !== "channel" && card.connectKind !== "developer" ? actionBtn("Reconnect", "key-round", () => startConnect(card)) : null,
          detail.data?.fieldMapping.editor ? actionBtn("Edit mapping", "git-compare", () => openPanel(detail.data?.fieldMapping.editor === "accounting" ? { type: "accounting-mapping" } : { type: "source-of-truth" })) : null,
          card.canPause ? (card.status === "paused" ? actionBtn("Resume sync", "play", () => void resume(card)) : actionBtn("Pause sync", "pause", () => pause(card))) : null,
          actionBtn("View audit", "history", () => setDrawerSection("Audit")),
          card.workspaceHref ? actionBtn("Open workspace", "external-link", () => { closeOverlays(); router.push(card.workspaceHref as string); }) : null,
          card.connectKind === "developer" ? actionBtn("Open Developer", "external-link", () => { closeOverlays(); router.push("/integrations/developer"); }) : null,
          card.connectKind !== "developer" ? actionBtn("Disconnect", "unplug", () => disconnect(card), true) : null,
        ]
      : [
          actionBtn(`Connect ${card.name}`, "plug-zap", () => startConnect(card)),
          actionBtn("View permissions", "shield-check", () => setDrawerSection("Permissions")),
          card.workspaceHref ? actionBtn("Open workspace", "external-link", () => { closeOverlays(); router.push(card.workspaceHref as string); }) : null,
        ];

  return (
    <div onClick={closeOverlays} style={{ position: "fixed", inset: 0, zIndex: 160, background: "rgba(12,23,39,.38)", display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={card?.name ?? "Connection"} style={{ width: 840, maxWidth: "100%", height: "100%", background: "#fff", boxShadow: "-18px 0 44px rgba(12,23,39,.16)", display: "flex", flexDirection: "column", animation: "nxDrawerIn .22s cubic-bezier(.2,.8,.3,1)" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${R.divider}`, display: "flex", alignItems: "flex-start", gap: 13 }}>
          {card && meta ? <LogoTile initials={card.initials} tone={meta.tone} size={44} radius={12} fontSize={14} /> : <div style={{ width: 44, height: 44 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-.015em", textWrap: "pretty" }}>{card?.name ?? "Loading…"}</div>
            <div style={{ fontSize: 11.5, color: R.label, marginTop: 3 }}>{subline}</div>
            {card && meta ? (
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 9, flexWrap: "wrap" }}>
                <span style={chipStyle(meta.tone)}>
                  <HIcon name={meta.icon} size={12} />
                  <span>{meta.label}</span>
                </span>
                <span style={chipStyle("blue")}>
                  <HIcon name={dirIcon(card.direction)} size={12} />
                  <span>{card.direction}</span>
                </span>
                <span style={chipStyle("neutral")}>{card.category}</span>
                {tokenBad ? (
                  <span style={chipStyle(card.token.state === "expired" ? "red" : "amber")}>
                    <HIcon name="key-round" size={12} />
                    <span>{card.token.label}</span>
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <CloseX onClick={closeOverlays} />
        </div>

        <div style={{ padding: "13px 20px", borderBottom: `1px solid ${R.divider}`, background: "#FAFBFC", display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          {health.map((h) => (
            <div key={h.label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={chipStyle(h.tone, { height: 26, fontSize: 11 })}>
                <HIcon name={h.icon} size={13} />
                <span>{h.label}</span>
              </span>
              {h.arrow ? <HIcon name="chevron-right" size={13} style={{ color: "#C3CAD4" }} /> : null}
            </div>
          ))}
          <div style={{ marginLeft: "auto", fontSize: 10.5, color: R.faint, whiteSpace: "nowrap" }}>{card && connected ? (card.syncMode === "event" ? "Acts on events — nothing to sync" : `Last successful sync: ${whenLabel(card.lastSuccessAt, "never")}`) : "No sync history yet"}</div>
        </div>

        <div className="nx-scroll" style={{ display: "flex", gap: 3, padding: "0 20px", borderBottom: `1px solid ${R.divider}`, overflowX: "auto" }}>
          {DRAWER_SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setDrawerSection(s)}
              style={{ padding: "11px 9px", fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap", fontWeight: drawer.section === s ? 700 : 600, color: drawer.section === s ? R.ink : R.muted, boxShadow: drawer.section === s ? `inset 0 -2px 0 ${R.green}` : "none", border: 0, background: "transparent" }}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="nx-scroll" style={{ flex: 1, overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {detail.error ? (
            <div style={{ border: "1px solid #FBD5D2", borderRadius: 12, padding: 14, fontSize: 12.5, color: "#B42318", fontWeight: 600 }}>{errorMessage(detail.error)}</div>
          ) : !detail.data ? (
            <div style={{ fontSize: 12.5, color: R.muted }}>Loading connection…</div>
          ) : (
            <SectionBody d={detail.data} section={drawer.section} />
          )}
        </div>

        <div className="nx-scroll" style={{ padding: "12px 20px", borderTop: `1px solid ${R.divider}`, background: "#FCFCFD", display: "flex", gap: 7, overflowX: "auto" }}>
          {actions}
          {card?.setupRequired && !connected ? (
            <button type="button" onClick={() => notify("Platform setup required", "The OAuth credentials for this provider are not configured on this server.")} style={{ height: 34, padding: "0 4px", border: 0, background: "transparent", fontSize: 11.5, color: "#B45309", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
              Setup required
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

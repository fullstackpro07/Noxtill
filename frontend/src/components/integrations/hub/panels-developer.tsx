"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { subscribeWebhook, testWebhook, unsubscribeWebhook } from "@/lib/automation-api";
import {
  HUB_KEYS,
  createApiKey,
  createDeveloperWebhook,
  deleteDeveloperWebhook,
  fetchApiScopes,
  fetchAutomationOverview,
  fetchConnectionDetail,
  fetchDeveloperOverview,
  fetchLineage,
  retryDelivery,
  revokeApiKey,
} from "@/lib/integrations-hub-api";
import { Bullets, CodeBlock, Field, Note, PanelFrame, RowsBox, inputCss } from "./hub-chrome";
import { R, chipStyle, errorMessage, shortStamp, stamp, timeStamp, whenLabel } from "./hub-ui";
import { deliveryTone } from "./developer-screen";
import { useIntegrations } from "./integrations-store";
import { useHubOverview, useRefreshHub } from "./use-hub";

const PLATFORMS = [
  { key: "zapier", name: "Zapier" },
  { key: "make", name: "Make" },
  { key: "n8n", name: "n8n" },
] as const;

function ErrorBox({ text }: { text: string | null }) {
  if (!text) return null;
  return <div style={{ border: "1px solid #FBD5D2", background: "#FEF3F2", color: "#B42318", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, fontWeight: 600 }}>{text}</div>;
}

async function copy(text: string, notify: (t: string, s?: string) => void, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    notify("Copied", `${what} is on your clipboard.`);
  } catch {
    notify("Could not copy", "Your browser blocked clipboard access — select and copy it manually.");
  }
}

// ── Trigger test ───────────────────────────────────────────────────────────

export function TriggerPanel({ triggerKey }: { triggerKey: string }) {
  const automation = useQuery({ queryKey: HUB_KEYS.automation, queryFn: fetchAutomationOverview });
  const { notify, openPanel } = useIntegrations();
  const refresh = useRefreshHub();
  const [subId, setSubId] = useState("");
  const t = automation.data?.triggers.find((x) => x.key === triggerKey);
  const subs = useMemo(() => (automation.data?.platforms ?? []).flatMap((p) => p.subscriptions.filter((s) => s.triggerKey === triggerKey && s.active).map((s) => ({ ...s, platform: p.name }))), [automation.data, triggerKey]);
  const real = useMutation({
    mutationFn: () => testWebhook(subId || subs[0].id),
    onSuccess: () => {
      notify("Test delivery queued", "A signed payload marked test: true was sent to your endpoint — your handler can ignore it.");
      refresh();
    },
    onError: (e) => notify("Could not send", errorMessage(e)),
  });
  if (!t) return null;
  const payload = JSON.stringify({ event: t.key, occurred_at: new Date().toISOString(), data: t.samplePayload, sample: true }, null, 2);
  return (
    <PanelFrame
      kicker="Trigger test"
      title={t.label}
      badge="Sample payload · nothing runs"
      badgeTone="blue"
      primary={subs.length ? { label: "Send a real test delivery", disabled: real.isPending, onClick: () => real.mutate() } : { label: "Add an automation", onClick: () => openPanel({ type: "subscribe", trigger: t.key }) }}
      secondary={{ label: "Copy payload", onClick: () => void copy(payload, notify, "The sample payload") }}
    >
      <CodeBlock label="Sample payload" text={payload} />
      <RowsBox
        rows={[
          { label: "Trigger", value: t.label },
          { label: "Fires on", value: t.description },
          { label: "Automations using it", value: t.automations ? `${t.automations}` : "Not used" },
          { label: "This preview", value: "Shows a sample payload only", tone: "pos" },
          { label: "Workflow executed", value: "No", tone: "pos" },
          { label: "To send a real test", value: subs.length ? "Choose an automation below" : "Add an automation first" },
        ]}
      />
      {subs.length > 1 ? (
        <Field label="Send the real test to">
          <select value={subId || subs[0].id} onChange={(e) => setSubId(e.target.value)} style={inputCss}>
            {subs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.platform} · {s.targetUrl}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Bullets
        title="Why a preview does not run the workflow"
        items={[
          "This preview shows the exact shape of the payload your automation will receive",
          "A real test delivery is a separate, explicit action and is marked test: true so your workflow can ignore it",
          "No customer is messaged and no stock moves from either action",
        ]}
      />
      <Note>Payload fields come from the trigger definition; a live event carries the real record instead of these sample values.</Note>
    </PanelFrame>
  );
}

// ── Automation subscription ───────────────────────────────────────────────

export function SubscribePanel({ provider, trigger }: { provider?: string; trigger?: string }) {
  const automation = useQuery({ queryKey: HUB_KEYS.automation, queryFn: fetchAutomationOverview });
  const { notify } = useIntegrations();
  const refresh = useRefreshHub();
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]["key"]>((provider as "zapier") ?? "zapier");
  const [triggerKey, setTriggerKey] = useState(trigger ?? "sale");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const o = automation.data;

  const add = useMutation({
    mutationFn: () => subscribeWebhook({ provider: platform, triggerKey, targetUrl: url.trim() } as never),
    onSuccess: (w) => {
      setSecret(w.secret);
      setUrl("");
      setError(null);
      notify("Automation added", "Copy the signing secret now — it is shown once.");
      refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const test = useMutation({
    mutationFn: (id: string) => testWebhook(id),
    onSuccess: () => {
      notify("Test delivery queued", "A signed payload marked test: true is on its way.");
      refresh();
    },
    onError: (e) => notify("Could not send", errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => unsubscribeWebhook(id),
    onSuccess: () => {
      notify("Automation removed", "Noxtill stops sending that trigger to it.");
      refresh();
    },
    onError: (e) => notify("Could not remove", errorMessage(e)),
  });

  if (!o) return null;
  const mine = o.platforms.find((p) => p.key === platform);
  const validUrl = /^https?:\/\/\S+$/.test(url.trim());

  return (
    <PanelFrame
      kicker="Automation platform"
      title={`Connect ${PLATFORMS.find((p) => p.key === platform)?.name}`}
      badge={mine?.connected ? `${mine.automations} automation${mine.automations === 1 ? "" : "s"}` : "Not connected"}
      badgeTone={mine?.connected ? "green" : "neutral"}
      primary={{ label: "Add automation", disabled: !validUrl || add.isPending, onClick: () => add.mutate() }}
      secondary="Close"
    >
      {secret ? (
        <div style={{ border: "1px solid #FDE49B", background: "#FFFBEB", borderRadius: 12, padding: 13 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "#B45309" }}>Signing secret · shown once</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, wordBreak: "break-all", marginTop: 8 }}>{secret}</div>
          <button type="button" onClick={() => void copy(secret, notify, "The signing secret")} style={{ marginTop: 10, height: 30, padding: "0 10px", borderRadius: 8, border: `1px solid ${R.btnBorder}`, background: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            Copy secret
          </button>
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 6 }}>
        {PLATFORMS.map((p) => (
          <button key={p.key} type="button" onClick={() => setPlatform(p.key)} style={{ ...chipStyle(p.key === platform ? "green" : "neutral", { height: 26, fontSize: 11 }), cursor: "pointer" }}>
            {p.name}
          </button>
        ))}
      </div>
      {mine && mine.subscriptions.length > 0 ? (
        <div style={{ border: `1px solid ${R.border}`, borderRadius: 12, overflow: "hidden" }}>
          {mine.subscriptions.map((s, i) => (
            <div key={s.id} style={{ padding: "11px 13px", borderTop: i === 0 ? "none" : `1px solid ${R.divider}`, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{o.triggers.find((t) => t.key === s.triggerKey)?.label ?? s.triggerKey}</div>
                <div style={{ fontSize: 10.5, color: R.label, fontFamily: "'JetBrains Mono', monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.targetUrl}</div>
                <div style={{ fontSize: 10, color: R.faint, marginTop: 2 }}>{s.lastFiredAt ? `Last fired ${whenLabel(s.lastFiredAt)}` : "Not fired yet"}</div>
              </div>
              <button type="button" onClick={() => test.mutate(s.id)} disabled={test.isPending} style={{ height: 28, padding: "0 9px", borderRadius: 8, border: `1px solid ${R.btnBorder}`, background: "#fff", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                Test
              </button>
              <button type="button" onClick={() => remove.mutate(s.id)} disabled={remove.isPending} style={{ height: 28, padding: "0 9px", borderRadius: 8, border: "1px solid #FBD5D2", background: "#fff", color: "#B42318", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Trigger">
          <select value={triggerKey} onChange={(e) => setTriggerKey(e.target.value)} style={inputCss}>
            {o.triggers.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Webhook URL" hint="The URL your automation platform gives you for a “catch hook” / webhook trigger.">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.zapier.com/hooks/catch/…" style={inputCss} />
        </Field>
      </div>
      <ErrorBox text={error} />
      <Bullets
        title="How it works"
        items={[
          "Noxtill sends a signed HTTP POST to that URL every time the trigger fires",
          "Each delivery is retried with backoff if your platform does not answer, and keeps its outcome",
          "The signing secret lets your platform verify a request really came from Noxtill",
          "A template only pre-selects the trigger — nothing is created until you add the automation",
        ]}
      />
      <Note>Automations are connected by subscribing your platform to Noxtill events; Noxtill does not log in to Zapier, Make or n8n.</Note>
    </PanelFrame>
  );
}

// ── API keys ──────────────────────────────────────────────────────────────

export function GenerateKeyPanel() {
  const scopes = useQuery({ queryKey: HUB_KEYS.scopes, queryFn: fetchApiScopes });
  const dev = useQuery({ queryKey: HUB_KEYS.developer, queryFn: fetchDeveloperOverview });
  const { openPanel } = useIntegrations();
  const refresh = useRefreshHub();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const flat = useMemo(() => scopes.data ?? [], [scopes.data]);

  const create = useMutation({
    mutationFn: () => createApiKey(name.trim(), [...picked]),
    onSuccess: (k) => {
      refresh();
      openPanel({ type: "key-secret", name: k.name, key: k.key });
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const toggle = (key: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  return (
    <PanelFrame kicker="Generate API key" title="Create a scoped key" badge="Secret shown once" badgeTone="amber" primary={{ label: "Generate key", disabled: !name.trim() || picked.size === 0 || create.isPending, onClick: () => create.mutate() }} secondary="Cancel">
      <Field label="Key name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Accounting export" style={inputCss} />
      </Field>
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: R.text, marginBottom: 8 }}>Scopes · {picked.size} selected</div>
        <div style={{ border: `1px solid ${R.border}`, borderRadius: 12, overflow: "hidden" }}>
          {flat.map((sc, i) => (
            <label key={sc.key} style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 13px", borderTop: i === 0 ? "none" : `1px solid ${R.divider}`, background: i % 2 ? "#FCFCFD" : "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              <input type="checkbox" checked={picked.has(sc.key)} onChange={() => toggle(sc.key)} />
              <span>{sc.label}</span>
              <span style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: R.faint }}>{sc.key}</span>
            </label>
          ))}
        </div>
      </div>
      <ErrorBox text={error} />
      <Bullets
        title="Before you generate"
        items={[
          "A key gets exactly the capabilities you tick, on top of the access any signed-in staff member has for ordinary screens",
          "The secret appears once at creation and is never shown again",
          "If it is lost, generate a new key and revoke the old one",
          "Capabilities that erase data, change billing or roles, or write off money can never be given to a key — they are not offered",
        ]}
      />
      <Note>Revoking a key takes effect immediately and breaks anything using it. Each key may make {(dev.data?.hourlyLimit ?? 0).toLocaleString("en-US")} requests per hour.</Note>
    </PanelFrame>
  );
}

export function KeySecretPanel({ name, secretKey }: { name: string; secretKey: string }) {
  const { notify } = useIntegrations();
  return (
    <PanelFrame kicker="API key created" title={name} badge="Copy it now — it is not shown again" badgeTone="amber" primary={{ label: "Copy key", onClick: () => void copy(secretKey, notify, "The API key") }} secondary="I have saved it">
      <CodeBlock label="Secret key" text={secretKey} />
      <Bullets
        title="Use it"
        items={[
          "Send it as a bearer token: Authorization: Bearer <key>",
          "Store it in a secrets manager, not in source code",
          "Noxtill keeps only a hash — it cannot show this key again",
          "If it is exposed, revoke it and generate a new one",
        ]}
      />
      <Note>Every key generation is recorded with who did it.</Note>
    </PanelFrame>
  );
}

export function ApiKeyPanel({ id }: { id: string }) {
  const dev = useQuery({ queryKey: HUB_KEYS.developer, queryFn: fetchDeveloperOverview });
  const scopes = useQuery({ queryKey: HUB_KEYS.scopes, queryFn: fetchApiScopes });
  const { openConfirm, notify, closeOverlays } = useIntegrations();
  const refresh = useRefreshHub();
  const key = dev.data?.keys.find((k) => k.id === id);
  if (!key) return null;
  const label = new Map((scopes.data ?? []).map((s) => [s.key, s.label]));
  const revoked = !!key.revokedAt;
  const never = !key.lastUsedAt;
  return (
    <PanelFrame
      kicker="API key"
      title={key.name}
      badge={revoked ? "Revoked" : "Active"}
      badgeTone={revoked ? "neutral" : never ? "amber" : "green"}
      primary={
        revoked
          ? undefined
          : {
              label: "Revoke key",
              tone: "red",
              onClick: () =>
                openConfirm({
                  title: `Revoke ${key.name}?`,
                  tone: "red",
                  icon: "key-round",
                  body: "This takes effect immediately. Anything using this key stops working at once — there is no grace period.",
                  rows: [
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
                      closeOverlays();
                    } catch (e) {
                      notify("Could not revoke", errorMessage(e));
                    } finally {
                      refresh();
                      useIntegrations.setState({ confirm: null });
                    }
                  },
                }),
            }
      }
      secondary="Close"
    >
      <RowsBox
        rows={[
          { label: "Key", value: `${key.prefix}••••••••` },
          { label: "Scopes", value: key.scopes.map((s) => label.get(s) ?? s).join(" · ") || "None" },
          { label: "Created", value: stamp(key.createdAt) },
          { label: "Last used", value: key.lastUsedAt ? whenLabel(key.lastUsedAt) : "Never used", tone: key.lastUsedAt ? undefined : "muted" },
          { label: "Status", value: revoked ? `Revoked ${whenLabel(key.revokedAt)}` : "Active" },
          { label: "Secret retrievable", value: "No · shown once at creation", tone: "neg" },
          { label: "Requests this month", value: key.requestsMonth.toLocaleString("en-US") },
        ]}
      />
      <Bullets
        title={never && !revoked ? "This key has never been used" : "Scope is the boundary"}
        items={
          never && !revoked
            ? ["A key that is never used is a credential sitting idle, which is a risk with no benefit", "Revoking it costs nothing if nothing depends on it", "If it was created for a project that never happened, revoke it", "Revocation is immediate and recorded"]
            : ["The key can use exactly the capabilities listed, plus what any signed-in staff member can do on ordinary screens", "Narrowing a scope is not possible — generate a new key and revoke this one", "The secret cannot be retrieved; rotate rather than recover", "Revoking takes effect immediately and breaks anything using it"]
        }
      />
      <Note>Every key generation and revocation is recorded with who did it.</Note>
    </PanelFrame>
  );
}

export function RateLimitPanel() {
  const dev = useQuery({ queryKey: HUB_KEYS.developer, queryFn: fetchDeveloperOverview });
  const router = useRouter();
  const { closeOverlays } = useIntegrations();
  const o = dev.data;
  if (!o) return null;
  return (
    <PanelFrame kicker="Rate limits" title="How limits are applied" badge="Per key, per hour" badgeTone="blue" primary={{ label: "Back to Developer", onClick: () => { closeOverlays(); router.push("/integrations/developer"); } }} secondary="Close">
      <RowsBox
        rows={[
          { label: "Limit", value: `${o.hourlyLimit.toLocaleString("en-US")} requests per hour per key` },
          { label: "Busiest key this hour", value: `${o.kpis.busiestKeyThisHour.toLocaleString("en-US")} requests` },
          { label: "Headroom", value: `${o.kpis.headroomPct}%`, tone: "pos" },
          { label: "On exceeding", value: "429 with a Retry-After header" },
          { label: "Window", value: "Each clock hour, counted per key" },
          { label: "Webhook deliveries", value: "Not counted against your API limit", tone: "pos" },
        ]}
      />
      <Bullets
        title="What happens at the limit"
        items={[
          "Noxtill answers 429 with a Retry-After header rather than silently dropping requests",
          "The limit is per key, so one runaway script cannot use up your other integrations' allowance",
          "Webhook deliveries out of Noxtill do not count against the inbound limit",
          "Sustained high usage is visible in the usage chart before it becomes a problem",
        ]}
      />
      <Note>The limit is returned in the error so your client can back off correctly.</Note>
    </PanelFrame>
  );
}

// ── Outbound webhooks ─────────────────────────────────────────────────────

export function WebhookAddPanel() {
  const dev = useQuery({ queryKey: HUB_KEYS.developer, queryFn: fetchDeveloperOverview });
  const { openPanel, notify } = useIntegrations();
  const refresh = useRefreshHub();
  const [event, setEvent] = useState("sale");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () => createDeveloperWebhook(event, url.trim()),
    onSuccess: (w) => {
      refresh();
      notify("Webhook validated and saved", "Your endpoint answered the validation event.");
      openPanel({ type: "webhook-secret", event: dev.data?.events.find((e) => e.key === event)?.label ?? event, url: url.trim(), secret: w.secret });
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const valid = /^https?:\/\/\S+$/.test(url.trim());
  return (
    <PanelFrame kicker="Webhook editor" title="Add an outbound webhook" badge="Endpoint validated first" badgeTone="blue" primary={{ label: add.isPending ? "Validating…" : "Validate and save", disabled: !valid || add.isPending, onClick: () => add.mutate() }} secondary="Cancel">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Event">
          <select value={event} onChange={(e) => setEvent(e.target.value)} style={inputCss}>
            {(dev.data?.events ?? []).map((e) => (
              <option key={e.key} value={e.key}>
                {e.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Target URL">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/hooks/noxtill" style={inputCss} />
        </Field>
      </div>
      <ErrorBox text={error} />
      <RowsBox
        rows={[
          { label: "Signing secret", value: "Generated · shown once after saving" },
          { label: "Active", value: "Only once the endpoint answers 2xx" },
          { label: "Retry policy", value: "5 attempts with exponential backoff" },
          { label: "Timeout", value: "10 seconds per attempt" },
        ]}
      />
      <Bullets
        title="Before it goes live"
        items={[
          "Noxtill sends a signed validation request now and requires a 2xx response before saving anything",
          "Every payload is signed with HMAC-SHA256 in the X-Noxtill-Signature header, so your endpoint can verify it came from Noxtill",
          "A failing endpoint is retried five times, then stops rather than retrying forever",
          "The signing secret never appears in a delivery log",
        ]}
      />
      <Note>If the endpoint does not answer 2xx, nothing is saved and you see what it answered.</Note>
    </PanelFrame>
  );
}

export function WebhookSecretPanel({ event, url, secret }: { event: string; url: string; secret: string }) {
  const { notify } = useIntegrations();
  return (
    <PanelFrame kicker="Webhook created" title={`${event} → ${url}`} badge="Copy the signing secret now" badgeTone="amber" primary={{ label: "Copy secret", onClick: () => void copy(secret, notify, "The signing secret") }} secondary="I have saved it">
      <CodeBlock label="Signing secret" text={secret} />
      <Bullets
        title="Verify a delivery"
        items={["Compute HMAC-SHA256 of the raw request body with this secret", "Compare it with the X-Noxtill-Signature header", "Reject the request if they differ", "Noxtill cannot show this secret again"]}
      />
    </PanelFrame>
  );
}

export function DeliveryPanel({ webhookId }: { webhookId: string }) {
  const dev = useQuery({ queryKey: HUB_KEYS.developer, queryFn: fetchDeveloperOverview });
  const { notify, openConfirm, closeOverlays } = useIntegrations();
  const refresh = useRefreshHub();
  const w = dev.data?.webhooks.find((x) => x.id === webhookId);
  const retry = useMutation({
    mutationFn: (id: string) => retryDelivery(id),
    onSuccess: () => {
      notify("Retry queued", "Same payload, sent again with the usual backoff.");
      refresh();
    },
    onError: (e) => notify("Could not retry", errorMessage(e)),
  });
  if (!w) return null;
  const d = w.latest;
  const t = d ? deliveryTone(d.status) : null;
  const payload = d?.payload ? JSON.stringify(d.payload, null, 2) : "";
  return (
    <PanelFrame
      kicker="Delivery detail"
      title={`${w.event} → ${d?.responseStatus ?? (d ? "no response" : "not delivered yet")}`}
      badge={t?.label ?? "Validated · no deliveries yet"}
      badgeTone={t?.tone ?? "neutral"}
      primary={d ? (d.status === "success" ? { label: "Copy payload", onClick: () => void copy(payload, notify, "The payload") } : { label: "Retry delivery", disabled: retry.isPending, onClick: () => retry.mutate(d.id) }) : undefined}
      secondary="Close"
    >
      {d && payload ? <CodeBlock label="Request payload" text={payload} /> : null}
      {d?.error ? <CodeBlock label="Error" text={d.error} /> : null}
      <RowsBox
        rows={[
          { label: "Event", value: w.event },
          { label: "Target URL", value: w.targetUrl },
          { label: "Attempts", value: d ? `${d.attempts} of 5` : "—" },
          { label: "Response code", value: d?.responseStatus ? String(d.responseStatus) : "—", tone: d?.responseStatus && d.responseStatus < 300 ? "pos" : d ? "neg" : undefined },
          { label: "Last delivery", value: d?.lastAttemptAt ? timeStamp(d.lastAttemptAt) : "None yet" },
          { label: "Status", value: t?.label ?? "Validated" },
          { label: "Response body", value: "Not stored · only the status code and error are kept", tone: "muted" },
          { label: "Signing secret in log", value: "Never", tone: "pos" },
          { label: "Next retry", value: d?.status === "pending" ? "Scheduled by backoff" : d?.status === "failed" ? "None · attempts exhausted" : "Not applicable" },
          { label: "Created", value: shortStamp(w.createdAt) },
        ]}
      />
      <Bullets
        title={d?.status === "failed" ? "Why this failed" : "What a delivery records"}
        items={
          d?.status === "failed"
            ? ["Noxtill made five attempts with exponential backoff, then stopped", "Retrying forever would hide a permanently broken endpoint", "Fix the endpoint, then retry from here — the payload is unchanged", "Make your handler idempotent so a retry is safe"]
            : ["The request payload, response status, attempt count and any error", "Every retry uses the same payload", "The signature is never printed in full", "You can copy the payload to replay it against your endpoint locally"]
        }
      />
      <div>
        <button
          type="button"
          onClick={() =>
            openConfirm({
              title: "Delete this webhook?",
              tone: "red",
              icon: "webhook",
              body: "Noxtill stops sending this event to that endpoint immediately. Past delivery records for it are removed with it.",
              rows: [
                { label: "Event", value: w.event },
                { label: "Target URL", value: w.targetUrl },
              ],
              primary: "Delete webhook",
              cancel: "Keep it",
              onConfirm: async () => {
                try {
                  await deleteDeveloperWebhook(w.id);
                  notify("Webhook deleted", "Recorded in the audit trail.");
                  closeOverlays();
                } catch (e) {
                  notify("Could not delete", errorMessage(e));
                } finally {
                  refresh();
                  useIntegrations.setState({ confirm: null });
                }
              },
            })
          }
          style={{ height: 30, padding: "0 10px", borderRadius: 8, border: "1px solid #FBD5D2", background: "#fff", color: "#B42318", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
        >
          Delete this webhook
        </button>
      </div>
      <Note>A delivery keeps its payload, status and attempts so a failure is diagnosable.</Note>
    </PanelFrame>
  );
}

// ── Business map node ─────────────────────────────────────────────────────

export function LineageNodePanel({ chain, index }: { chain: string; index: number }) {
  const lineage = useQuery({ queryKey: HUB_KEYS.lineage, queryFn: fetchLineage });
  const { data } = useHubOverview();
  const router = useRouter();
  const { closeOverlays, openDrawer } = useIntegrations();
  const c = lineage.data?.chains.find((x) => x.key === chain);
  if (!c) return null;
  const node = c.nodes[index];
  const last = index === c.nodes.length - 1;
  const connected = c.providers.map((k) => data?.providers.find((p) => p.key === k)).filter((p) => p && p.status !== "not_connected");
  const tone = c.health.state === "healthy" ? "green" : c.health.state === "attention" ? "amber" : "neutral";
  return (
    <PanelFrame
      kicker="Business map step"
      title={node.label}
      badge={`${c.title} chain`}
      badgeTone={tone}
      primary={node.href ? { label: `Open ${node.label}`, onClick: () => { closeOverlays(); router.push(node.href as string); } } : connected[0] ? { label: `Open ${connected[0]!.name}`, onClick: () => openDrawer(connected[0]!.key) } : undefined}
      secondary="Close"
    >
      <RowsBox
        rows={[
          { label: "Chain", value: c.title },
          { label: "Position", value: `${index + 1} of ${c.nodes.length}` },
          { label: "Receives from", value: index === 0 ? "External · outside Noxtill" : c.nodes[index - 1].label },
          { label: "Sends to", value: last ? "Nothing downstream" : c.nodes[index + 1].label },
          { label: "Chain health", value: c.health.label, tone: c.health.state === "healthy" ? "pos" : c.health.state === "attention" ? "neg" : "muted" },
          { label: "If this step breaks", value: index === 0 ? "The whole chain stops" : last ? "Contained · nothing depends on it" : "Everything after this step stops" },
        ]}
      />
      <Bullets
        title="Why this matters"
        items={[index === 0 ? "This is where external data enters Noxtill" : "This step depends on everything before it in the chain", last ? "Nothing depends on this step, so a failure here is contained" : "A failure here breaks everything after it", "Noxtill remains the source of truth for the combined picture", c.note]}
      />
      <Note>This is data lineage, not a decorative graph. Each step is a real part of the app receiving real data, and the chain health is read live.</Note>
    </PanelFrame>
  );
}

// ── Field mapping row ─────────────────────────────────────────────────────

export function MappingRowPanel({ provider, index }: { provider: string; index: number }) {
  const detail = useQuery({ queryKey: HUB_KEYS.connection(provider), queryFn: () => fetchConnectionDetail(provider) });
  const { openPanel } = useIntegrations();
  const d = detail.data;
  const m = d?.fieldMapping.rows[index];
  if (!d || !m) return null;
  const tone = m.status === "Mapped" ? "green" : m.status === "Conflict" ? "red" : m.status === "Needs review" ? "amber" : "neutral";
  return (
    <PanelFrame
      kicker="Field mapping"
      title={`${m.noxtill} → ${m.external}`}
      badge={m.status}
      badgeTone={tone}
      primary={d.fieldMapping.editor ? { label: d.fieldMapping.editor === "accounting" ? "Edit this mapping" : "Configure direction", onClick: () => openPanel(d.fieldMapping.editor === "accounting" ? { type: "accounting-mapping" } : { type: "source-of-truth" }) } : undefined}
      secondary="Close"
    >
      <RowsBox
        rows={[
          { label: "Noxtill field", value: m.noxtill },
          { label: "External field", value: m.external },
          { label: "Direction", value: m.direction },
          { label: "Status", value: m.status },
          { label: "Records using it", value: d.card.records === null ? "Not tracked" : `${d.card.records.toLocaleString("en-US")} ${d.card.recordsUnit}` },
        ]}
      />
      <Bullets
        title={m.status === "Mapped" ? "This mapping is complete" : "Why this needs attention"}
        items={
          m.status === "Mapped"
            ? ["Both sides of this field are known to Noxtill", "The direction decides which way data moves", "A record that fails validation is skipped and logged, never forced to fit"]
            : m.status === "Not synced"
              ? ["This field is never sent or received — the data simply stays where it is", "That is often the right answer for fields the other system does not have", "Nothing is lost by leaving a field unsynced"]
              : ["A conflict means both systems hold a different value for this field", "Noxtill waits for you rather than choosing a winner while the source of truth says so", "Resolve it from the E-commerce tab"]
        }
      />
      <Note>{d.fieldMapping.note}</Note>
    </PanelFrame>
  );
}

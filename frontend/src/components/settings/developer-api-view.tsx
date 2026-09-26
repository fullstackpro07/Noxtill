"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Webhook, Plus, Trash2, PlayCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { EmptyState } from "@/components/shared/empty-state";
import { HUB_KEYS, fetchApiScopes } from "@/lib/integrations-hub-api";
import { fetchAutomationTriggers } from "@/lib/automation-api";
import { SettingsSectionHeader } from "./settings-section-header";
import { useTranslation } from "@/hooks/use-translation";
import {
  fetchApiKeys,
  createApiKey,
  revokeApiKey,
  fetchDeveloperWebhooks,
  createDeveloperWebhook,
  removeDeveloperWebhook,
  fetchDeveloperWebhookDeliveries,
  testDeveloperWebhook,
  type ApiKey,
} from "@/lib/developer-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { formatDate, formatTime } from "@/lib/format";

/** Capability key → readable label, purely cosmetic (the real scope is the key itself, sent to the API as-is). */
function capabilityLabel(key: string): string {
  return key
    .split(".")
    .join(" ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function DeveloperApiView() {
  const { t } = useTranslation();
  return (
    <div>
      <SettingsSectionHeader title={t("settings.section.developer.label")} description={t("settings.section.developer.description")} />
      <div className="flex flex-col gap-8">
        <ApiKeysSection />
        <WebhooksSection />
      </div>
    </div>
  );
}

function ApiKeysSection() {
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data: keys, isPending, isError, refetch } = useQuery({ queryKey: ["api-keys"], queryFn: fetchApiKeys });

  const revokeMutation = useMutation({
    mutationFn: revokeApiKey,
    onSuccess: () => {
      toast.success("Key revoked.");
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't revoke this key."),
  });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
            <KeyRound className="h-4 w-4 text-primary" aria-hidden />
            API keys
          </h2>
          <p className="mt-0.5 text-xs text-fg-muted">Real bearer credentials, scoped to exactly the capabilities you grant.</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          New key
        </Button>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load API keys" onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
        </div>
      ) : !keys || keys.length === 0 ? (
        <EmptyState icon={KeyRound} title="No API keys yet" description="Create a scoped key to authenticate external requests." action={{ label: "New key", onClick: () => setCreateOpen(true) }} />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-fg-faint">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Key</th>
                <th className="px-4 py-2 font-medium">Scopes</th>
                <th className="px-4 py-2 font-medium">Last used</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="w-8 px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {keys.map((k: ApiKey) => (
                <tr key={k.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium text-fg">{k.name}</td>
                  <td className="px-4 py-2"><code className="text-xs text-fg-muted">{k.keyPrefix}…</code></td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {k.scopes.slice(0, 2).map((s) => (
                        <Badge key={s} tone="neutral">{capabilityLabel(s)}</Badge>
                      ))}
                      {k.scopes.length > 2 && <Badge tone="neutral">+{k.scopes.length - 2} more</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-xs text-fg-faint">{k.lastUsedAt ? `${formatDate(k.lastUsedAt)} · ${formatTime(k.lastUsedAt)}` : "Never"}</td>
                  <td className="px-4 py-2">
                    <Badge tone={k.revokedAt ? "danger" : "success"}>{k.revokedAt ? "Revoked" : "Active"}</Badge>
                  </td>
                  <td className="px-4 py-2">
                    {!k.revokedAt && (
                      <Button variant="ghost" size="icon" onClick={() => revokeMutation.mutate(k.id)} disabled={revokeMutation.isPending} aria-label="Revoke">
                        <Trash2 className="h-3.5 w-3.5 text-fg-faint" aria-hidden />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewApiKeyDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

function NewApiKeyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  // Only the scopes a key may actually be granted — destructive and admin capabilities are never offered.
  const { data: grantable } = useQuery({ queryKey: HUB_KEYS.scopes, queryFn: fetchApiScopes, enabled: open });
  const capabilities = grantable?.map((s) => s.key);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => createApiKey({ name, scopes }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      setCreatedKey(created.key);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't create this key."),
  });

  function toggleScope(scope: string) {
    setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  }

  function handleClose() {
    setName("");
    setScopes([]);
    setCreatedKey(null);
    onClose();
  }

  if (!open) return null;

  if (createdKey) {
    return (
      <Dialog open onClose={handleClose} title="Key created" footer={<Button onClick={handleClose}>Done</Button>}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-fg">This is the real secret — it won&apos;t be shown again. Store it now.</p>
          <code className="break-all rounded-[var(--radius-sm)] border border-border-strong bg-surface-2 p-2 text-xs">{createdKey}</code>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={handleClose}
      title="New API key"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!name.trim() || scopes.length === 0 || mutation.isPending}>
            {mutation.isPending ? "Creating…" : "Create key"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Order sync integration" autoFocus />
        <div>
          <p className="mb-1.5 text-sm font-medium text-fg">Scopes</p>
          <div className="max-h-56 overflow-y-auto rounded-[var(--radius-sm)] border border-border p-2">
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {(capabilities ?? []).map((c) => (
                <label key={c} className="flex items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 text-xs text-fg-muted hover:bg-surface-2">
                  <input type="checkbox" checked={scopes.includes(c)} onChange={() => toggleScope(c)} className="h-3.5 w-3.5" />
                  {capabilityLabel(c)}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function WebhooksSection() {
  const [addOpen, setAddOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: triggers } = useQuery({ queryKey: ["automation-triggers"], queryFn: fetchAutomationTriggers });
  const { data: webhooks, isPending, isError, refetch } = useQuery({ queryKey: ["developer-webhooks"], queryFn: fetchDeveloperWebhooks });

  const removeMutation = useMutation({
    mutationFn: removeDeveloperWebhook,
    onSuccess: () => {
      toast.success("Webhook removed.");
      void queryClient.invalidateQueries({ queryKey: ["developer-webhooks"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't remove this webhook."),
  });

  const testMutation = useMutation({
    mutationFn: testDeveloperWebhook,
    onSuccess: (_delivery, id) => {
      toast.success("Test event sent — check the deliveries below in a moment.");
      void queryClient.invalidateQueries({ queryKey: ["developer-webhook-deliveries", id] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send a test event."),
  });

  const triggerLabel = (key: string) => triggers?.find((t) => t.key === key)?.label ?? key;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
            <Webhook className="h-4 w-4 text-primary" aria-hidden />
            Webhooks
          </h2>
          <p className="mt-0.5 text-xs text-fg-muted">Real, HMAC-signed HTTP POSTs to your own endpoint for any real trigger — plus a delivery log for every attempt.</p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          New webhook
        </Button>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load webhooks" onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
        </div>
      ) : !webhooks || webhooks.length === 0 ? (
        <EmptyState icon={Webhook} title="No webhooks yet" description="Register a real target URL for any trigger." action={{ label: "New webhook", onClick: () => setAddOpen(true) }} />
      ) : (
        <div className="flex flex-col gap-3">
          {webhooks.map((wh) => (
            <div key={wh.id} className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone={wh.active ? "success" : "neutral"}>{wh.active ? "Active" : "Paused"}</Badge>
                  </div>
                  <p className="mt-1 text-sm font-medium text-fg">{triggerLabel(wh.triggerKey)}</p>
                  <p className="mt-0.5 truncate text-xs text-fg-muted">{wh.targetUrl}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" onClick={() => testMutation.mutate(wh.id)} disabled={testMutation.isPending}>
                    <PlayCircle className="h-3.5 w-3.5" aria-hidden />
                    Test
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setExpandedId(expandedId === wh.id ? null : wh.id)} aria-label="Toggle delivery log">
                    {expandedId === wh.id ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => removeMutation.mutate(wh.id)} disabled={removeMutation.isPending} aria-label="Remove">
                    <Trash2 className="h-3.5 w-3.5 text-fg-faint" aria-hidden />
                  </Button>
                </div>
              </div>
              {expandedId === wh.id && <DeliveryLog webhookId={wh.id} />}
            </div>
          ))}
        </div>
      )}

      <NewWebhookDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

function DeliveryLog({ webhookId }: { webhookId: string }) {
  const { data: deliveries, isPending } = useQuery({
    queryKey: ["developer-webhook-deliveries", webhookId],
    queryFn: () => fetchDeveloperWebhookDeliveries(webhookId),
  });

  return (
    <div className="mt-3 border-t border-border pt-3">
      {isPending ? (
        <SkeletonRow />
      ) : !deliveries || deliveries.length === 0 ? (
        <p className="text-xs text-fg-faint">No deliveries yet.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {deliveries.map((d) => (
            <div key={d.id} className="flex items-center gap-2 text-xs">
              <Badge tone={d.status === "success" ? "success" : d.status === "failed" ? "danger" : "neutral"}>{d.status}</Badge>
              <span className="text-fg-faint">
                {formatDate(d.createdAt)} · {formatTime(d.createdAt)}
              </span>
              {d.responseStatus != null && <span className="text-fg-faint">HTTP {d.responseStatus}</span>}
              {d.error && <span className="truncate text-destructive">{d.error}</span>}
              {(d.payload as Record<string, unknown>)?.test === true && <Badge tone="neutral">test</Badge>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewWebhookDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: triggers } = useQuery({ queryKey: ["automation-triggers"], queryFn: fetchAutomationTriggers, enabled: open });
  const [triggerKey, setTriggerKey] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => createDeveloperWebhook({ triggerKey, targetUrl }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["developer-webhooks"] });
      setCreatedSecret(created.secret);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't create this webhook."),
  });

  function handleClose() {
    setTriggerKey("");
    setTargetUrl("");
    setCreatedSecret(null);
    onClose();
  }

  if (!open) return null;

  if (createdSecret) {
    return (
      <Dialog open onClose={handleClose} title="Webhook created" footer={<Button onClick={handleClose}>Done</Button>}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-fg">This is the real signing secret — it won&apos;t be shown again. Use it to verify the `X-Noxtill-Signature` header on every delivery.</p>
          <code className="break-all rounded-[var(--radius-sm)] border border-border-strong bg-surface-2 p-2 text-xs">{createdSecret}</code>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={handleClose}
      title="New webhook"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!triggerKey || !targetUrl.trim() || mutation.isPending}>
            {mutation.isPending ? "Creating…" : "Create"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Select label="Trigger" value={triggerKey} onChange={(e) => setTriggerKey(e.target.value)}>
          <option value="" disabled>
            Choose a trigger…
          </option>
          {(triggers ?? []).map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </Select>
        <Input label="Target URL" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="https://your-app.example.com/webhooks/noxtill" />
        <p className="text-xs text-fg-faint">A real signing secret is generated on creation, shown once.</p>
      </div>
    </Dialog>
  );
}

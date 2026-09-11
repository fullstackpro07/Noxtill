"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Zap, Plus, Trash2, PlayCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { EmptyState } from "@/components/shared/empty-state";
import {
  fetchAutomationTriggers,
  fetchOutboundWebhooks,
  subscribeWebhook,
  unsubscribeWebhook,
  fetchWebhookDeliveries,
  testWebhook,
  AUTOMATION_PROVIDERS,
  AUTOMATION_PROVIDER_LABELS,
  type AutomationProvider,
} from "@/lib/automation-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { formatDate, formatTime } from "@/lib/format";

export function AutomationView() {
  const [addOpen, setAddOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: triggers } = useQuery({ queryKey: ["automation-triggers"], queryFn: fetchAutomationTriggers });
  const { data: webhooks, isPending, isError, refetch } = useQuery({ queryKey: ["automation-webhooks"], queryFn: fetchOutboundWebhooks });

  const removeMutation = useMutation({
    mutationFn: unsubscribeWebhook,
    onSuccess: () => {
      toast.success("Subscription removed.");
      void queryClient.invalidateQueries({ queryKey: ["automation-webhooks"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't remove this subscription."),
  });

  const testMutation = useMutation({
    mutationFn: testWebhook,
    onSuccess: (_delivery, id) => {
      toast.success("Test event sent — check the deliveries below in a moment.");
      void queryClient.invalidateQueries({ queryKey: ["webhook-deliveries", id] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send a test event."),
  });

  const triggerLabel = (key: string) => triggers?.find((t) => t.key === key)?.label ?? key;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg">Automation Platforms</h1>
          <p className="mt-0.5 text-sm text-fg-muted">Real REST-Hook subscriptions for Zapier, Make, and n8n — every delivery is a real, HMAC-signed HTTP POST.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          New subscription
        </Button>
      </div>

      {triggers && triggers.length > 0 && (
        <div className="mb-6 rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
          <p className="mb-2 text-xs font-medium text-fg-muted">Available triggers</p>
          <div className="flex flex-wrap gap-1.5">
            {triggers.map((t) => (
              <Badge key={t.key} tone="neutral">{t.label}</Badge>
            ))}
          </div>
        </div>
      )}

      {isError ? (
        <ErrorBanner title="Couldn't load subscriptions" onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
        </div>
      ) : !webhooks || webhooks.length === 0 ? (
        <EmptyState icon={Zap} title="No subscriptions yet" description="Subscribe a real target URL to a trigger." action={{ label: "New subscription", onClick: () => setAddOpen(true) }} />
      ) : (
        <div className="flex flex-col gap-3">
          {webhooks.map((wh) => (
            <div key={wh.id} className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone="primary">{AUTOMATION_PROVIDER_LABELS[wh.provider as AutomationProvider] ?? wh.provider}</Badge>
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
                  <Button variant="ghost" size="icon" onClick={() => setExpandedId(expandedId === wh.id ? null : wh.id)} aria-label="Toggle delivery history">
                    {expandedId === wh.id ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => removeMutation.mutate(wh.id)} disabled={removeMutation.isPending} aria-label="Remove">
                    <Trash2 className="h-3.5 w-3.5 text-fg-faint" aria-hidden />
                  </Button>
                </div>
              </div>
              {expandedId === wh.id && <DeliveryHistory webhookId={wh.id} />}
            </div>
          ))}
        </div>
      )}

      <NewSubscriptionDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

function DeliveryHistory({ webhookId }: { webhookId: string }) {
  const { data: deliveries, isPending } = useQuery({
    queryKey: ["webhook-deliveries", webhookId],
    queryFn: () => fetchWebhookDeliveries(webhookId),
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

function NewSubscriptionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: triggers } = useQuery({ queryKey: ["automation-triggers"], queryFn: fetchAutomationTriggers, enabled: open });
  const [provider, setProvider] = useState<AutomationProvider>("zapier");
  const [triggerKey, setTriggerKey] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => subscribeWebhook({ provider, triggerKey, targetUrl }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["automation-webhooks"] });
      setCreatedSecret(created.secret);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't create this subscription."),
  });

  function handleClose() {
    setProvider("zapier");
    setTriggerKey("");
    setTargetUrl("");
    setCreatedSecret(null);
    onClose();
  }

  if (!open) return null;

  if (createdSecret) {
    return (
      <Dialog
        open
        onClose={handleClose}
        title="Subscribed"
        footer={<Button onClick={handleClose}>Done</Button>}
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-fg">This is the real signing secret for this subscription — it won&apos;t be shown again. Paste it into your automation platform&apos;s webhook signature check.</p>
          <code className="break-all rounded-[var(--radius-sm)] border border-border-strong bg-surface-2 p-2 text-xs">{createdSecret}</code>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={handleClose}
      title="New subscription"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!triggerKey || !targetUrl.trim() || mutation.isPending}>
            {mutation.isPending ? "Subscribing…" : "Subscribe"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Select label="Platform" value={provider} onChange={(e) => setProvider(e.target.value as AutomationProvider)}>
          {AUTOMATION_PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {AUTOMATION_PROVIDER_LABELS[p]}
            </option>
          ))}
        </Select>
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
        <Input label="Target URL" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="https://hooks.zapier.com/hooks/catch/…" />
        <p className="text-xs text-fg-faint">A real signing secret is generated on creation, shown once — copy it into your automation platform&apos;s webhook signature check.</p>
      </div>
    </Dialog>
  );
}

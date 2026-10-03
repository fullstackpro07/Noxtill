"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { askConfirm } from "@/lib/ask-dialog";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import {
  fetchEndpointDeliveries,
  fetchInboundWorkflows,
  issueEndpointToken,
  replayEndpointDelivery,
  setEndpointEnabled,
  webhookUrl,
  type EndpointDelivery,
  type InboundWorkflow,
} from "@/lib/workflow-endpoints-api";

const STATUS_COLOR: Record<EndpointDelivery["status"], string> = {
  accepted: "var(--app-success-text)",
  duplicate: "var(--app-text-faint)",
  workflow_inactive: "var(--app-warning-text)",
  payload_rejected: "var(--app-danger-strong)",
  failed: "var(--app-danger-strong)",
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function EndpointCard({ workflow, selected, onSelect }: { workflow: InboundWorkflow; selected: boolean; onSelect: () => void }) {
  const client = useQueryClient();
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: ["workflow-endpoints"] });
  const issue = useMutation({
    mutationFn: async () => {
      if (workflow.endpoint && !(await askConfirm({ title: "Rotate this webhook URL?", description: "The current URL stops working immediately. Update every system that calls it.", tone: "danger", confirmLabel: "Rotate" }))) return null;
      return issueEndpointToken(workflow.id);
    },
    onSuccess: async (result) => {
      if (!result) return;
      setFreshUrl(webhookUrl(result.token));
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't create the URL.")),
  });
  const toggle = useMutation({
    mutationFn: () => setEndpointEnabled(workflow.id, !workflow.endpoint!.enabled),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error, "Couldn't change the URL.")),
  });
  const endpoint = workflow.endpoint;
  return (
    <article className="rounded-xl border p-4 text-xs" style={{ borderColor: selected ? "var(--app-primary)" : "var(--app-border)", background: "var(--app-surface)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={onSelect} className="text-left text-sm font-bold underline-offset-2 hover:underline">{workflow.name}</button>
        <span style={{ color: workflow.active ? "var(--app-success-text)" : "var(--app-warning-text)" }}>{workflow.active ? "Workflow on" : "Workflow paused — calls are logged but don't run"}</span>
      </div>
      {endpoint ? (
        <p className="m-0 mt-1" style={{ color: "var(--app-text-muted)" }}>
          URL ending …{endpoint.tokenHint} · {endpoint.enabled ? "enabled" : "disabled"}
          {endpoint.lastReceivedAt ? ` · last call ${formatDate(endpoint.lastReceivedAt)}` : " · never called"}
          {endpoint.rotatedAt ? ` · rotated ${formatDate(endpoint.rotatedAt)}` : ""}
        </p>
      ) : (
        <p className="m-0 mt-1" style={{ color: "var(--app-text-faint)" }}>No URL yet.</p>
      )}
      {freshUrl && (
        <div className="mt-2 rounded-lg border p-2" style={{ borderColor: "var(--app-warning-text)", background: "var(--app-surface-2)" }}>
          <p className="m-0 font-bold">Copy this URL now — it won&rsquo;t be shown again.</p>
          <code className="mt-1 block break-all">{freshUrl}</code>
          <button type="button" onClick={() => { void navigator.clipboard.writeText(freshUrl); toast.success("Copied."); }} className="mt-1 font-bold underline">Copy</button>
          <p className="m-0 mt-2" style={{ color: "var(--app-text-faint)" }}>
            Send <code>POST</code> with a JSON object body. Add an <code>Idempotency-Key</code> header so retries never run twice. Each top-level value becomes a <code>body_&lt;name&gt;</code> field for conditions and messages.
          </p>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-3">
        <button type="button" disabled={issue.isPending} onClick={() => issue.mutate()} className="font-bold underline disabled:opacity-50">{endpoint ? "Rotate URL" : "Create URL"}</button>
        {endpoint && <button type="button" disabled={toggle.isPending} onClick={() => toggle.mutate()} className="font-bold underline disabled:opacity-50">{endpoint.enabled ? "Disable" : "Enable"}</button>}
      </div>
    </article>
  );
}

export function AutomationWebhooksView() {
  const client = useQueryClient();
  const workflows = useQuery({ queryKey: ["workflow-endpoints"], queryFn: fetchInboundWorkflows });
  const [selected, setSelected] = useState<string | null>(null);
  const workflowId = selected ?? workflows.data?.[0]?.id;
  const deliveries = useQuery({ queryKey: ["workflow-endpoints", "deliveries", workflowId], queryFn: () => fetchEndpointDeliveries(workflowId), enabled: Boolean(workflowId) });
  const replay = useMutation({
    mutationFn: replayEndpointDelivery,
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ["workflow-endpoints"] });
      toast.success(result.status === "accepted" ? "Replayed — a new run started." : `Replay ${result.status.replace("_", " ")}.`);
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't replay.")),
  });

  return (
    <main className="flex flex-col gap-5 p-5 md:p-7" style={{ color: "var(--app-text)" }}>
      <p className="m-0 max-w-4xl text-xs" style={{ color: "var(--app-text-muted)" }}>
        Give a workflow the <strong>&ldquo;Inbound webhook&rdquo;</strong> trigger, then create its URL here. Other systems (Zapier, Make, your website) start the workflow by sending JSON to it. Only a fingerprint of the URL is stored,
        so it&rsquo;s shown once; rotating it stops the old one. Every call is logged; repeats with the same Idempotency-Key (or identical body) are not run twice. Bodies over 32 KB are refused.
        Request signing (HMAC) and custom responses aren&rsquo;t available yet. For sending data <em>out</em>, use{" "}
        <Link href="/integrations/automation" className="underline">outbound webhooks in Integrations → Automation</Link>.
      </p>

      {workflows.isLoading ? (
        <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading…</p>
      ) : workflows.isError ? (
        <p className="m-0 text-sm" style={{ color: "var(--app-danger-strong)" }}>{errorMessage(workflows.error, "Couldn't load webhooks.")}</p>
      ) : (workflows.data ?? []).length === 0 ? (
        <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>
          No workflow uses the Inbound webhook trigger yet. <Link href="/marketing/automations" className="font-bold underline">Create one</Link>.
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {(workflows.data ?? []).map((workflow) => (
            <EndpointCard key={workflow.id} workflow={workflow} selected={workflow.id === workflowId} onSelect={() => setSelected(workflow.id)} />
          ))}
        </div>
      )}

      {workflowId && (
        <section className="rounded-2xl border" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
          <p className="m-0 px-4 pt-3 text-sm font-bold">Recent calls</p>
          {(deliveries.data ?? []).length === 0 ? (
            <p className="m-0 p-4 text-sm" style={{ color: "var(--app-text-faint)" }}>No calls received yet.</p>
          ) : (
            <ul className="m-0 mt-2 flex list-none flex-col p-0 text-xs">
              {(deliveries.data ?? []).map((row) => (
                <li key={row.id} className="border-t px-4 py-2" style={{ borderColor: "var(--app-border)" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="font-semibold" style={{ color: STATUS_COLOR[row.status] }}>{row.status.replace("_", " ")}</span> · {formatDate(row.receivedAt)} · {row.payloadBytes} bytes
                      {row.replayOfId ? " · replay" : ""}
                      {row.runId && <> · <Link href="/marketing/automations/executions" className="underline">run started</Link></>}
                    </span>
                    {row.payload && <button type="button" disabled={replay.isPending} onClick={() => replay.mutate(row.id)} className="font-bold underline disabled:opacity-50">Replay</button>}
                  </div>
                  {row.error && <span className="block" style={{ color: "var(--app-danger-strong)" }}>{row.error}</span>}
                  {row.payload && <code className="mt-1 block max-h-20 overflow-auto break-all" style={{ color: "var(--app-text-faint)" }}>{JSON.stringify(row.payload).slice(0, 400)}</code>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}

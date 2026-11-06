"use client";

import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { saApi, type TenantLimits, type TenantModules } from "@/lib/super-admin-api";
import { useAdminCan } from "@/store/super-admin-auth-store";
import {
  ActionDialog,
  Badge,
  Button,
  Card,
  Empty,
  ErrorState,
  Field,
  fmtDate,
  fmtDateTime,
  fmtNum,
  fmtUsd,
  humanize,
  inputCls,
  inputStyle,
  KeyValue,
  Loading,
  Meter,
  Pagination,
  Select,
  StatusBadge,
  Table,
  Td,
} from "../ui";

const invalidate = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: ["sa"] });

// ---------------------------------------------------------------- subscription

export function TenantSubscriptionTab({ id }: { id: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["sa", "tenant", id, "subscription"], queryFn: () => saApi.tenantSubscription(id) });
  const plans = useQuery({ queryKey: ["sa", "plans"], queryFn: saApi.plans });
  const canManage = useAdminCan("subscriptions.manage");
  const [dialog, setDialog] = useState<null | "assign" | "trial" | "cancel" | "undo">(null);
  const [planKey, setPlanKey] = useState("");
  const [interval, setInterval] = useState("month");
  const [days, setDays] = useState("7");
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const s = q.data.subscription;
  const price = s.billingInterval === "year" ? s.plan.yearlyPrice : s.plan.price;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card
          title="Current subscription"
          actions={
            canManage && (
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" disabled={s.stripeBilled} title={s.stripeBilled ? "Billed through Stripe — the business changes plan from its Billing screen" : undefined} onClick={() => { setPlanKey(s.plan.key); setInterval(s.billingInterval); setDialog("assign"); }}>
                  Assign plan
                </Button>
                {s.status === "trialing" && <Button size="sm" variant="outline" onClick={() => setDialog("trial")}>Extend trial</Button>}
                {s.cancelAtPeriodEnd || s.scheduledPlan ? (
                  <Button size="sm" variant="outline" onClick={() => setDialog("undo")}>Undo scheduled change</Button>
                ) : (
                  <Button size="sm" variant="danger" onClick={() => setDialog("cancel")}>Cancel</Button>
                )}
              </div>
            )
          }
        >
          <KeyValue
            rows={[
              ["Subscription ID", <span key="i" className="font-mono text-[12px]">{s.id}</span>],
              ["Plan", s.plan.name],
              ["Status", <StatusBadge key="s" status={s.status} />],
              ["Billing interval", s.billingInterval === "year" ? "Yearly" : "Monthly"],
              ["List price", price == null ? "—" : `${fmtUsd(price)} / ${s.billingInterval}`],
              ["Current period", `${fmtDate(s.periodStart)} → ${fmtDate(s.periodEnd)}`],
              ["Trial ends", fmtDate(s.trialEndsAt)],
              ["Scheduled change", s.scheduledPlan ? `${s.scheduledPlan.name} (${s.scheduledInterval ?? "month"})` : "—"],
              ["Cancels at period end", s.cancelAtPeriodEnd ? <Badge key="c" tone="warning">Yes</Badge> : "No"],
              ["Past due since", fmtDate(s.pastDueSince)],
              ["Billed through Stripe", s.stripeBilled ? "Yes" : "No (no card charged by Noxtill)"],
              ["Access", s.flags.suspended ? <Badge key="a" tone="danger">Read-only</Badge> : s.flags.meteredPaused ? <Badge key="a" tone="warning">Metered features paused</Badge> : <Badge key="a" tone="success">Full</Badge>],
            ]}
          />
        </Card>
        <Card title="Invoices" pad={false}>
          {!q.data.invoices.available ? (
            <Empty>Invoices are read live from Stripe; Stripe is not reachable or not configured here.</Empty>
          ) : q.data.invoices.invoices.length === 0 ? (
            <Empty>No Stripe invoices for this business.</Empty>
          ) : (
            <Table head={["Date", "Number", "Status", "Due", "Paid", ""]}>
              {q.data.invoices.invoices.map((inv) => (
                <tr key={inv.id}>
                  <Td>{fmtDate(inv.createdAt)}</Td>
                  <Td mono>{inv.number ?? inv.id}</Td>
                  <Td><StatusBadge status={inv.status} /></Td>
                  <Td>{inv.amountDue.toLocaleString("en-US", { style: "currency", currency: inv.currency.toUpperCase() })}</Td>
                  <Td>{inv.amountPaid.toLocaleString("en-US", { style: "currency", currency: inv.currency.toUpperCase() })}</Td>
                  <Td>{inv.hostedInvoiceUrl && <a className="font-bold underline" href={inv.hostedInvoiceUrl} target="_blank" rel="noreferrer">Open</a>}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
      <Card title="Billing & entitlement history" pad={false}>
        <Table head={["When", "By", "Change", "Before", "After", "Reason"]} empty={q.data.history.length === 0 && <Empty>No history.</Empty>}>
          {q.data.history.map((h) => (
            <tr key={h.id}>
              <Td className="whitespace-nowrap">{fmtDateTime(h.createdAt)}</Td>
              <Td>{humanize(h.actorType)}</Td>
              <Td>{humanize(h.changeType)}</Td>
              <Td mono className="max-w-[220px] truncate">{h.before ? JSON.stringify(h.before) : "—"}</Td>
              <Td mono className="max-w-[220px] truncate">{h.after ? JSON.stringify(h.after) : "—"}</Td>
              <Td>{h.reason ?? "—"}</Td>
            </tr>
          ))}
        </Table>
      </Card>

      {dialog === "assign" && (
        <ActionDialog
          title="Assign a plan"
          reauth
          confirmLabel="Assign plan"
          description="Applies the plan immediately and starts a new billing period. No card is charged — this is for subscriptions Noxtill does not bill through Stripe (custom or complimentary)."
          onClose={() => setDialog(null)}
          onConfirm={async (auth) => {
            await saApi.assignPlan(id, { planKey, interval, ...auth });
            toast.success("Plan assigned");
            await invalidate(qc);
          }}
        >
          <Field label="Plan">
            <Select
              label="Plan"
              value={planKey}
              onChange={setPlanKey}
              options={(plans.data?.plans ?? []).filter((p) => p.status !== "retired").map((p) => ({ value: p.key, label: `${p.name}${p.status === "draft" ? " (draft)" : ""} — ${fmtUsd(p.price)}/mo` }))}
            />
          </Field>
          <Field label="Billing interval">
            <Select label="Interval" value={interval} onChange={setInterval} options={[{ value: "month", label: "Monthly" }, { value: "year", label: "Yearly" }]} />
          </Field>
        </ActionDialog>
      )}
      {dialog === "trial" && (
        <ActionDialog
          title="Extend the trial"
          confirmLabel="Extend trial"
          description={`Trial currently ends ${fmtDate(s.trialEndsAt)}.`}
          onClose={() => setDialog(null)}
          onConfirm={async ({ reason }) => {
            await saApi.extendTrial(id, { days: Number(days), reason });
            toast.success("Trial extended");
            await invalidate(qc);
          }}
          canConfirm={Number(days) >= 1 && Number(days) <= 90}
        >
          <Field label="Extend by (days, 1–90)">
            <input type="number" min={1} max={90} value={days} onChange={(e) => setDays(e.target.value)} className={inputCls} style={inputStyle} />
          </Field>
        </ActionDialog>
      )}
      {dialog === "cancel" && (
        <ActionDialog
          title="Cancel this subscription"
          danger
          reauth
          confirmLabel="Cancel at period end"
          description={`The business keeps access until ${fmtDate(s.status === "trialing" ? s.trialEndsAt : s.periodEnd)}. ${s.stripeBilled ? "Stripe is told to stop renewing." : ""}`}
          onClose={() => setDialog(null)}
          onConfirm={async (auth) => {
            await saApi.cancelSubscription(id, auth);
            toast.success("Subscription set to cancel");
            await invalidate(qc);
          }}
        />
      )}
      {dialog === "undo" && (
        <ActionDialog
          title="Undo the scheduled change"
          confirmLabel="Undo"
          description="Removes the scheduled cancellation or plan change; the subscription renews as it is."
          onClose={() => setDialog(null)}
          onConfirm={async ({ reason }) => {
            await saApi.undoCancel(id, { reason });
            toast.success("Scheduled change removed");
            await invalidate(qc);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- limits

function limitOf(m: { included: number | null; purchased: number }) {
  return m.included == null ? null : m.included + m.purchased;
}

/** Labelled from the real numbers: "at limit" (used = limit, new ones refused) vs "over limit" (used > limit). */
function LimitState({ used, limit }: { used: number; limit: number | null }) {
  if (limit == null) return <Badge>Not configured</Badge>;
  if (used > limit) return <Badge tone="danger">Over limit</Badge>;
  if (used >= limit) return <Badge tone="warning">At limit</Badge>;
  if (limit > 0 && used / limit >= 0.75) return <Badge tone="warning">Approaching</Badge>;
  return <Badge tone="success">Within limit</Badge>;
}

export function TenantLimitsTab({ id }: { id: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["sa", "tenant", id, "limits"], queryFn: () => saApi.tenantLimits(id) });
  const canManage = useAdminCan("limits.manage");
  const [editing, setEditing] = useState<TenantLimits["meters"][number] | null>(null);
  const [revoking, setRevoking] = useState<TenantLimits["overrides"][number] | null>(null);
  const [qty, setQty] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { entitlements: e, meters, overrides } = q.data;
  const nameOf = (code: string) => meters.find((m) => m.metricCode === code)?.displayName ?? code;

  return (
    <div className="space-y-4">
      <Card title={`Limits — ${e.planName}, usage period ${fmtDate(e.usagePeriod.start)} → ${fmtDate(e.usagePeriod.end)}`} pad={false}>
        <Table head={["Resource", "Kind", "Used", "Allowed", "From plan", "Source", "State", ""]}>
          {meters.map((m) => {
            const r = e.metrics[m.metricCode];
            const feature = m.kind === "feature";
            const fv = e.features[m.metricCode];
            const limit = r ? limitOf(r) : null;
            return (
              <tr key={m.metricCode}>
                <Td>
                  <div className="font-semibold" style={{ color: "var(--app-text)" }}>{m.displayName}</div>
                  <div className="font-mono text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{m.metricCode} · {m.unit}</div>
                </Td>
                <Td>{humanize(m.kind)}</Td>
                <Td>{feature ? "—" : r ? fmtNum(r.used + r.reserved) : "—"}</Td>
                <Td className="min-w-[140px]">
                  {feature ? (
                    fv == null ? "Not configured" : fv ? "Included" : "Not included"
                  ) : r ? (
                    <>
                      {limit == null ? "Not configured" : fmtNum(limit)}
                      {r.purchased > 0 && <span className="text-[11px]"> (incl. {fmtNum(r.purchased)} bought)</span>}
                      <Meter used={r.used + r.reserved} limit={limit} />
                    </>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td>{r ? (r.planIncluded == null ? "Not configured" : fmtNum(r.planIncluded)) : "—"}</Td>
                <Td>{r?.override ? <Badge tone="info">Override{r.override.expiresAt ? ` until ${fmtDate(r.override.expiresAt)}` : ""}</Badge> : <Badge>Plan</Badge>}</Td>
                <Td>{r && !feature && m.kind !== "passthrough" ? <LimitState used={r.used + r.reserved} limit={limit} /> : "—"}</Td>
                <Td>
                  {canManage && m.overridable && (
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(m); setQty(""); setFrom(""); setUntil(""); }}>
                      Set limit
                    </Button>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
        <p className="m-0 px-4 py-3 text-[12px]" style={{ color: "var(--app-text-faintest)" }}>
          &ldquo;Not configured&rdquo; means neither the plan nor an override sets a value — Noxtill never invents one. Spend caps belong to the business and pass-through meters have no allowance, so neither can be overridden.
        </p>
      </Card>

      <Card title="Override history" pad={false}>
        <Table head={["Resource", "Limit", "Effective", "Expires", "State", "Set by", "Reason", ""]} empty={overrides.length === 0 && <Empty>No overrides — every limit comes from the plan.</Empty>}>
          {overrides.map((o) => (
            <tr key={o.id}>
              <Td>{nameOf(o.metricCode)}</Td>
              <Td>{fmtNum(o.includedQuantity, 2)}</Td>
              <Td>{fmtDateTime(o.effectiveFrom)}</Td>
              <Td>{o.expiresAt ? fmtDateTime(o.expiresAt) : "Until revoked"}</Td>
              <Td><StatusBadge status={o.state} /></Td>
              <Td>
                {o.createdBy}
                {o.revokedBy && <div className="text-[11px]">Revoked by {o.revokedBy}</div>}
              </Td>
              <Td className="max-w-[260px]">{o.reason}</Td>
              <Td>{canManage && (o.state === "active" || o.state === "scheduled") && <Button size="sm" variant="ghost" onClick={() => setRevoking(o)}>Revoke</Button>}</Td>
            </tr>
          ))}
        </Table>
      </Card>

      {editing && (
        <ActionDialog
          title={`Set ${editing.displayName} limit`}
          reauth
          confirmLabel="Apply override"
          description={
            <>
              Replaces the plan&apos;s included quantity for this business only (the plan itself is not changed). Enforcement uses the new value on the next action.
              {editing.metricCode === "ai_credits" && " AI credit overrides apply immediately and last until revoked."}
            </>
          }
          canConfirm={qty !== "" && Number(qty) >= 0}
          onClose={() => setEditing(null)}
          onConfirm={async (auth) => {
            await saApi.createOverride(id, {
              metricCode: editing.metricCode,
              includedQuantity: Number(qty),
              effectiveFrom: from ? new Date(from).toISOString() : undefined,
              expiresAt: until ? new Date(until).toISOString() : undefined,
              ...auth,
            });
            toast.success("Override applied");
            await invalidate(qc);
          }}
        >
          <Field label={editing.kind === "feature" ? "Included? (1 = on, 0 = off)" : `New limit (${editing.unit})`} hint="An explicit number. There is no “unlimited”.">
            <input type="number" min={0} step={editing.kind === "capacity" || editing.kind === "feature" ? 1 : "any"} value={qty} onChange={(ev) => setQty(ev.target.value)} className={inputCls} style={inputStyle} />
          </Field>
          {editing.metricCode !== "ai_credits" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts (optional)">
                <input type="datetime-local" value={from} onChange={(ev) => setFrom(ev.target.value)} className={inputCls} style={inputStyle} />
              </Field>
              <Field label="Expires (optional)">
                <input type="datetime-local" value={until} onChange={(ev) => setUntil(ev.target.value)} className={inputCls} style={inputStyle} />
              </Field>
            </div>
          )}
        </ActionDialog>
      )}
      {revoking && (
        <ActionDialog
          title={`Revoke ${nameOf(revoking.metricCode)} override`}
          danger
          reauth
          confirmLabel="Revoke override"
          description="The plan's value applies again immediately."
          onClose={() => setRevoking(null)}
          onConfirm={async (auth) => {
            await saApi.revokeOverride(id, revoking.id, auth);
            toast.success("Override revoked");
            await invalidate(qc);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- modules

export function TenantModulesTab({ id }: { id: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["sa", "tenant", id, "modules"], queryFn: () => saApi.tenantModules(id) });
  const canManage = useAdminCan("modules.manage");
  const [editing, setEditing] = useState<TenantModules["modules"][number] | null>(null);
  const [state, setState] = useState("suspended");
  const [until, setUntil] = useState("");
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} />;
  return (
    <div className="space-y-4">
      <Card title="Module access" pad={false}>
        <Table head={["Module", "Group", "Effective access", "Noxtill decision", ""]}>
          {q.data.modules.map((m) => (
            <tr key={m.key}>
              <Td>
                <div className="font-semibold" style={{ color: "var(--app-text)" }}>{m.label}</div>
                <div className="text-[11.5px]">{m.description}</div>
              </Td>
              <Td>{m.group}</Td>
              <Td><StatusBadge status={m.state} /></Td>
              <Td className="max-w-[280px]">
                {m.platform ? (
                  <>
                    {m.platform.reason}
                    {m.platform.expiresAt && <div className="text-[11px]">Until {fmtDateTime(m.platform.expiresAt)}</div>}
                  </>
                ) : (
                  "—"
                )}
              </Td>
              <Td>
                {canManage && m.platform?.state !== "global_disabled" && (
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(m); setState(m.platform ? "clear" : "suspended"); setUntil(""); }}>
                    Change
                  </Button>
                )}
              </Td>
            </tr>
          ))}
        </Table>
        <p className="m-0 px-4 py-3 text-[12px]" style={{ color: "var(--app-text-faintest)" }}>
          Every plan includes every module today (plans do not gate modules), so &ldquo;Enabled by subscription&rdquo; applies to all of them unless Noxtill or the business turned one off. Dashboard and Settings are always on. Access is enforced by the API, not only hidden in the sidebar.
        </p>
      </Card>
      <Card title="Change history" pad={false}>
        <Table head={["When", "Module", "State", "Reason", "By", "Expires", "Revoked"]} empty={q.data.history.length === 0 && <Empty>No Noxtill changes.</Empty>}>
          {q.data.history.map((h) => (
            <tr key={h.id}>
              <Td>{fmtDateTime(h.createdAt)}</Td>
              <Td>{h.moduleKey}</Td>
              <Td><StatusBadge status={h.state} /></Td>
              <Td>{h.reason}</Td>
              <Td>{h.createdBy}</Td>
              <Td>{h.expiresAt ? fmtDateTime(h.expiresAt) : "—"}</Td>
              <Td>{h.revokedAt ? `${fmtDateTime(h.revokedAt)}${h.revokedBy ? ` by ${h.revokedBy}` : ""}` : "—"}</Td>
            </tr>
          ))}
        </Table>
      </Card>
      {editing && (
        <ActionDialog
          title={`${editing.label} access`}
          danger={state !== "clear"}
          confirmLabel="Apply"
          onClose={() => setEditing(null)}
          onConfirm={async ({ reason }) => {
            await saApi.setTenantModule(id, editing.key, { state, expiresAt: until ? new Date(until).toISOString() : undefined, reason });
            toast.success("Module access updated");
            await invalidate(qc);
          }}
        >
          <Field label="Access">
            <Select
              label="Access"
              value={state}
              onChange={setState}
              options={[
                { value: "suspended", label: "Suspend (blocked, hidden from the business)" },
                { value: "restricted", label: "Restrict (read-only: view and export only)" },
                ...(editing.platform ? [{ value: "clear", label: "Restore normal access" }] : []),
              ]}
            />
          </Field>
          {state !== "clear" && (
            <Field label="Until (optional)">
              <input type="datetime-local" value={until} onChange={(ev) => setUntil(ev.target.value)} className={inputCls} style={inputStyle} />
            </Field>
          )}
        </ActionDialog>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- AI

export function TenantAiTab({ id }: { id: string }) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const ledger = useQuery({ queryKey: ["sa", "tenant", id, "ai", page], queryFn: () => saApi.tenantAiLedger(id, { page, pageSize: 25 }), placeholderData: keepPreviousData });
  const limits = useQuery({ queryKey: ["sa", "tenant", id, "limits"], queryFn: () => saApi.tenantLimits(id) });
  const canManage = useAdminCan("ai.manage");
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState("");
  const m = limits.data?.entitlements.metrics.ai_credits;
  return (
    <div className="space-y-4">
      <Card title="AI credit balance" actions={canManage && <Button size="sm" onClick={() => { setDelta(""); setOpen(true); }}>Adjust credits</Button>}>
        {!m ? (
          <Loading />
        ) : (
          <KeyValue
            rows={[
              ["Included this period", m.included == null ? "Not configured" : fmtNum(m.included)],
              ["Added (purchased or granted)", fmtNum(m.purchased)],
              ["Used", fmtNum(m.used)],
              ["Reserved (in flight)", fmtNum(m.reserved)],
              ["Remaining", m.remaining == null ? "Not configured" : fmtNum(m.remaining)],
              ["Resets", fmtDateTime(m.resetsAt)],
            ]}
          />
        )}
      </Card>
      <Card title="Grants and adjustments" pad={false}>
        <Table head={["When", "Type", "Credits", "By / reason"]} empty={(ledger.data?.allocations.length ?? 0) === 0 && <Empty>No grants, purchases or adjustments.</Empty>}>
          {ledger.data?.allocations.map((a) => (
            <tr key={a.id}>
              <Td>{fmtDateTime(a.occurredAt)}</Td>
              <Td>{humanize(a.operationCode)}</Td>
              <Td>{fmtNum(a.quantity)}</Td>
              <Td>{a.metadata ? `${String(a.metadata.adminEmail ?? "")} ${String(a.metadata.reason ?? "")}`.trim() || "—" : "—"}</Td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title="Credit transactions" pad={false}>
        {ledger.isPending && <Loading />}
        {ledger.isError && <div className="p-4"><ErrorState error={ledger.error} /></div>}
        {ledger.data && (
          <>
            <Table head={["Reserved", "Operation", "Band", "Reserved", "Charged", "State", "Note"]} empty={ledger.data.items.length === 0 && <Empty>No AI usage yet.</Empty>}>
              {ledger.data.items.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap">{fmtDateTime(r.reservedAt)}</Td>
                  <Td mono>{r.operationCode}</Td>
                  <Td>{r.band}</Td>
                  <Td>{r.reservedQty}</Td>
                  <Td>{r.actualQty ?? "—"}</Td>
                  <Td><StatusBadge status={r.state} /></Td>
                  <Td>{r.reason ?? "—"}</Td>
                </tr>
              ))}
            </Table>
            <Pagination page={ledger.data.page} pageSize={ledger.data.pageSize} total={ledger.data.total} onPage={setPage} />
          </>
        )}
      </Card>
      {open && (
        <ActionDialog
          title="Adjust AI credits"
          reauth
          confirmLabel="Apply adjustment"
          description="Positive adds credits to the never-expiring added bucket; negative takes back unused added credits. Recorded as a credit transaction with your name and reason."
          canConfirm={/^-?\d+$/.test(delta) && Number(delta) !== 0}
          onClose={() => setOpen(false)}
          onConfirm={async (auth) => {
            await saApi.adjustCredits(id, { delta: Number(delta), ...auth });
            toast.success("Credits adjusted");
            await invalidate(qc);
          }}
        >
          <Field label="Credits (+ to grant, − to deduct)">
            <input type="number" step={1} value={delta} onChange={(e) => setDelta(e.target.value)} className={inputCls} style={inputStyle} />
          </Field>
        </ActionDialog>
      )}
    </div>
  );
}

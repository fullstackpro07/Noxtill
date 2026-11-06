"use client";

import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { saApi, type PlanEntitlement, type PlanRow } from "@/lib/super-admin-api";
import { useAdminCan } from "@/store/super-admin-auth-store";
import { useDebounced } from "../use-debounced";
import {
  ActionDialog,
  Badge,
  Button,
  Card,
  Empty,
  ErrorState,
  Field,
  fmtDate,
  fmtNum,
  fmtUsd,
  humanize,
  inputCls,
  inputStyle,
  Loading,
  PageHeader,
  Pagination,
  RowLink,
  SearchBox,
  Select,
  StatusBadge,
  Table,
  Td,
} from "../ui";

export function SubscriptionsView() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [plan, setPlan] = useState("");
  const [interval, setInterval] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const params = { search: q, status, plan, interval, page, pageSize: 25 };
  const list = useQuery({ queryKey: ["sa", "subscriptions", params], queryFn: () => saApi.subscriptions(params), placeholderData: keepPreviousData });
  const plans = useQuery({ queryKey: ["sa", "plans"], queryFn: saApi.plans });
  const set = (fn: (v: string) => void) => (v: string) => {
    fn(v);
    setPage(1);
  };
  return (
    <>
      <PageHeader title="Subscriptions" subtitle="Every business subscription. Amounts are plan list prices in USD." />
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-2 border-b p-3" style={{ borderColor: "var(--app-border)" }}>
          <SearchBox value={search} onChange={set(setSearch)} placeholder="Business name or ID, subscription ID, Stripe ID" />
          <Select
            label="Status"
            value={status}
            onChange={set(setStatus)}
            options={[
              { value: "", label: "Any status" },
              { value: "active", label: "Active" },
              { value: "trialing", label: "Trial" },
              { value: "past_due", label: "Past due" },
              { value: "payment_failed", label: "Payment failed (past due)" },
              { value: "paused", label: "Paused" },
              { value: "cancelled", label: "Cancelled / expired" },
              { value: "cancelling", label: "Set to cancel" },
            ]}
          />
          <Select label="Plan" value={plan} onChange={set(setPlan)} options={[{ value: "", label: "Any plan" }, ...(plans.data?.plans ?? []).map((p) => ({ value: p.key, label: p.name }))]} />
          <Select label="Interval" value={interval} onChange={set(setInterval)} options={[{ value: "", label: "Any interval" }, { value: "month", label: "Monthly" }, { value: "year", label: "Yearly" }]} />
        </div>
        {list.isPending && <Loading />}
        {list.isError && <div className="p-4"><ErrorState error={list.error} /></div>}
        {list.data && (
          <>
            <Table head={["Business", "Subscription ID", "Plan", "Cycle", "Amount", "Status", "Period start", "Renews / ends", "Billing"]} empty={list.data.items.length === 0 && <Empty>No subscriptions match.</Empty>}>
              {list.data.items.map((s) => (
                <tr key={s.id}>
                  <Td><RowLink href={`/super-admin/businesses/${s.business.id}?tab=subscription`}>{s.business.name}</RowLink></Td>
                  <Td mono>{s.id.slice(0, 8)}…</Td>
                  <Td>
                    {s.plan.name}
                    {s.scheduledPlan && <div className="text-[11px]">→ {s.scheduledPlan.name}</div>}
                  </Td>
                  <Td>{s.billingInterval === "year" ? "Yearly" : "Monthly"}</Td>
                  <Td>{s.amountUsd == null ? "—" : fmtUsd(s.amountUsd)}</Td>
                  <Td>
                    <StatusBadge status={s.status} /> {s.cancelAtPeriodEnd && <Badge tone="warning">Cancels</Badge>}
                  </Td>
                  <Td>{fmtDate(s.periodStart)}</Td>
                  <Td>{fmtDate(s.status === "trialing" ? s.trialEndsAt : s.periodEnd)}</Td>
                  <Td>{s.stripeBilled ? "Stripe" : "Not billed by Stripe"}</Td>
                </tr>
              ))}
            </Table>
            <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}

const ENT_KINDS = ["capacity", "allowance", "spend_cap", "feature", "passthrough"];

export function PlansView() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["sa", "plans"], queryFn: saApi.plans });
  const canManage = useAdminCan("plans.manage");
  const [editing, setEditing] = useState<PlanRow | "new" | null>(null);
  const [ents, setEnts] = useState<PlanRow | null>(null);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { plans, meters } = q.data;

  return (
    <>
      <PageHeader
        title="Plans"
        subtitle="Plans are data: what you set here is exactly what the usage engine enforces for every business on the plan."
        actions={canManage && <Button onClick={() => setEditing("new")}>New plan</Button>}
      />
      <div className="grid gap-4 xl:grid-cols-2">
        {plans.map((p) => {
          const subs = Object.values(p.subscribers).reduce((a, b) => a + b, 0);
          return (
            <Card
              key={p.id}
              title={
                <span className="flex items-center gap-2">
                  {p.name} <span className="font-mono text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{p.key}</span> <StatusBadge status={p.status} />
                </span>
              }
              actions={
                canManage && (
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEnts(p)}>Entitlements</Button>
                  </div>
                )
              }
            >
              <div className="mb-3 grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4">
                <div><div className="text-[11px] uppercase" style={{ color: "var(--app-text-faintest)" }}>Monthly</div><b>{fmtUsd(p.price)}</b></div>
                <div><div className="text-[11px] uppercase" style={{ color: "var(--app-text-faintest)" }}>Yearly</div><b>{p.yearlyPrice == null ? "—" : fmtUsd(p.yearlyPrice)}</b></div>
                <div><div className="text-[11px] uppercase" style={{ color: "var(--app-text-faintest)" }}>Trial</div><b>{p.trialDays ? `${p.trialDays} days` : "—"}</b></div>
                <div><div className="text-[11px] uppercase" style={{ color: "var(--app-text-faintest)" }}>Subscribers</div><b>{fmtNum(subs)}</b></div>
              </div>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {p.purchasable ? <Badge tone="success">Purchasable</Badge> : <Badge>Not purchasable</Badge>}
                {p.stripeLinked ? <Badge tone="info">Stripe-linked</Badge> : <Badge>No Stripe price</Badge>}
                {Object.entries(p.subscribers).map(([s, n]) => (
                  <Badge key={s}>{humanize(s)}: {n}</Badge>
                ))}
              </div>
              <Table head={["Resource", "Kind", "Included", "Resets"]}>
                {p.entitlements.map((e) => (
                  <tr key={e.metricCode}>
                    <Td>{meters.find((m) => m.metricCode === e.metricCode)?.displayName ?? e.metricCode}</Td>
                    <Td>{humanize(e.kind)}</Td>
                    <Td>{e.kind === "feature" ? (e.includedQuantity == null ? "Not configured" : e.includedQuantity > 0 ? "Included" : "Not included") : e.includedQuantity == null ? "Not configured" : fmtNum(e.includedQuantity)}</Td>
                    <Td>{humanize(e.resetRule)}</Td>
                  </tr>
                ))}
              </Table>
              {p.entitlements.length === 0 && <Empty>No entitlements set — every limit is Not configured.</Empty>}
            </Card>
          );
        })}
      </div>
      {editing && <PlanDialog plan={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => qc.invalidateQueries({ queryKey: ["sa"] })} />}
      {ents && <EntitlementsDialog plan={ents} meters={meters} onClose={() => setEnts(null)} onSaved={() => qc.invalidateQueries({ queryKey: ["sa"] })} />}
    </>
  );
}

function PlanDialog({ plan, onClose, onSaved }: { plan: PlanRow | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    key: plan?.key ?? "",
    name: plan?.name ?? "",
    price: String(plan?.price ?? ""),
    yearlyPrice: plan?.yearlyPrice == null ? "" : String(plan.yearlyPrice),
    trialDays: String(plan?.trialDays ?? 0),
    displayOrder: String(plan?.displayOrder ?? 0),
    purchasable: plan?.purchasable ?? false,
    status: plan?.status ?? "draft",
    stripePriceId: plan?.stripePriceId ?? "",
    stripeYearlyPriceId: plan?.stripeYearlyPriceId ?? "",
  });
  const up = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <ActionDialog
      title={plan ? `Edit ${plan.name}` : "New plan"}
      reauth
      confirmLabel={plan ? "Save plan" : "Create plan (as draft)"}
      description={
        plan?.stripeLinked
          ? "This plan is linked to Stripe prices. Stripe prices cannot be edited — to change the amount, create the new price in Stripe and enter its ID together with the new amount."
          : plan
            ? undefined
            : "New plans start as drafts. Set their entitlements, then make them active."
      }
      canConfirm={!!f.name.trim() && f.price !== "" && (!!plan || /^[a-z0-9_]{2,40}$/.test(f.key))}
      onClose={onClose}
      onConfirm={async (auth) => {
        const body = {
          name: f.name,
          price: Number(f.price),
          yearlyPrice: f.yearlyPrice === "" ? null : Number(f.yearlyPrice),
          trialDays: Number(f.trialDays),
          displayOrder: Number(f.displayOrder),
          purchasable: f.purchasable,
          stripePriceId: f.stripePriceId || null,
          stripeYearlyPriceId: f.stripeYearlyPriceId || null,
          ...auth,
        };
        if (plan) {
          const changed: Record<string, unknown> = { ...auth, status: f.status };
          for (const [k, v] of Object.entries(body)) {
            if (k === "reason" || k === "totpCode") continue;
            const prev = (plan as unknown as Record<string, unknown>)[k] ?? null;
            if (v !== prev) changed[k] = v;
          }
          await saApi.updatePlan(plan.key, changed);
        } else {
          await saApi.createPlan({ ...body, key: f.key });
        }
        toast.success("Plan saved");
        onSaved();
      }}
    >
      {!plan && (
        <Field label="Plan key" hint="Lower-case letters, digits, underscores. Cannot be changed later.">
          <input value={f.key} onChange={up("key")} className={inputCls} style={inputStyle} />
        </Field>
      )}
      <Field label="Name"><input value={f.name} onChange={up("name")} className={inputCls} style={inputStyle} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Monthly price (USD)"><input type="number" min={0} step="0.01" value={f.price} onChange={up("price")} className={inputCls} style={inputStyle} /></Field>
        <Field label="Yearly price (USD)"><input type="number" min={0} step="0.01" value={f.yearlyPrice} onChange={up("yearlyPrice")} className={inputCls} style={inputStyle} /></Field>
        <Field label="Trial days"><input type="number" min={0} value={f.trialDays} onChange={up("trialDays")} className={inputCls} style={inputStyle} /></Field>
        <Field label="Display order"><input type="number" value={f.displayOrder} onChange={up("displayOrder")} className={inputCls} style={inputStyle} /></Field>
        <Field label="Stripe monthly price ID"><input value={f.stripePriceId} onChange={up("stripePriceId")} className={inputCls} style={inputStyle} /></Field>
        <Field label="Stripe yearly price ID"><input value={f.stripeYearlyPriceId} onChange={up("stripeYearlyPriceId")} className={inputCls} style={inputStyle} /></Field>
      </div>
      {plan && (
        <Field label="Status" hint="Retired plans keep working for businesses already on them, but cannot be chosen.">
          <Select label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={[{ value: "draft", label: "Draft" }, { value: "active", label: "Active" }, { value: "retired", label: "Retired" }]} />
        </Field>
      )}
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={f.purchasable} onChange={(e) => setF({ ...f, purchasable: e.target.checked })} /> Businesses can buy this plan themselves
      </label>
    </ActionDialog>
  );
}

function EntitlementsDialog({ plan, meters, onClose, onSaved }: { plan: PlanRow; meters: { metricCode: string; displayName: string; kind: string; resetRule: string }[]; onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState<(PlanEntitlement & { on: boolean; raw: string })[]>(
    meters.map((m) => {
      const e = plan.entitlements.find((x) => x.metricCode === m.metricCode);
      return {
        metricCode: m.metricCode,
        kind: e?.kind ?? m.kind,
        includedQuantity: e?.includedQuantity ?? null,
        resetRule: e?.resetRule ?? m.resetRule,
        on: !!e,
        raw: e?.includedQuantity == null ? "" : String(e.includedQuantity),
      };
    }),
  );
  const update = (i: number, patch: Partial<(typeof rows)[number]>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <ActionDialog
      title={`${plan.name} entitlements`}
      reauth
      confirmLabel="Save entitlements"
      description="Leave the quantity empty for “Not configured” (never treated as unlimited). Changes apply to every business on this plan on their next action, except where a business has its own override."
      onClose={onClose}
      onConfirm={async (auth) => {
        await saApi.setPlanEntitlements(plan.key, {
          entitlements: rows.filter((r) => r.on).map((r) => ({ metricCode: r.metricCode, kind: r.kind, includedQuantity: r.raw === "" ? null : Number(r.raw), resetRule: r.resetRule })),
          ...auth,
        });
        toast.success("Entitlements saved");
        onSaved();
      }}
    >
      <div className="max-h-[45vh] overflow-y-auto rounded-lg border" style={{ borderColor: "var(--app-border)" }}>
        <table className="w-full text-[12.5px]">
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.metricCode} className="border-b" style={{ borderColor: "var(--app-border)" }}>
                <td className="px-2 py-1.5">
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={r.on} onChange={(e) => update(i, { on: e.target.checked })} />
                    {meters[i].displayName}
                  </label>
                </td>
                <td className="px-1 py-1.5">
                  <select aria-label="Kind" value={r.kind} disabled={!r.on} onChange={(e) => update(i, { kind: e.target.value })} className="rounded border px-1 py-0.5" style={inputStyle}>
                    {ENT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </td>
                <td className="px-1 py-1.5">
                  <input aria-label="Included" type="number" min={0} disabled={!r.on} value={r.raw} onChange={(e) => update(i, { raw: e.target.value })} placeholder="Not configured" className="w-[110px] rounded border px-1.5 py-0.5" style={inputStyle} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ActionDialog>
  );
}

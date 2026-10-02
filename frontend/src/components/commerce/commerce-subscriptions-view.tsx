"use client";

import Link from "next/link";
import { type ReactNode, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";
import { askText } from "@/lib/ask-dialog";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { fetchCustomers } from "@/lib/customers-api";
import { fetchProducts } from "@/lib/products-api";
import {
  archiveSubscriptionPlan,
  cancelPreorder,
  cancelSubscription,
  changePromiseDate,
  closeCampaign,
  createPreorderCampaign,
  createSubscriptionPlan,
  fetchPreorderCampaigns,
  fetchSubscriptionPlans,
  fetchSubscriptions,
  fetchSubscriptionsSummary,
  fulfillPreorder,
  pauseSubscription,
  processDueRenewals,
  releaseCampaign,
  renewSubscription,
  reservePreorder,
  resumeSubscription,
  skipNextCycle,
  subscribeCustomer,
  type PreorderCampaign,
  type PromiseRisk,
  type SubscriptionInterval,
} from "@/lib/commerce-subscriptions-api";

const RISK_LABEL: Record<PromiseRisk, string> = {
  released: "Released",
  on_track: "On track",
  supply_short: "Supply short",
  past_promise: "Past promise date",
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

const fieldClass = "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--app-primary)]";
const fieldStyle = { borderColor: "var(--app-border)", background: "var(--app-surface)" };
const primaryButton = "rounded-lg px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50";
const dateInputToIso = (value: string) => new Date(`${value}T09:00:00`).toISOString();
const every = (interval: SubscriptionInterval, count: number) =>
  count === 1 ? (interval === "week" ? "Weekly" : "Monthly") : `Every ${count} ${interval}s`;

function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint: string; tone?: "warning" | "danger" }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
      <p className="m-0 text-xs font-semibold" style={{ color: "var(--app-text-faint)" }}>{label}</p>
      <p className="m-0 mt-1 text-2xl font-bold" style={{ color: tone === "danger" ? "var(--app-danger-strong)" : tone === "warning" ? "var(--app-warning-text)" : "var(--app-text)" }}>{value}</p>
      <p className="m-0 mt-1 text-xs" style={{ color: "var(--app-text-faintest)" }}>{hint}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--app-text-muted)" }}>
      {label}
      {children}
    </label>
  );
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(["subs-summary", "subs-plans", "subs-list", "subs-campaigns"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
}

/** Asks for a reason in an in-page dialog (min. 3 characters); null when cancelled. */
function askReason(message: string): Promise<string | null> {
  return askText({ title: message, minLength: 3, placeholder: "At least 3 characters" });
}

function SubscriptionsTab({ currency }: { currency: string }) {
  const refresh = useRefresh();
  const listQuery = useQuery({ queryKey: ["subs-list"], queryFn: fetchSubscriptions });
  const plansQuery = useQuery({ queryKey: ["subs-plans"], queryFn: fetchSubscriptionPlans });
  const customersQuery = useQuery({ queryKey: ["subs-customers"], queryFn: fetchCustomers });
  const [planId, setPlanId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [firstDate, setFirstDate] = useState("");
  const run = (fn: () => Promise<unknown>, done: string) =>
    fn()
      .then(async () => {
        await refresh();
        toast.success(done);
      })
      .catch((error) => toast.error(errorMessage(error, "That didn't work.")));
  const subscribe = useMutation({
    mutationFn: () => subscribeCustomer({ planId, customerId, firstRenewalAt: dateInputToIso(firstDate) }),
    onSuccess: async () => {
      await refresh();
      setCustomerId("");
      toast.success("Customer subscribed.");
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't subscribe this customer.")),
  });
  const due = useMutation({
    mutationFn: processDueRenewals,
    onSuccess: async (result) => {
      await refresh();
      toast.success(`${result.processed} renewal${result.processed === 1 ? "" : "s"} processed${result.failed ? `, ${result.failed} failed — see the list` : ""}.`);
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't process renewals.")),
  });
  const rows = listQuery.data ?? [];
  const activePlans = (plansQuery.data ?? []).filter((plan) => plan.status === "active");

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border p-3" style={{ borderColor: "var(--app-border)" }}>
        <Field label="Plan">
          <select value={planId} onChange={(event) => setPlanId(event.target.value)} className={fieldClass} style={fieldStyle}>
            <option value="">Choose plan</option>
            {activePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
          </select>
        </Field>
        <Field label="Customer">
          <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className={fieldClass} style={fieldStyle}>
            <option value="">Choose customer</option>
            {(customersQuery.data ?? []).map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.phone}</option>)}
          </select>
        </Field>
        <Field label="First renewal">
          <input type="date" value={firstDate} onChange={(event) => setFirstDate(event.target.value)} className={fieldClass} style={fieldStyle} />
        </Field>
        <button type="button" onClick={() => subscribe.mutate()} disabled={!planId || !customerId || !firstDate || subscribe.isPending} className={primaryButton} style={{ background: "var(--app-primary)" }}>Subscribe</button>
        <button type="button" onClick={() => due.mutate()} disabled={due.isPending} className="ml-auto rounded-lg border px-4 py-2 text-sm font-bold" style={{ borderColor: "var(--app-border)" }}>
          {due.isPending ? "Processing…" : "Process due renewals"}
        </button>
      </div>
      {listQuery.isLoading ? (
        <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading subscriptions…</p>
      ) : rows.length === 0 ? (
        <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>No subscriptions yet. Create a plan, then subscribe a customer to it.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead style={{ color: "var(--app-text-faint)", background: "var(--app-surface-2)" }}>
              <tr>
                <th className="px-3 py-2 font-semibold">Customer</th>
                <th className="px-3 py-2 font-semibold">Plan</th>
                <th className="px-3 py-2 font-semibold">Next renewal</th>
                <th className="px-3 py-2 font-semibold">Recent cycles</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t align-top" style={{ borderColor: "var(--app-border)" }}>
                  <td className="px-3 py-2"><Link href={`/customers/${row.customer.id}`} className="font-semibold underline">{row.customer.name}</Link></td>
                  <td className="px-3 py-2">
                    {row.plan.name}
                    <span className="block" style={{ color: "var(--app-text-faintest)" }}>
                      {row.plan.qtyPerCycle} × {row.plan.product.name} · {every(row.plan.interval, row.plan.intervalCount)} · {money(row.cycleValue, currency)}
                    </span>
                  </td>
                  <td className="px-3 py-2" style={{ color: row.due ? "var(--app-warning-text)" : undefined }}>
                    {row.status === "cancelled" ? "—" : formatDate(row.nextRenewalAt)}
                    {row.due ? " · due" : ""}
                    {row.skipNextCycle ? <span className="block">Next cycle will be skipped</span> : null}
                  </td>
                  <td className="px-3 py-2">
                    {row.recentCycles.length === 0 ? (
                      <span style={{ color: "var(--app-text-faintest)" }}>None yet</span>
                    ) : (
                      row.recentCycles.map((cycle) => (
                        <span key={cycle.id} className="block">
                          {formatDate(cycle.dueAt)}: {cycle.status === "skipped" ? "skipped" : cycle.order ? <Link href="/orders" className="underline">order #{cycle.order.orderNo}</Link> : "processing"}
                        </span>
                      ))
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-semibold" style={{ color: row.status === "active" ? "var(--app-success-text)" : "var(--app-text-faint)" }}>{row.status}</span>
                    {row.statusReason && <span className="block" style={{ color: "var(--app-text-faint)" }}>{row.statusReason}</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      {row.due && <button type="button" onClick={() => run(() => renewSubscription(row.id), "Renewal processed — an unpaid order was created.")} className="font-bold underline">Renew now</button>}
                      {row.status === "active" && row.plan.allowSkip && (
                        <button type="button" onClick={() => run(() => skipNextCycle(row.id, !row.skipNextCycle), row.skipNextCycle ? "Skip cleared." : "Next cycle will be skipped.")} className="font-bold underline">
                          {row.skipNextCycle ? "Unskip" : "Skip next"}
                        </button>
                      )}
                      {row.status === "active" && (
                        <button type="button" onClick={async () => { const reason = await askReason("Why pause this subscription?"); if (reason) void run(() => pauseSubscription(row.id, reason), "Subscription paused."); }} className="font-bold underline">Pause</button>
                      )}
                      {row.status === "paused" && <button type="button" onClick={() => run(() => resumeSubscription(row.id), "Subscription resumed.")} className="font-bold underline">Resume</button>}
                      {row.status !== "cancelled" && (
                        <button type="button" onClick={async () => { const reason = await askReason("Why cancel this subscription?"); if (reason) void run(() => cancelSubscription(row.id, reason), "Subscription cancelled."); }} className="font-bold underline" style={{ color: "var(--app-danger-strong)" }}>Cancel</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PlansTab({ currency }: { currency: string }) {
  const refresh = useRefresh();
  const plansQuery = useQuery({ queryKey: ["subs-plans"], queryFn: fetchSubscriptionPlans });
  const productsQuery = useQuery({ queryKey: ["subs-products"], queryFn: () => fetchProducts({ active: true }) });
  const [name, setName] = useState("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [interval, setInterval] = useState<SubscriptionInterval>("month");
  const [count, setCount] = useState("1");
  const [price, setPrice] = useState("");
  const create = useMutation({
    mutationFn: () =>
      createSubscriptionPlan({
        name: name.trim(),
        productId,
        qtyPerCycle: Math.max(Number.parseInt(qty, 10) || 1, 1),
        interval,
        intervalCount: Math.max(Number.parseInt(count, 10) || 1, 1),
        pricePerUnit: price.trim() === "" ? null : Number(price),
      }),
    onSuccess: async () => {
      await refresh();
      setName("");
      toast.success("Plan created.");
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't create this plan.")),
  });
  const archive = useMutation({
    mutationFn: archiveSubscriptionPlan,
    onSuccess: async () => {
      await refresh();
      toast.success("Plan archived. Existing subscribers keep renewing.");
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't archive this plan.")),
  });
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="grid grid-cols-2 gap-2 rounded-xl border p-3 md:grid-cols-6" style={{ borderColor: "var(--app-border)" }}>
        <Field label="Plan name"><input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} className={fieldClass} style={fieldStyle} /></Field>
        <Field label="Product">
          <select value={productId} onChange={(event) => setProductId(event.target.value)} className={fieldClass} style={fieldStyle}>
            <option value="">Choose</option>
            {(productsQuery.data ?? []).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
        </Field>
        <Field label="Qty per cycle"><input type="number" min={1} value={qty} onChange={(event) => setQty(event.target.value)} className={fieldClass} style={fieldStyle} /></Field>
        <Field label="Every">
          <div className="flex gap-1">
            <input type="number" min={1} max={52} value={count} onChange={(event) => setCount(event.target.value)} aria-label="Interval count" className="w-16 rounded-lg border px-2 py-2 text-sm" style={fieldStyle} />
            <select value={interval} onChange={(event) => setInterval(event.target.value as SubscriptionInterval)} aria-label="Interval unit" className={fieldClass} style={fieldStyle}>
              <option value="week">week(s)</option>
              <option value="month">month(s)</option>
            </select>
          </div>
        </Field>
        <Field label="Unit price (blank = product price)"><input type="number" min={0} step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} className={fieldClass} style={fieldStyle} /></Field>
        <div className="flex items-end">
          <button type="button" onClick={() => create.mutate()} disabled={name.trim().length < 2 || !productId || create.isPending} className={primaryButton} style={{ background: "var(--app-primary)" }}>Create plan</button>
        </div>
      </div>
      {(plansQuery.data ?? []).length === 0 ? (
        <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>No plans yet.</p>
      ) : (
        <ul className="m-0 flex flex-col gap-2 pl-0 text-xs">
          {(plansQuery.data ?? []).map((plan) => (
            <li key={plan.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2" style={{ borderColor: "var(--app-border)", listStyle: "none", opacity: plan.status === "archived" ? 0.6 : 1 }}>
              <span>
                <strong>{plan.name}</strong> · {plan.qtyPerCycle} × {plan.product.name} · {every(plan.interval, plan.intervalCount)} ·{" "}
                {plan.pricePerUnit === null ? `product price (${money(plan.product.sellingPrice, currency)})` : money(plan.pricePerUnit, currency)} per unit · {plan.activeSubscriptions} active
                {plan.status === "archived" ? " · archived" : ""}
              </span>
              {plan.status === "active" && <button type="button" onClick={() => archive.mutate(plan.id)} className="font-bold underline">Archive</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CampaignCard({ campaign }: { campaign: PreorderCampaign }) {
  const refresh = useRefresh();
  const customersQuery = useQuery({ queryKey: ["subs-customers"], queryFn: fetchCustomers });
  const [customerId, setCustomerId] = useState("");
  const [qty, setQty] = useState("1");
  const act = (fn: () => Promise<unknown>, done: string) =>
    fn()
      .then(async () => {
        await refresh();
        toast.success(done);
      })
      .catch((error) => toast.error(errorMessage(error, "That didn't work.")));
  const riskColor = campaign.risk === "on_track" || campaign.risk === "released" ? "var(--app-success-text)" : "var(--app-danger-strong)";
  return (
    <section className="rounded-xl border p-4" style={{ borderColor: "var(--app-border)" }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="m-0 text-sm font-bold">{campaign.name} · {campaign.product.name}</h3>
          <p className="m-0 mt-1 text-xs" style={{ color: "var(--app-text-faint)" }}>
            Promised {formatDate(campaign.promisedDate)} · {campaign.reservedUnits}
            {campaign.maxUnits !== null ? ` of ${campaign.maxUnits}` : ""} units reserved · {campaign.status}
          </p>
          <p className="m-0 mt-1 text-xs font-semibold" style={{ color: riskColor }}>
            {RISK_LABEL[campaign.risk]} — {campaign.supply.inStock} in stock + {campaign.supply.incomingBeforePromise} from production before the promise
            {campaign.supply.workOrders.length ? ` (${campaign.supply.workOrders.join(", ")})` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {campaign.status !== "released" && (
            <button type="button" onClick={async () => { const date = await askText({ title: "New promise date", placeholder: "YYYY-MM-DD" }); if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { if (date) toast.error("Use the format YYYY-MM-DD."); return; } const reason = await askReason("Why is the promise date changing?"); if (reason) void act(() => changePromiseDate(campaign.id, dateInputToIso(date), reason), "Promise date changed."); }} className="font-bold underline">Change promise date</button>
          )}
          {campaign.status === "open" && <button type="button" onClick={() => act(() => closeCampaign(campaign.id), "Campaign closed to new reservations.")} className="font-bold underline">Close</button>}
          {campaign.status !== "released" && <button type="button" onClick={() => act(() => releaseCampaign(campaign.id), "Marked released — reservations can now be fulfilled.")} className="font-bold underline" style={{ color: "var(--app-success-text)" }}>Mark released</button>}
        </div>
      </div>
      {campaign.status === "open" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} aria-label="Customer" className="rounded-lg border px-2 py-1.5" style={fieldStyle}>
            <option value="">Reserve for customer…</option>
            {(customersQuery.data ?? []).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
          <input type="number" min={1} value={qty} onChange={(event) => setQty(event.target.value)} aria-label="Quantity" className="w-20 rounded-lg border px-2 py-1.5" style={fieldStyle} />
          <button type="button" disabled={!customerId} onClick={() => act(() => reservePreorder(campaign.id, { customerId, qty: Math.max(Number.parseInt(qty, 10) || 1, 1) }), "Units reserved.")} className="rounded-lg px-3 py-1.5 font-bold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>Reserve</button>
        </div>
      )}
      {campaign.preorders.length > 0 && (
        <ul className="mb-0 mt-3 flex flex-col gap-1 pl-0 text-xs">
          {campaign.preorders.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2" style={{ listStyle: "none", opacity: row.status === "cancelled" ? 0.5 : 1 }}>
              <span>
                {row.customer.name} · {row.qty} unit{row.qty === 1 ? "" : "s"} · {row.status}
                {row.order ? ` · order #${row.order.orderNo}` : ""}
                {row.promiseChanged && row.status === "reserved" ? <span style={{ color: "var(--app-warning-text)" }}> · was promised {formatDate(row.promisedDate)}</span> : null}
              </span>
              {row.status === "reserved" && (
                <span className="flex gap-2">
                  {campaign.status === "released" && <button type="button" onClick={() => act(() => fulfillPreorder(row.id), "Unpaid order created for this pre-order.")} className="font-bold underline">Fulfil</button>}
                  <button type="button" onClick={async () => { const reason = await askReason("Why cancel this reservation?"); if (reason) void act(() => cancelPreorder(row.id, reason), "Reservation cancelled."); }} className="font-bold underline" style={{ color: "var(--app-danger-strong)" }}>Cancel</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PreordersTab() {
  const refresh = useRefresh();
  const campaignsQuery = useQuery({ queryKey: ["subs-campaigns"], queryFn: fetchPreorderCampaigns });
  const productsQuery = useQuery({ queryKey: ["subs-products"], queryFn: () => fetchProducts({ active: true }) });
  const [productId, setProductId] = useState("");
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [cap, setCap] = useState("");
  const create = useMutation({
    mutationFn: () => createPreorderCampaign({ productId, name: name.trim(), promisedDate: dateInputToIso(date), ...(cap.trim() ? { maxUnits: Number.parseInt(cap, 10) } : {}) }),
    onSuccess: async () => {
      await refresh();
      setName("");
      toast.success("Pre-order campaign opened.");
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't create this campaign.")),
  });
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border p-3" style={{ borderColor: "var(--app-border)" }}>
        <Field label="Product">
          <select value={productId} onChange={(event) => setProductId(event.target.value)} className={fieldClass} style={fieldStyle}>
            <option value="">Choose</option>
            {(productsQuery.data ?? []).filter((product) => product.kind === "product").map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
        </Field>
        <Field label="Campaign name"><input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} className={fieldClass} style={fieldStyle} /></Field>
        <Field label="Promised date"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={fieldClass} style={fieldStyle} /></Field>
        <Field label="Max units (optional)"><input type="number" min={1} value={cap} onChange={(event) => setCap(event.target.value)} className={fieldClass} style={fieldStyle} /></Field>
        <button type="button" onClick={() => create.mutate()} disabled={!productId || name.trim().length < 2 || !date || create.isPending} className={primaryButton} style={{ background: "var(--app-primary)" }}>Open campaign</button>
      </div>
      {campaignsQuery.isLoading ? (
        <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading campaigns…</p>
      ) : (campaignsQuery.data ?? []).length === 0 ? (
        <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>No pre-order campaigns yet.</p>
      ) : (
        (campaignsQuery.data ?? []).map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} />)
      )}
    </div>
  );
}

export function CommerceSubscriptionsView() {
  useModuleHeader({
    title: "Subscriptions & Pre-orders",
    subtitle: "Recurring orders and pre-orders that turn into real orders when they're due.",
  });
  const session = useSession();
  const currency = session.business.currency || "USD";
  const [tab, setTab] = useState<"subscriptions" | "plans" | "preorders">("subscriptions");
  const summaryQuery = useQuery({ queryKey: ["subs-summary"], queryFn: fetchSubscriptionsSummary });
  const summary = summaryQuery.data;
  const loading = summaryQuery.isLoading;

  return (
    <main className="flex flex-col gap-5 p-5 md:p-7" style={{ color: "var(--app-text)" }}>
      <p className="m-0 rounded-xl border px-4 py-3 text-xs" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)", color: "var(--app-text-muted)" }}>
        Renewals and fulfilled pre-orders create normal <strong>unpaid</strong> orders in <Link href="/orders" className="font-bold underline">Orders</Link>, which
        deduct stock as usual — collect payment there. Automatic card charging, failed-payment retries and dunning aren&rsquo;t available because no
        recurring-payment provider is connected. Renewals are processed when you press &ldquo;Process due renewals&rdquo;, not on a timer. Promise risk
        compares reservations with current stock plus open Production work orders due before the promise date.
      </p>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Kpi label="Active subscriptions" value={loading ? "…" : summary?.activeSubscriptions ?? "—"} hint={`${summary?.pausedSubscriptions ?? 0} paused`} />
        <Kpi label="Renewals due" value={loading ? "…" : summary?.renewalsDue ?? "—"} hint="Ready to create orders" tone={summary?.renewalsDue ? "warning" : undefined} />
        <Kpi label="Units, next 30 days" value={loading ? "…" : summary?.upcomingUnits30d ?? "—"} hint="Renewals not marked to skip" />
        <Kpi label="Recurring value / month" value={loading ? "…" : summary ? money(summary.recurringMonthlyValue, currency) : "—"} hint="Estimate at today's prices" />
        <Kpi label="Pre-order units" value={loading ? "…" : summary?.openPreorderUnits ?? "—"} hint="Reserved, not yet released" />
        <Kpi label="Promises at risk" value={loading ? "…" : summary?.promisesAtRisk ?? "—"} hint="Supply short or past the date" tone={summary?.promisesAtRisk ? "danger" : undefined} />
      </section>

      <section className="rounded-2xl border" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
        <div role="tablist" className="flex gap-4 border-b px-4 pt-3" style={{ borderColor: "var(--app-border)" }}>
          {([["subscriptions", "Subscriptions"], ["plans", "Plans"], ["preorders", "Pre-orders"]] as const).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className="border-b-2 pb-2.5 text-sm font-bold" style={{ borderColor: tab === key ? "var(--app-primary)" : "transparent", color: tab === key ? "var(--app-text)" : "var(--app-text-faint)" }}>
              {label}
            </button>
          ))}
        </div>
        {tab === "subscriptions" ? <SubscriptionsTab currency={currency} /> : tab === "plans" ? <PlansTab currency={currency} /> : <PreordersTab />}
      </section>
    </main>
  );
}

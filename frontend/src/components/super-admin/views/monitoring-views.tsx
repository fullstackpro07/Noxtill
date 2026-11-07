"use client";

import Link from "next/link";
import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { downloadCsv, qs, saApi, type ChannelUsage, type ModuleRegistry } from "@/lib/super-admin-api";
import { useAdminCan } from "@/store/super-admin-auth-store";
import { useDebounced } from "../use-debounced";
import {
  ActionDialog,
  Badge,
  Button,
  Card,
  DateInput,
  Empty,
  ErrorState,
  fmtAgo,
  fmtDateTime,
  fmtNum,
  fmtUsd,
  humanize,
  Loading,
  NotTracked,
  PageHeader,
  Pagination,
  RowLink,
  SearchBox,
  Select,
  Stat,
  StatusBadge,
  Table,
  Tabs,
  Td,
} from "../ui";
import { SecurityEventsTable } from "./tenant-tabs";

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

function RangePicker({ from, to, setFrom, setTo }: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void }) {
  return (
    <>
      <DateInput label="From" value={from} onChange={setFrom} />
      <DateInput label="To" value={to} onChange={setTo} />
    </>
  );
}

// ------------------------------------------------------------------ usage

export function UsageView() {
  const [tab, setTab] = useState("overview");
  const [from, setFrom] = useState(day(-29));
  const [to, setTo] = useState(day(0));
  const [metric, setMetric] = useState("");
  const [status, setStatus] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [page, setPage] = useState(1);
  const overview = useQuery({ queryKey: ["sa", "usage", from, to, metric], queryFn: () => saApi.usage({ from, to, metric }), enabled: tab === "overview" });
  const rp = { from, to, metric, status, businessId: businessId.trim(), page, pageSize: 50 };
  const records = useQuery({ queryKey: ["sa", "usage-records", rp], queryFn: () => saApi.usageRecords(rp), enabled: tab === "records", placeholderData: keepPreviousData });
  const meterOptions = [{ value: "", label: "All resources" }, ...(overview.data?.metrics ?? records.data?.items ?? []).map((m) => ("displayName" in m ? { value: m.metricCode, label: m.displayName } : { value: m.metricCode, label: m.metricCode }))];
  const uniqueOpts = meterOptions.filter((o, i) => meterOptions.findIndex((x) => x.value === o.value) === i);

  return (
    <>
      <PageHeader title="Usage & limits" subtitle="Metered consumption from the append-only usage event log. Per-business limits are managed on each business's Usage & limits tab." actions={<RangePicker from={from} to={to} setFrom={setFrom} setTo={setTo} />} />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "overview", label: "Overview" }, { key: "records", label: "Usage records" }]} />
      {tab === "overview" && (
        <>
          {overview.isPending && <Loading />}
          {overview.isError && <ErrorState error={overview.error} />}
          {overview.data && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Active seats (now)" value={fmtNum(overview.data.live.users)} hint="Distinct active members" />
                <Stat label="Active locations (now)" value={fmtNum(overview.data.live.locations)} />
                <Stat label="Provider cost" value={fmtUsd(overview.data.metrics.reduce((a, m) => a + m.costUsd, 0))} hint="Where the provider cost was recorded" />
                <Stat label="Billed price" value={fmtUsd(overview.data.metrics.reduce((a, m) => a + m.priceUsd, 0))} hint="Noxtill price on metered events" />
              </div>
              <Card title="Consumption by resource" pad={false}>
                <Table head={["Resource", "Kind", "Quantity", "Events", "Failed / refused", "Cost", "Price", ""]}>
                  {overview.data.metrics.map((m) => (
                    <tr key={m.metricCode}>
                      <Td>{m.displayName}<div className="font-mono text-[11px]">{m.unit}</div></Td>
                      <Td>{humanize(m.kind)}</Td>
                      <Td>{m.events ? fmtNum(m.quantity, 2) : <NotTracked>No events</NotTracked>}</Td>
                      <Td>{fmtNum(m.events)}</Td>
                      <Td>{fmtNum(m.failed)}</Td>
                      <Td>{m.costUsd ? fmtUsd(m.costUsd) : "—"}</Td>
                      <Td>{m.priceUsd ? fmtUsd(m.priceUsd) : "—"}</Td>
                      <Td><Button size="sm" variant="ghost" onClick={() => setMetric(m.metricCode)}>Top businesses</Button></Td>
                    </tr>
                  ))}
                </Table>
              </Card>
              {metric && (
                <Card title={`Top businesses — ${overview.data.metrics.find((m) => m.metricCode === metric)?.displayName ?? metric}`} actions={<Button size="sm" variant="ghost" onClick={() => setMetric("")}>Clear</Button>} pad={false}>
                  <Table head={["Business", "Quantity"]} empty={overview.data.top.length === 0 && <Empty>No usage in this range.</Empty>}>
                    {overview.data.top.map((t) => (
                      <tr key={t.businessId}>
                        <Td><RowLink href={`/super-admin/businesses/${t.businessId}?tab=limits`}>{t.name}</RowLink></Td>
                        <Td>{fmtNum(t.quantity, 2)}</Td>
                      </tr>
                    ))}
                  </Table>
                </Card>
              )}
            </div>
          )}
        </>
      )}
      {tab === "records" && (
        <Card pad={false}>
          <div className="flex flex-wrap items-center gap-2 border-b p-3" style={{ borderColor: "var(--app-border)" }}>
            <Select label="Resource" value={metric} onChange={(v) => { setMetric(v); setPage(1); }} options={uniqueOpts} />
            <Select label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "", label: "Any status" }, ...["completed", "failed", "refused", "duplicate", "allocated", "received"].map((s) => ({ value: s, label: humanize(s) }))]} />
            <SearchBox value={businessId} onChange={(v) => { setBusinessId(v); setPage(1); }} placeholder="Business ID" />
          </div>
          {records.isPending && <Loading />}
          {records.isError && <div className="p-4"><ErrorState error={records.error} /></div>}
          {records.data && (
            <>
              <Table head={["When", "Record ID", "Business", "User", "Resource", "Operation", "Quantity", "Cost", "Status", "Reference"]} empty={records.data.items.length === 0 && <Empty>No usage records.</Empty>}>
                {records.data.items.map((r) => (
                  <tr key={r.id}>
                    <Td className="whitespace-nowrap">{fmtDateTime(r.occurredAt)}</Td>
                    <Td mono>{r.id.slice(0, 8)}…</Td>
                    <Td><RowLink href={`/super-admin/businesses/${r.business.id}`}>{r.business.name}</RowLink></Td>
                    <Td>{r.user?.name ?? "—"}</Td>
                    <Td mono>{r.metricCode}</Td>
                    <Td mono>{r.operationCode ?? "—"}</Td>
                    <Td>{fmtNum(r.quantity, 2)} {r.unit}</Td>
                    <Td>{r.costUsd == null ? "—" : fmtUsd(r.costUsd)}</Td>
                    <Td><StatusBadge status={r.status} /></Td>
                    <Td mono className="max-w-[160px] truncate">{r.providerRef ?? "—"}</Td>
                  </tr>
                ))}
              </Table>
              <Pagination page={records.data.page} pageSize={records.data.pageSize} total={records.data.total} onPage={setPage} />
            </>
          )}
        </Card>
      )}
    </>
  );
}

// ---------------------------------------------------------------- modules

export function ModulesView() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["sa", "modules"], queryFn: saApi.modules });
  const canManage = useAdminCan("modules.manage");
  const [editing, setEditing] = useState<ModuleRegistry["modules"][number] | null>(null);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} />;
  return (
    <>
      <PageHeader title="Module registry" subtitle={`Global availability of every Noxtill module across ${fmtNum(q.data.totalBusinesses)} businesses. A global disable overrides every business and is enforced by the API.`} />
      <Card pad={false}>
        <Table head={["Module", "Group", "Global", "Turned off by owners", "Suspended by Noxtill", "Read-only by Noxtill", ""]}>
          {q.data.modules.map((m) => (
            <tr key={m.key}>
              <Td>
                <div className="font-semibold" style={{ color: "var(--app-text)" }}>{m.label}</div>
                <div className="text-[11.5px]">{m.description}</div>
                <div className="font-mono text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{m.key}</div>
              </Td>
              <Td>{m.group}</Td>
              <Td>
                {m.globallyDisabled ? <Badge tone="danger">Disabled</Badge> : <Badge tone="success">Available</Badge>}
                {m.globalReason && <div className="text-[11px]">{m.globalReason}</div>}
              </Td>
              <Td>{fmtNum(m.turnedOffByOwners)}</Td>
              <Td>{fmtNum(m.suspendedFor)}</Td>
              <Td>{fmtNum(m.restrictedFor)}</Td>
              <Td>{canManage && <Button size="sm" variant={m.globallyDisabled ? "primary" : "ghost"} onClick={() => setEditing(m)}>{m.globallyDisabled ? "Enable globally" : "Disable globally"}</Button>}</Td>
            </tr>
          ))}
        </Table>
        <p className="m-0 px-4 py-3 text-[12px]" style={{ color: "var(--app-text-faintest)" }}>
          Always on: {q.data.alwaysOn.map((a) => a.label).join(", ")}. Per-business access is set on each business&apos;s Modules & access tab.
        </p>
      </Card>
      {editing && (
        <ActionDialog
          title={`${editing.globallyDisabled ? "Enable" : "Disable"} ${editing.label} for every business`}
          danger={!editing.globallyDisabled}
          reauth
          confirmLabel={editing.globallyDisabled ? "Enable globally" : "Disable globally"}
          description={editing.globallyDisabled ? "Businesses that have it turned on get it back immediately." : "Every business loses access to this module on its next request. No data is deleted."}
          onClose={() => setEditing(null)}
          onConfirm={async (auth) => {
            await saApi.setGlobalModule(editing.key, { disabled: !editing.globallyDisabled, ...auth });
            toast.success("Module updated");
            await qc.invalidateQueries({ queryKey: ["sa"] });
          }}
        />
      )}
    </>
  );
}

// --------------------------------------------------------------------- AI

export function AiView() {
  const [from, setFrom] = useState(day(-29));
  const [to, setTo] = useState(day(0));
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const s = useDebounced(search);
  const q = useQuery({ queryKey: ["sa", "ai", from, to], queryFn: () => saApi.ai({ from, to }) });
  const balances = useQuery({ queryKey: ["sa", "ai-bal", s, page], queryFn: () => saApi.aiBalances({ search: s, page, pageSize: 25 }), placeholderData: keepPreviousData });
  return (
    <>
      <PageHeader title="AI credits" subtitle="From the credit ledger: every AI call reserves, then commits or releases, credits." actions={<RangePicker from={from} to={to} setFrom={setFrom} setTo={setTo} />} />
      {q.isPending && <Loading />}
      {q.isError && <ErrorState error={q.error} />}
      {q.data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <Stat label="Allocated (current periods)" value={fmtNum(q.data.currentPeriod.allocated)} hint={`${fmtNum(q.data.currentPeriod.businesses)} businesses`} />
            <Stat label="Consumed (current periods)" value={fmtNum(q.data.currentPeriod.consumed)} />
            <Stat label="Remaining" value={fmtNum(q.data.currentPeriod.remaining)} />
            <Stat label="Credits used in range" value={fmtNum(q.data.inRange.creditsConsumed)} />
            <Stat label="AI requests in range" value={fmtNum(q.data.inRange.requests)} />
            <Stat label="Failed / released" value={fmtNum(q.data.inRange.failedOrReleased)} hint="Not charged" />
            <Stat label="Avg response time" value={q.data.averageResponseMs == null ? <NotTracked>Not tracked</NotTracked> : `${q.data.averageResponseMs} ms`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="By feature (operation)" pad={false} className="lg:col-span-2">
              <Table head={["Module", "Operation", "Requests", "Credits"]} empty={q.data.byOperation.length === 0 && <Empty>No AI usage in range.</Empty>}>
                {q.data.byOperation.map((o) => (
                  <tr key={o.operationCode}>
                    <Td>{humanize(o.module)}</Td>
                    <Td mono>{o.operationCode}</Td>
                    <Td>{fmtNum(o.requests)}</Td>
                    <Td>{fmtNum(o.credits)}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
            <div className="space-y-4">
              <Card title="Top businesses" pad={false}>
                <Table head={["Business", "Credits"]} empty={q.data.byBusiness.length === 0 && <Empty>—</Empty>}>
                  {q.data.byBusiness.map((b) => (
                    <tr key={b.businessId}>
                      <Td><RowLink href={`/super-admin/businesses/${b.businessId}?tab=ai`}>{b.name}</RowLink></Td>
                      <Td>{fmtNum(b.credits)}</Td>
                    </tr>
                  ))}
                </Table>
              </Card>
              <Card title="By provider" pad={false}>
                <Table head={["Provider", "Credits", "Events"]} empty={q.data.byProvider.length === 0 && <Empty>No provider recorded on AI usage events.</Empty>}>
                  {q.data.byProvider.map((p) => (
                    <tr key={p.provider ?? "none"}>
                      <Td>{p.provider ?? <NotTracked>Not recorded</NotTracked>}</Td>
                      <Td>{fmtNum(p.credits)}</Td>
                      <Td>{fmtNum(p.events)}</Td>
                    </tr>
                  ))}
                </Table>
              </Card>
            </div>
          </div>
          <Card title="Balances" pad={false} actions={<div className="w-[260px]"><SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Business name or ID" /></div>}>
            {balances.data && (
              <>
                <Table head={["Business", "Period", "Included", "Used (incl.)", "Added remaining", "Added used", "Reserved"]} empty={balances.data.items.length === 0 && <Empty>No balances.</Empty>}>
                  {balances.data.items.map((b) => (
                    <tr key={b.businessId}>
                      <Td><RowLink href={`/super-admin/businesses/${b.businessId}?tab=ai`}>{b.name}</RowLink></Td>
                      <Td>{fmtDateTime(b.periodStart).replace(" UTC", "")} → {fmtDateTime(b.periodEnd)}</Td>
                      <Td>{fmtNum(b.included)}</Td>
                      <Td>{fmtNum(b.includedUsed)}</Td>
                      <Td>{fmtNum(b.purchasedRemaining)}</Td>
                      <Td>{fmtNum(b.purchasedUsed)}</Td>
                      <Td>{fmtNum(b.reserved)}</Td>
                    </tr>
                  ))}
                </Table>
                <Pagination page={balances.data.page} pageSize={balances.data.pageSize} total={balances.data.total} onPage={setPage} />
              </>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

// --------------------------------------------------------- communications

function ChannelPanel({ name, c }: { name: string; c: ChannelUsage }) {
  const sent = Object.entries(c.messages).reduce((a, [, n]) => a + n, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Stat label={`${name} queued/sent`} value={fmtNum(sent)} hint="Outbound messages created" />
        <Stat label="Delivered" value={fmtNum((c.messages.delivered ?? 0) + (c.messages.read ?? 0))} />
        <Stat label="Failed" value={fmtNum(c.messages.failed ?? 0)} tone={c.messages.failed ? "warning" : undefined} />
        <Stat label="Metered units" value={fmtNum(c.metered.quantity)} hint={c.metricCode} />
        <Stat label="Provider cost" value={fmtUsd(c.metered.costUsd)} />
        <Stat label="Noxtill price" value={fmtUsd(c.metered.priceUsd)} hint={`Margin ${fmtUsd(c.metered.marginUsd)}`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="By status">
          {Object.keys(c.messages).length === 0 ? <Empty>None.</Empty> : Object.entries(c.messages).map(([k, v]) => <div key={k} className="flex justify-between text-[13px]"><span>{humanize(k)}</span><b>{fmtNum(v)}</b></div>)}
          {c.connectedAccounts != null && <div className="mt-3 text-[12.5px]">Connected WhatsApp accounts: <b>{fmtNum(c.connectedAccounts)}</b></div>}
          {c.campaignEvents && (
            <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
              <div className="mb-1 text-[11px] font-bold uppercase" style={{ color: "var(--app-text-faintest)" }}>Campaign email events</div>
              {Object.keys(c.campaignEvents).length === 0 ? <span className="text-[12.5px]">None</span> : Object.entries(c.campaignEvents).map(([k, v]) => <div key={k} className="flex justify-between text-[13px]"><span>{humanize(k)}</span><b>{fmtNum(v)}</b></div>)}
            </div>
          )}
        </Card>
        <Card title="By message category">
          {Object.keys(c.categories).length === 0 ? <Empty>None.</Empty> : Object.entries(c.categories).map(([k, v]) => <div key={k} className="flex justify-between text-[13px]"><span>{humanize(k)}</span><b>{fmtNum(v)}</b></div>)}
        </Card>
        <Card title="By country (metered)" pad={false}>
          <Table head={["Country", "Units", "Cost", "Price"]} empty={c.byCountry.length === 0 && <Empty>No metered events.</Empty>}>
            {c.byCountry.map((r) => (
              <tr key={r.countryCode ?? "none"}>
                <Td>{r.countryCode ?? <NotTracked>Not recorded</NotTracked>}</Td>
                <Td>{fmtNum(r.quantity)}</Td>
                <Td>{fmtUsd(r.costUsd)}</Td>
                <Td>{fmtUsd(r.priceUsd)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
      <Card title="Top businesses" pad={false}>
        <Table head={["Business", "Units", "Cost", "Price"]} empty={c.topBusinesses.length === 0 && <Empty>No metered usage in range.</Empty>}>
          {c.topBusinesses.map((b) => (
            <tr key={b.businessId}>
              <Td><RowLink href={`/super-admin/businesses/${b.businessId}?tab=limits`}>{b.name}</RowLink></Td>
              <Td>{fmtNum(b.quantity)}</Td>
              <Td>{fmtUsd(b.costUsd)}</Td>
              <Td>{fmtUsd(b.priceUsd)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

export function CommunicationsView() {
  const [from, setFrom] = useState(day(-29));
  const [to, setTo] = useState(day(0));
  const [tab, setTab] = useState<"whatsapp" | "sms" | "email">("whatsapp");
  const q = useQuery({ queryKey: ["sa", "comms", from, to], queryFn: () => saApi.communications({ from, to }) });
  const c = q.data?.channels[tab];
  return (
    <>
      <PageHeader title="Communications" subtitle="Outbound messages (messages table) and metered units, cost and price (usage events). Incoming messages are never charged." actions={<RangePicker from={from} to={to} setFrom={setFrom} setTo={setTo} />} />
      <Tabs value={tab} onChange={(k) => setTab(k as typeof tab)} tabs={[{ key: "whatsapp", label: "WhatsApp" }, { key: "sms", label: "SMS" }, { key: "email", label: "Email" }]} />
      {q.isPending && <Loading />}
      {q.isError && <ErrorState error={q.error} />}
      {c && <ChannelPanel name={tab === "whatsapp" ? "WhatsApp" : tab === "sms" ? "SMS" : "Email"} c={c} />}
      {q.data && (
        <p className="mt-4 text-[12px]" style={{ color: "var(--app-text-faintest)" }}>
          Messaging spend caps set by businesses: {fmtNum(q.data.spendCaps.businesses)} businesses, {fmtUsd(q.data.spendCaps.totalCapUsd)} total monthly cap. Free vs billable WhatsApp conversation pricing is not broken out — only the metered cost and price recorded per event.
        </p>
      )}
    </>
  );
}

// ----------------------------------------------------------- integrations

export function IntegrationsView() {
  const [status, setStatus] = useState("");
  const [provider, setProvider] = useState("");
  const [page, setPage] = useState(1);
  const params = { status, provider, page, pageSize: 25 };
  const q = useQuery({ queryKey: ["sa", "integrations", params], queryFn: () => saApi.integrations(params), placeholderData: keepPreviousData });
  const providers = [...new Set((q.data?.summary ?? []).map((s) => s.provider))].sort();
  return (
    <>
      <PageHeader title="Integrations" subtitle="Connected services across all businesses. Tokens and secrets are never loaded into this console." />
      {q.data && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {q.data.summary.filter((s) => s.status !== "not_connected").map((s) => (
            <Badge key={`${s.provider}-${s.status}`} tone={s.status === "connected" ? "success" : "warning"}>
              {humanize(s.provider)} · {humanize(s.status)}: {s.count}
            </Badge>
          ))}
        </div>
      )}
      <Card pad={false}>
        <div className="flex flex-wrap gap-2 border-b p-3" style={{ borderColor: "var(--app-border)" }}>
          <Select label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "", label: "Connected or needs attention" }, { value: "connected", label: "Connected" }, { value: "needs_attention", label: "Needs attention" }]} />
          <Select label="Provider" value={provider} onChange={(v) => { setProvider(v); setPage(1); }} options={[{ value: "", label: "Any provider" }, ...providers.map((p) => ({ value: p, label: humanize(p) }))]} />
        </div>
        {q.isPending && <Loading />}
        {q.isError && <div className="p-4"><ErrorState error={q.error} /></div>}
        {q.data && (
          <>
            <Table head={["Business", "Provider", "Status", "Connected", "Last sync", "Last successful sync", "Last error"]} empty={q.data.items.length === 0 && <Empty>No integrations.</Empty>}>
              {q.data.items.map((i) => (
                <tr key={i.id}>
                  <Td><RowLink href={`/super-admin/businesses/${i.business.id}?tab=integrations`}>{i.business.name}</RowLink></Td>
                  <Td>{humanize(i.provider)}</Td>
                  <Td><StatusBadge status={i.status} /> {i.pausedAt && <Badge>Paused</Badge>}</Td>
                  <Td>{fmtDateTime(i.connectedAt)}</Td>
                  <Td>{fmtAgo(i.lastSyncAt)}</Td>
                  <Td>{i.lastSuccessfulSyncAt ? fmtAgo(i.lastSuccessfulSyncAt) : "—"}</Td>
                  <Td className="max-w-[300px]">{i.lastError ? <>{i.lastError.message ?? "Failed"}<div className="text-[11px]">{fmtDateTime(i.lastError.at)}</div></> : "—"}</Td>
                </tr>
              ))}
            </Table>
            <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}

// --------------------------------------------------------------- activity

export function ActivityView() {
  const canExport = useAdminCan("activity.export");
  const [source, setSource] = useState("activity");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [userId, setUserId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const s = useDebounced(search);
  const b = useDebounced(businessId);
  const u = useDebounced(userId);
  const params = { source, from, to, businessId: b.trim(), userId: u.trim(), search: s, page, pageSize: 50 };
  const q = useQuery({ queryKey: ["sa", "activity", params], queryFn: () => saApi.activities(params), placeholderData: keepPreviousData });
  const reset = (fn: (v: string) => void) => (v: string) => { fn(v); setPage(1); };
  return (
    <>
      <PageHeader
        title="Product activity"
        subtitle="What businesses and their users did across Noxtill. Passwords, tokens, card data and message contents are never shown here."
        actions={
          canExport && (
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const filters = { source, from, to, businessId: params.businessId, userId: params.userId, search: params.search };
                  await downloadCsv(`/activities/export${qs(filters)}`, `noxtill-activity-${source}.csv`);
                  toast.success("Export downloaded (recorded in the audit log)");
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          )
        }
      />
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-2 border-b p-3" style={{ borderColor: "var(--app-border)" }}>
          <Select label="Source" value={source} onChange={reset(setSource)} options={[{ value: "activity", label: "Product activity (sales, bookings, stock…)" }, { value: "changes", label: "Record changes (before/after)" }, { value: "events", label: "Product events (signup, first sale…)" }]} />
          <SearchBox value={search} onChange={reset(setSearch)} placeholder={source === "changes" ? "Action or record ID" : "Description or record ID"} />
          <SearchBox value={businessId} onChange={reset(setBusinessId)} placeholder="Business ID" />
          <SearchBox value={userId} onChange={reset(setUserId)} placeholder="User ID" />
          <RangePicker from={from} to={to} setFrom={reset(setFrom)} setTo={reset(setTo)} />
        </div>
        {q.isPending && <Loading />}
        {q.isError && <div className="p-4"><ErrorState error={q.error} /></div>}
        {q.data && (
          <>
            <Table head={["When", "Event ID", "Business", "User", "Module", "Action", "Resource", "Details"]} empty={q.data.items.length === 0 && <Empty>No activity matches.</Empty>}>
              {q.data.items.map((a) => (
                <tr key={a.id}>
                  <Td className="whitespace-nowrap">{fmtDateTime(a.createdAt)}</Td>
                  <Td mono>{a.id.slice(0, 8)}…</Td>
                  <Td>{a.business ? <Link className="hover:underline" href={`/super-admin/businesses/${a.business.id}`}>{a.business.name}</Link> : "—"}</Td>
                  <Td>{a.user ? <Link className="hover:underline" href={`/super-admin/users/${a.user.id}`}>{a.user.name}</Link> : "—"}</Td>
                  <Td>{a.module ? humanize(a.module) : "—"}</Td>
                  <Td>{a.action}</Td>
                  <Td mono>{a.resource ?? "—"}</Td>
                  <Td mono className="max-w-[280px] truncate">
                    {a.amount != null ? fmtNum(a.amount, 2) : a.after != null ? `→ ${JSON.stringify(a.after)}` : a.details ? JSON.stringify(a.details) : "—"}
                  </Td>
                </tr>
              ))}
            </Table>
            <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />
          </>
        )}
      </Card>
      <p className="mt-3 text-[12px]" style={{ color: "var(--app-text-faintest)" }}>IP address and device are recorded for sign-ins and sessions (see Security), not for each product action.</p>
    </>
  );
}

// --------------------------------------------------------------- security

export function SecurityView() {
  const [tab, setTab] = useState("overview");
  const [from, setFrom] = useState(day(-6));
  const [to, setTo] = useState(day(0));
  const overview = useQuery({ queryKey: ["sa", "security", from, to], queryFn: () => saApi.security({ from, to }), enabled: tab === "overview" });
  const [type, setType] = useState("");
  const [severity, setSeverity] = useState("");
  const [ip, setIp] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const ep = { type, severity, ip: useDebounced(ip).trim(), search: useDebounced(search), from, to, page, pageSize: 50 };
  const events = useQuery({ queryKey: ["sa", "sec-events", ep], queryFn: () => saApi.securityEvents(ep), enabled: tab === "events", placeholderData: keepPreviousData });
  const [sPage, setSPage] = useState(1);
  const [sSearch, setSSearch] = useState("");
  const sp = { search: useDebounced(sSearch), page: sPage, pageSize: 50 };
  const sessions = useQuery({ queryKey: ["sa", "sessions", sp], queryFn: () => saApi.sessions(sp), enabled: tab === "sessions", placeholderData: keepPreviousData });
  const o = overview.data;

  return (
    <>
      <PageHeader title="Security" subtitle="Authentication and access events for tenant users and admins, with documented severity rules." actions={tab !== "sessions" && <RangePicker from={from} to={to} setFrom={setFrom} setTo={setTo} />} />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "overview", label: "Overview" }, { key: "events", label: "Security events & login history" }, { key: "sessions", label: "Active sessions" }]} />
      {tab === "overview" && (
        <>
          {overview.isPending && <Loading />}
          {overview.isError && <ErrorState error={overview.error} />}
          {o && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
                <Stat label="Successful sign-ins" value={fmtNum(o.logins.successful)} hint={`${fmtNum(o.logins.newDevice)} from a new device`} />
                <Stat label="Failed sign-ins" value={fmtNum(o.logins.failed)} tone={o.logins.failed ? "warning" : undefined} />
                <Stat label="Lockouts" value={fmtNum(o.logins.lockouts)} tone={o.logins.lockouts ? "danger" : undefined} hint={`${fmtNum(o.lockedAccounts)} locked now`} />
                <Stat label="Active sessions (7d)" value={fmtNum(o.activeSessions)} />
                <Stat label="2FA enabled" value={`${fmtNum(o.mfa.enabled)} / ${fmtNum(o.mfa.total)}`} hint="Tenant users" />
                <Stat label="Suspended users" value={fmtNum(o.suspendedUsers)} />
                <Stat label="Blocked (suspended)" value={fmtNum(o.logins.blockedSuspended)} hint="Sign-ins refused" />
                <Stat label="Permission denied" value={fmtNum(o.permissionDenied)} />
                <Stat label="Rate limited" value={fmtNum(o.rateLimited)} />
                <Stat label="Admin failed sign-ins" value={fmtNum(o.admin.failed)} tone={o.admin.failed ? "danger" : undefined} />
                <Stat label="Admin lockouts" value={fmtNum(o.admin.lockouts)} tone={o.admin.lockouts ? "danger" : undefined} />
                <Stat label="Admin sessions open" value={fmtNum(o.admin.activeSessions)} />
              </div>
              <p className="m-0 text-[12px]" style={{ color: "var(--app-text-faintest)" }}>
                Security events are recorded from {o.trackingSince ? fmtDateTime(o.trackingSince) : "the first event onward (none yet)"}; there is no history before that. Not detected: {o.notDetected.join("; ")}.
              </p>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card title="High & critical alerts" pad={false}>
                  <SecurityEventsTable events={o.recentAlerts} />
                </Card>
                <Card title="Recent admin changes" pad={false}>
                  <Table head={["When", "Admin", "Action", "Reason"]} empty={o.recentAdminChanges.length === 0 && <Empty>No admin changes yet.</Empty>}>
                    {o.recentAdminChanges.map((a) => (
                      <tr key={a.id}>
                        <Td className="whitespace-nowrap">{fmtAgo(a.createdAt)}</Td>
                        <Td>{a.adminEmail}</Td>
                        <Td>{humanize(a.action)}</Td>
                        <Td>{a.reason}</Td>
                      </tr>
                    ))}
                  </Table>
                </Card>
              </div>
              <Card title="Severity rules">
                <ul className="m-0 list-disc space-y-1 ps-5 text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>
                  <li>Critical: an admin account locked out.</li>
                  <li>High: account lockout, 2FA turned off, any failed admin sign-in, or 5+ failures from the same identifier or IP within 15 minutes.</li>
                  <li>Medium: sign-in from a new device (IP + browser never seen for that user), failed 2FA code, password reset completed, rate limiting, sign-in refused for a suspended account.</li>
                  <li>Low: successful sign-in, single failed password, permission denied, session revoked, reset requested.</li>
                </ul>
              </Card>
            </div>
          )}
        </>
      )}
      {tab === "events" && (
        <Card pad={false}>
          <div className="flex flex-wrap items-center gap-2 border-b p-3" style={{ borderColor: "var(--app-border)" }}>
            <Select
              label="Event"
              value={type}
              onChange={(v) => { setType(v); setPage(1); }}
              options={[{ value: "", label: "Any event" }, ...["login_success", "login_new_device", "login_failed", "login_unknown_account", "account_locked", "login_blocked_suspended", "two_factor_failed", "two_factor_enabled", "two_factor_disabled", "password_reset_requested", "password_reset_completed", "session_revoked", "permission_denied", "rate_limited", "admin_login_success", "admin_login_failed", "admin_locked", "admin_totp_failed", "admin_totp_enrolled", "admin_session_revoked"].map((t) => ({ value: t, label: humanize(t) }))]}
            />
            <Select label="Severity" value={severity} onChange={(v) => { setSeverity(v); setPage(1); }} options={[{ value: "", label: "Any severity" }, ...["critical", "high", "medium", "low"].map((s) => ({ value: s, label: humanize(s) }))]} />
            <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Login identifier (email/phone)" />
            <SearchBox value={ip} onChange={(v) => { setIp(v); setPage(1); }} placeholder="IP address" />
          </div>
          {events.isPending && <Loading />}
          {events.isError && <div className="p-4"><ErrorState error={events.error} /></div>}
          {events.data && (
            <>
              <SecurityEventsTable events={events.data.items} />
              <Pagination page={events.data.page} pageSize={events.data.pageSize} total={events.data.total} onPage={setPage} />
            </>
          )}
        </Card>
      )}
      {tab === "sessions" && (
        <Card pad={false}>
          <div className="border-b p-3" style={{ borderColor: "var(--app-border)" }}>
            <SearchBox value={sSearch} onChange={(v) => { setSSearch(v); setSPage(1); }} placeholder="User name, email or IP address" />
          </div>
          {sessions.isPending && <Loading />}
          {sessions.data && (
            <>
              <Table head={["User", "Business", "IP address", "Device", "Signed in", "Last used"]} empty={sessions.data.items.length === 0 && <Empty>No open sessions.</Empty>}>
                {sessions.data.items.map((s) => (
                  <tr key={s.id}>
                    <Td>{s.user ? <Link className="hover:underline" href={`/super-admin/users/${s.user.id}`}>{s.user.name}</Link> : "—"}</Td>
                    <Td>{s.business ? <Link className="hover:underline" href={`/super-admin/businesses/${s.business.id}`}>{s.business.name}</Link> : "—"}</Td>
                    <Td mono>{s.ipAddress ?? "Not recorded"}</Td>
                    <Td className="max-w-[300px] truncate">{s.userAgent ?? "Not recorded"}</Td>
                    <Td>{fmtDateTime(s.createdAt)}</Td>
                    <Td>{fmtAgo(s.lastUsedAt)}</Td>
                  </tr>
                ))}
              </Table>
              <Pagination page={sessions.data.page} pageSize={sessions.data.pageSize} total={sessions.data.total} onPage={setSPage} />
            </>
          )}
          <p className="m-0 px-4 py-3 text-[12px]" style={{ color: "var(--app-text-faintest)" }}>
            &ldquo;Last used&rdquo; updates when the app refreshes its token (about every 15 minutes while in use). Revoke a session from the user&apos;s page.
          </p>
        </Card>
      )}
    </>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { saApi } from "@/lib/super-admin-api";
import { Badge, Card, DateInput, Empty, ErrorState, fmtAgo, fmtNum, fmtUsd, humanize, Loading, PageHeader, Stat, StatusBadge } from "../ui";

function isoDay(offset: number) {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
}

function DailyBars({ data, label }: { data: { date: string; count: number }[]; label: string }) {
  const total = data.reduce((a, d) => a + d.count, 0);
  return (
    <Card title={label} actions={<span className="text-[12px] font-bold" style={{ color: "var(--app-text-faint)" }}>{fmtNum(total)} total</span>}>
      {total === 0 ? (
        <Empty>Nothing recorded in this range.</Empty>
      ) : (
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }} barCategoryGap={2}>
              <CartesianGrid vertical={false} stroke="var(--app-border)" />
              <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 10, fill: "var(--app-text-faintest)" }} axisLine={false} tickLine={false} minTickGap={16} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--app-text-faintest)" }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: "var(--app-surface-2)" }}
                contentStyle={{ borderRadius: 10, border: "1px solid var(--app-border)", fontSize: 12 }}
                formatter={(v) => [fmtNum(Number(v)), label]}
                labelFormatter={(l) => `${String(l)} (UTC)`}
              />
              <Bar dataKey="count" fill="var(--app-primary)" radius={[4, 4, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function Distribution({ rows, total }: { rows: { label: string; value: number }[]; total: number }) {
  if (!rows.length) return <Empty>No data.</Empty>;
  return (
    <ul className="m-0 list-none space-y-2.5 p-0">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${fmtNum(r.value)}`}>
          <div className="flex justify-between text-[12.5px]">
            <span style={{ color: "var(--app-text-muted)" }}>{r.label}</span>
            <span className="font-bold" style={{ color: "var(--app-text)" }}>
              {fmtNum(r.value)}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--app-border)" }}>
            <div className="h-full rounded-full" style={{ width: `${total ? (r.value / total) * 100 : 0}%`, background: "var(--app-primary)" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DashboardView() {
  const [from, setFrom] = useState(isoDay(-29));
  const [to, setTo] = useState(isoDay(0));
  const summary = useQuery({ queryKey: ["sa", "dashboard", from, to], queryFn: () => saApi.dashboard({ from, to }) });
  const feed = useQuery({ queryKey: ["sa", "feed"], queryFn: saApi.feed });
  const d = summary.data;

  return (
    <>
      <PageHeader
        title="Platform dashboard"
        subtitle="Live figures computed from Noxtill's own records. Reporting timezone: UTC."
        actions={
          <>
            <DateInput label="From" value={from} onChange={setFrom} />
            <DateInput label="To" value={to} onChange={setTo} />
          </>
        }
      />
      {summary.isPending && <Loading />}
      {summary.isError && <ErrorState error={summary.error} onRetry={() => summary.refetch()} />}
      {d && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            <Stat label="Businesses" value={fmtNum(d.kpis.totalBusinesses)} hint={`${fmtNum(d.kpis.activeBusinesses)} with access`} />
            <Stat label="On trial" value={fmtNum(d.kpis.trialBusinesses)} />
            <Stat label="Suspended" value={fmtNum(d.kpis.suspendedBusinesses)} tone={d.kpis.suspendedBusinesses ? "danger" : undefined} hint={`${fmtNum(d.kpis.archivedBusinesses)} archived`} />
            <Stat label="Users" value={fmtNum(d.kpis.totalUsers)} hint={`${fmtNum(d.kpis.activeUsers30d)} active in 30 days`} />
            <Stat label="MRR" value={fmtUsd(d.kpis.mrrUsd)} hint="List price basis" />
            <Stat label="ARR" value={fmtUsd(d.kpis.arrUsd)} hint="MRR × 12" />
            <Stat label="Active subscriptions" value={fmtNum(d.kpis.activeSubscriptions)} hint={`${fmtNum(d.kpis.cancellingSubscriptions)} set to cancel`} />
            <Stat label="Past due" value={fmtNum(d.kpis.pastDueSubscriptions)} tone={d.kpis.pastDueSubscriptions ? "warning" : undefined} hint={`${fmtNum(d.kpis.pausedSubscriptions)} paused`} />
            <Stat label="AI credits used" value={fmtNum(d.kpis.aiCreditsConsumed)} hint="In range" />
            <Stat label="Metered events" value={fmtNum(d.kpis.meteredEvents)} hint="In range" />
            <Stat label="Trial → paid" value={fmtNum(d.subscriptions.trialConversions)} hint={`${fmtNum(d.subscriptions.trialsEndedWithoutPlan)} trials lapsed`} />
            <Stat label="Cancellations" value={fmtNum(d.subscriptions.cancellations)} hint="In range" />
          </div>
          <p className="m-0 text-[12px]" style={{ color: "var(--app-text-faintest)" }}>
            Revenue: {d.revenueBasis}
            {d.kpis.businessesWithoutSubscriptionRecord > 0 &&
              ` ${fmtNum(d.kpis.businessesWithoutSubscriptionRecord)} business(es) have no subscription record yet (one is created the first time the business is used).`}
          </p>

          <div className="grid gap-4 lg:grid-cols-2">
            <DailyBars data={d.trends.businessRegistrations} label="Business registrations" />
            <DailyBars data={d.trends.userRegistrations} label="User registrations" />
            <DailyBars data={d.trends.dailySignIns} label="Daily sign-ins (distinct users)" />
            <DailyBars data={d.trends.failedLogins} label="Failed sign-ins" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Subscriptions by plan">
              <Distribution rows={d.subscriptions.byPlan.map((p) => ({ label: p.name, value: p.count }))} total={d.subscriptions.byPlan.reduce((a, p) => a + p.count, 0)} />
            </Card>
            <Card title="Subscriptions by status">
              <Distribution
                rows={d.subscriptions.byStatus.filter((s) => s.count > 0).map((s) => ({ label: humanize(s.status), value: s.count }))}
                total={d.subscriptions.byStatus.reduce((a, s) => a + s.count, 0)}
              />
            </Card>
            <Card title="Communications (in range)">
              <Distribution
                rows={[
                  { label: "WhatsApp messages", value: d.communications.whatsapp },
                  { label: "SMS segments", value: d.communications.sms },
                  { label: "Emails", value: d.communications.email },
                ]}
                total={Math.max(d.communications.whatsapp, d.communications.sms, d.communications.email)}
              />
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
            <Card title="Businesses using each module">
              <Distribution
                rows={[...d.modules].sort((a, b) => b.enabledFor - a.enabledFor).map((m) => ({ label: m.label, value: m.enabledFor }))}
                total={d.kpis.totalBusinesses}
              />
            </Card>
            <Card title="Recent platform activity" pad={false}>
              {feed.isPending && <Loading />}
              {feed.isError && <div className="p-4"><ErrorState error={feed.error} /></div>}
              {feed.data && feed.data.items.length === 0 && <Empty>No activity yet.</Empty>}
              <ul className="m-0 list-none p-0">
                {feed.data?.items.map((i, idx) => (
                  <li key={`${i.kind}-${idx}`} className="border-b px-5 py-2.5 last:border-0" style={{ borderColor: "var(--app-border)" }}>
                    <Link href={i.href} className="flex items-start justify-between gap-3 hover:underline">
                      <span className="text-[13px]" style={{ color: "var(--app-text-muted)" }}>
                        {i.severity && <span className="me-1.5"><StatusBadge status={i.severity} /></span>}
                        {i.title}
                      </span>
                      <span className="shrink-0 text-[11.5px]" style={{ color: "var(--app-text-faintest)" }}>
                        <Badge>{humanize(i.kind)}</Badge> {fmtAgo(i.at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          {d.notTracked.length > 0 && (
            <p className="m-0 text-[12px]" style={{ color: "var(--app-text-faintest)" }}>
              Not tracked: {d.notTracked.join("; ")}.
            </p>
          )}
        </div>
      )}
    </>
  );
}

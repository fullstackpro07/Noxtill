"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, RefreshCw, Send } from "lucide-react";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { websiteApi } from "@/lib/website-api";
import { Btn, Card, Empty, Kpi, Notice, Page, StatusBadge, errorText, formatDate, money } from "./website-ui";

const ACTION_LABELS: Record<string, string> = {
  "website.deployment.published": "Published",
  "website.deployment.rolled_back": "Rolled back",
  "website.navigation.changed": "Menu edited",
  "website.theme.changed": "Theme edited",
  "website.settings.changed": "Settings changed",
  "website.maintenance.changed": "Maintenance mode changed",
  "website.form.created": "Form created",
  "website.form.changed": "Form edited",
  "website.domain.added": "Domain added",
  "website.domain.verified": "Domain checked",
  "website.ai_builder.generated": "Drafts generated",
};

export function WebsiteOverviewView() {
  const qc = useQueryClient();
  const [days, setDays] = useState(30);
  const q = useQuery({ queryKey: ["website", "overview", days], queryFn: () => websiteApi.overview(days) });
  const publish = useMutation({ mutationFn: () => websiteApi.publishSite(), onSuccess: () => void qc.invalidateQueries({ queryKey: ["website"] }) });
  const d = q.data;

  useModuleHeader({
    title: "Website & Commerce",
    subtitle: "Your owned website: publishing, health and leads",
    actions: (
      <div className="flex items-center gap-2">
        <select aria-label="Period" className="rounded-lg border px-2 py-1.5 text-xs" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }} value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
        <button type="button" aria-label="Refresh" onClick={() => void q.refetch()} className="rounded-lg border p-2" style={{ borderColor: "var(--app-border)" }}>
          <RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} aria-hidden />
        </button>
      </div>
    ),
  });

  if (q.isLoading) return <Page><p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading…</p></Page>;
  if (q.isError || !d) return <Page><Notice tone="danger">{errorText(q.error, "Couldn't load the website overview.")}</Notice></Page>;

  const pendingSite = d.pending.navigation || d.pending.theme || d.pending.settings;
  const statusLabel = d.siteStatus === "live" ? "Live" : d.siteStatus === "maintenance" ? "Maintenance" : "Not published";

  return (
    <Page>
      {d.siteStatus === "not_published" && (
        <Notice tone="warn">
          Nothing is published yet. Start with <Link className="font-semibold underline" href="/website/builder">AI Website Builder</Link> or create a page in <Link className="font-semibold underline" href="/website/pages">Pages</Link>, then publish it.
        </Notice>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Site status" value={<StatusBadge status={d.siteStatus} label={statusLabel} />} hint={d.siteStatus !== "not_published" ? <a className="underline" href={d.hostedPath} target="_blank" rel="noreferrer">{d.hostedPath}</a> : "No live version"} />
        <Kpi label="Last publish" value={d.lastPublish ? `#${d.lastPublish.number}` : "—"} hint={d.lastPublish ? `${formatDate(d.lastPublish.at)}${d.lastPublish.by ? ` · ${d.lastPublish.by}` : ""}` : "Never published"} />
        <Kpi label="Sessions" value="Not tracked" hint={d.kpis.sessions.detail} />
        <Kpi label="Conversion rate" value="Not tracked" hint={d.kpis.conversion.detail} />
        <Kpi label={`Form leads (${d.periodDays}d)`} value={d.kpis.formLeads.value} hint={`${d.kpis.formLeads.spamBlocked} spam blocked · source: Website forms → CRM`} tone={d.kpis.formLeads.failed ? "danger" : undefined} />
        <Kpi label={`Storefront orders (${d.periodDays}d)`} value={d.kpis.storefrontOrders.value} hint={`${money(d.kpis.storefrontOrders.total, d.business.currency)} · source: Orders`} />
        <Kpi label="Live pages" value={d.kpis.livePages.value} hint={`${d.kpis.livePages.drafts} drafts · ${d.kpis.livePages.scheduled} scheduled`} />
        <Kpi label="Open site issues" value={d.kpis.openIssues} tone={d.issues.some((i) => i.severity === "high") ? "danger" : d.kpis.openIssues ? "warn" : "ok"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          title="Publishing status"
          className="lg:col-span-2"
          actions={
            <>
              <Link href="/website/pages" className="rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--app-border)" }}>Edit site</Link>
              {d.siteStatus !== "not_published" && (
                <a href={d.hostedPath} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--app-border)" }}>
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Visit site
                </a>
              )}
              <Btn variant="primary" disabled={!pendingSite || publish.isPending} onClick={() => publish.mutate()}>
                <Send className="h-3.5 w-3.5" aria-hidden /> Publish menu, theme &amp; settings
              </Btn>
            </>
          }
        >
          {publish.isError && <Notice tone="danger">{errorText(publish.error)}</Notice>}
          {publish.isSuccess && <Notice tone="ok">Published as deployment #{publish.data.number}.</Notice>}
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-xs">
            {(["navigation", "theme", "settings"] as const).map((k) => (
              <li key={k} className="flex items-center justify-between">
                <span className="capitalize">{k === "navigation" ? "Menus" : k}</span>
                {d.pending[k] ? <StatusBadge status="pending" label="Unpublished changes" /> : <StatusBadge status="live" label="Up to date" />}
              </li>
            ))}
            <li className="flex items-center justify-between">
              <span>Pages with saved edits not yet live</span>
              <span>{d.pending.pagesWithUnpublishedEdits.length ? d.pending.pagesWithUnpublishedEdits.map((p) => p.title).join(", ") : "None"}</span>
            </li>
          </ul>
        </Card>

        <Card title="Lead & order funnel">
          <dl className="m-0 grid grid-cols-[1fr_auto] gap-y-1.5 text-xs">
            <dt>Forms on live pages</dt><dd className="m-0 font-bold">{d.funnel.formsLive}</dd>
            <dt>Leads written to CRM</dt><dd className="m-0 font-bold">{d.funnel.leads}</dd>
            <dt>Storefront orders</dt><dd className="m-0 font-bold">{d.funnel.orders}</dd>
            <dt>Visits</dt><dd className="m-0" style={{ color: "var(--app-text-faint)" }}>Not tracked</dd>
          </dl>
          <p className="m-0 mt-2 text-[11px]" style={{ color: "var(--app-text-faint)" }}>Deeper analytics stay in <Link className="underline" href="/marketing/analytics">Marketing</Link> and <Link className="underline" href="/business-intelligence">Business Intelligence</Link>.</p>
        </Card>
      </div>

      <Card title={`Site health issues (${d.issues.length})`}>
        {d.issues.length === 0 ? (
          <Empty>No issues found on the live site.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead style={{ color: "var(--app-text-faint)" }}>
                <tr><th className="py-2 pr-2">Severity</th><th className="py-2 pr-2">Issue</th><th className="py-2 pr-2">Page</th><th className="py-2 pr-2">Impact</th><th className="py-2 pr-2">Detected</th><th className="py-2 pr-2">Owner module</th><th /></tr>
              </thead>
              <tbody>
                {d.issues.map((i) => (
                  <tr key={i.key} className="border-t" style={{ borderColor: "var(--app-border)" }}>
                    <td className="py-2 pr-2"><StatusBadge status={i.severity} /></td>
                    <td className="py-2 pr-2 font-semibold">{i.issue}</td>
                    <td className="py-2 pr-2">{i.page ?? "Site-wide"}</td>
                    <td className="py-2 pr-2" style={{ color: "var(--app-text-muted)" }}>{i.impact}</td>
                    <td className="py-2 pr-2">{formatDate(i.detected)}</td>
                    <td className="py-2 pr-2">{i.sourceModule}</td>
                    <td className="py-2 pr-2"><Link className="underline" href={i.href}>Fix</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Live pages">
          {d.topPages.length === 0 ? (
            <Empty>No live pages.</Empty>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-xs">
              {d.topPages.map((p) => (
                <li key={p.id} className="flex justify-between gap-2"><a className="underline" href={`${d.hostedPath}${p.path === "/" ? "" : p.path}`} target="_blank" rel="noreferrer">{p.title}</a><span style={{ color: "var(--app-text-faint)" }}>{p.path}</span></li>
              ))}
            </ul>
          )}
          <p className="m-0 mt-2 text-[11px]" style={{ color: "var(--app-text-faint)" }}>Page views are not tracked, so pages are not ranked by traffic.</p>
        </Card>
        <Card title="Recent changes">
          {d.recentChanges.length === 0 ? (
            <Empty>No changes yet.</Empty>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-xs">
              {d.recentChanges.map((c, i) => (
                <li key={i} className="flex justify-between gap-2"><span>{ACTION_LABELS[c.action] ?? c.action.replace("website.", "").replace(/[._]/g, " ")}</span><span style={{ color: "var(--app-text-faint)" }}>{formatDate(c.at)}</span></li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Recommendations from other modules">
          <div className="flex flex-col gap-2 text-xs">
            <Link href={d.handoffs.seo.href} className="rounded-lg border p-2 hover:underline" style={{ borderColor: "var(--app-border)" }}>
              <strong>SEO Autopilot</strong>: {d.handoffs.seo.openIssues} open SEO issue{d.handoffs.seo.openIssues === 1 ? "" : "s"}
            </Link>
            <Link href={d.handoffs.storeOptimizer.href} className="rounded-lg border p-2 hover:underline" style={{ borderColor: "var(--app-border)" }}>
              <strong>Store Optimizer</strong>: {d.handoffs.storeOptimizer.openOpportunities} open opportunit{d.handoffs.storeOptimizer.openOpportunities === 1 ? "y" : "ies"}
            </Link>
            <p className="m-0 text-[11px]" style={{ color: "var(--app-text-faint)" }}>SEO and conversion work stay in their own modules; this is a preview.</p>
          </div>
        </Card>
      </div>
    </Page>
  );
}

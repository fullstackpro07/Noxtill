"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, Plus, RotateCcw, ShieldCheck, Star, Trash2 } from "lucide-react";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { websiteApi } from "@/lib/website-api";
import { Btn, Card, Empty, Field, Kpi, Notice, Page, StatusBadge, errorText, formatDate, inputClass, inputStyle } from "./website-ui";

export function WebsiteDomainsView() {
  useModuleHeader({ title: "Domains & Publishing", subtitle: "Domains, DNS verification, deploy history, redirects and maintenance" });
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["website", "domains"], queryFn: websiteApi.domains });
  const [hostname, setHostname] = useState("");
  const [redirect, setRedirect] = useState({ fromPath: "", toPath: "", permanent: true });
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const act = useMutation({
    mutationFn: async ({ fn }: { fn: () => Promise<unknown>; ok: string }) => fn(),
    onSuccess: (_d, v) => { setMessage({ tone: "ok", text: v.ok }); void qc.invalidateQueries({ queryKey: ["website"] }); },
    onError: (e) => setMessage({ tone: "danger", text: errorText(e) }),
  });
  const run = (ok: string, fn: () => Promise<unknown>) => act.mutate({ fn, ok });

  if (q.isLoading) return <Page><p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading…</p></Page>;
  if (q.isError || !q.data) return <Page><Notice tone="danger">{errorText(q.error)}</Notice></Page>;
  const d = q.data;
  const primary = d.domains.find((x) => x.isPrimary);
  const lastDeploy = d.deployments[0];

  return (
    <Page>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Primary domain" value={primary?.hostname ?? "Hosted address"} hint={primary ? undefined : d.hostedUrl} />
        <Kpi label="Verified domains" value={`${d.domains.filter((x) => x.status === "verified").length}/${d.domains.length}`} />
        <Kpi label="SSL" value={d.domains.some((x) => x.ssl.status === "invalid") ? "Problem" : d.domains.some((x) => x.ssl.status === "valid") ? "Valid" : "Not checked"} tone={d.domains.some((x) => x.ssl.status === "invalid") ? "danger" : undefined} />
        <Kpi label="Last deploy" value={lastDeploy ? `#${lastDeploy.number}` : "—"} hint={lastDeploy ? formatDate(lastDeploy.createdAt) : undefined} />
        <Kpi label="Failed scheduled publishes" value={d.failedScheduledPublishes} tone={d.failedScheduledPublishes ? "danger" : undefined} />
        <Kpi label="Redirects" value={d.redirects.length} />
      </div>

      <Notice tone="warn">{d.customDomainRouting.detail} Hosted address: <a className="font-semibold underline" href={d.hostedUrl} target="_blank" rel="noreferrer">{d.hostedUrl}</a></Notice>

      <Card
        title="Domains"
        actions={
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (hostname.trim()) run(`Added ${hostname}. Add the DNS record below, then press Verify.`, async () => { await websiteApi.addDomain(hostname); setHostname(""); }); }}>
            <input aria-label="Domain" className={inputClass} style={{ ...inputStyle, width: 220 }} placeholder="shop.example.com" value={hostname} onChange={(e) => setHostname(e.target.value)} />
            <Btn type="submit" variant="primary" disabled={!hostname.trim()}><Plus className="h-3.5 w-3.5" aria-hidden /> Add domain</Btn>
          </form>
        }
      >
        {d.domains.length === 0 ? (
          <Empty>No custom domains. Your site is available at the hosted address above.</Empty>
        ) : (
          <div className="flex flex-col gap-3">
            {d.domains.map((dom) => (
              <div key={dom.id} className="rounded-xl border p-3 text-xs" style={{ borderColor: "var(--app-border)" }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="m-0 flex items-center gap-2 text-sm font-bold"><Globe className="h-4 w-4" aria-hidden /> {dom.hostname} <StatusBadge status={dom.status} />{dom.isPrimary && <StatusBadge status="live" label="Primary" />}</p>
                  <div className="flex gap-2">
                    <Btn onClick={() => run(`Checked ${dom.hostname}.`, () => websiteApi.verifyDomain(dom.id))}><ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Verify / re-check</Btn>
                    {!dom.isPrimary && <Btn disabled={dom.status !== "verified"} onClick={() => { if (window.confirm(`Make ${dom.hostname} the primary domain?`)) run(`${dom.hostname} is now primary.`, () => websiteApi.primaryDomain(dom.id)); }}><Star className="h-3.5 w-3.5" aria-hidden /> Set primary</Btn>}
                    <Btn variant="danger" onClick={() => { if (window.confirm(`Remove ${dom.hostname}?`)) run("Domain removed.", () => websiteApi.removeDomain(dom.id)); }}><Trash2 className="h-3.5 w-3.5" aria-hidden /></Btn>
                  </div>
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  <div><p className="m-0 font-semibold">DNS record to add</p><p className="m-0 font-mono">{dom.verificationRecord.type} {dom.verificationRecord.name}</p><p className="m-0 break-all font-mono">{dom.verificationRecord.value}</p></div>
                  <div><p className="m-0 font-semibold">Verification</p><p className="m-0">{dom.lastCheckedAt ? `Checked ${formatDate(dom.lastCheckedAt)}` : "Not checked yet"}</p>{dom.lastError && <p className="m-0" style={{ color: "var(--app-danger-strong)" }}>{dom.lastError}</p>}</div>
                  <div><p className="m-0 font-semibold">SSL certificate</p>{dom.ssl.status === "not_checked" ? <p className="m-0">Checked after the domain verifies.</p> : <p className="m-0" style={{ color: dom.ssl.error ? "var(--app-danger-strong)" : undefined }}>{dom.ssl.error ?? `Valid until ${formatDate(dom.ssl.validTo)}`}</p>}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Deploy history">
          {d.deployments.length === 0 ? (
            <Empty>Nothing has been published yet.</Empty>
          ) : (
            <ul className="m-0 flex max-h-96 list-none flex-col gap-2 overflow-auto p-0 text-xs">
              {d.deployments.map((dep) => (
                <li key={dep.id} className="flex items-center justify-between gap-2 rounded-lg border p-2" style={{ borderColor: dep.live ? "var(--app-success-border)" : "var(--app-border)" }}>
                  <span>
                    <strong>#{dep.number}</strong> {dep.live && <StatusBadge status="live" />} {dep.kind === "rollback" && <StatusBadge status="pending" label={`Rollback to #${dep.restoredFrom}`} />}
                    <br />
                    {dep.summary} · {formatDate(dep.createdAt)}{dep.actorName ? ` · ${dep.actorName}` : dep.kind === "publish" && !dep.actorName ? " · scheduled" : ""}
                  </span>
                  {!dep.live && <Btn onClick={() => { if (window.confirm(`Roll the live site back to deployment #${dep.number}? Orders, products and customers are not affected.`)) run(`Rolled back to #${dep.number}.`, () => websiteApi.rollback(dep.id)); }}><RotateCcw className="h-3.5 w-3.5" aria-hidden /> Roll back</Btn>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card title="Redirects">
            <form className="mb-3 grid gap-2 md:grid-cols-[1fr_1fr_auto_auto]" onSubmit={(e) => { e.preventDefault(); run("Redirect added.", async () => { await websiteApi.addRedirect(redirect); setRedirect({ fromPath: "", toPath: "", permanent: true }); }); }}>
              <Field label="Old path"><input className={inputClass} style={inputStyle} placeholder="/old-page" value={redirect.fromPath} onChange={(e) => setRedirect({ ...redirect, fromPath: e.target.value })} /></Field>
              <Field label="New address"><input className={inputClass} style={inputStyle} placeholder="/new-page or https://" value={redirect.toPath} onChange={(e) => setRedirect({ ...redirect, toPath: e.target.value })} /></Field>
              <label className="flex items-center gap-1 self-end pb-2 text-xs"><input type="checkbox" checked={redirect.permanent} onChange={(e) => setRedirect({ ...redirect, permanent: e.target.checked })} /> Permanent (301)</label>
              <Btn type="submit" className="self-end" disabled={!redirect.fromPath || !redirect.toPath}>Add</Btn>
            </form>
            {d.redirects.length === 0 ? <Empty>No redirects.</Empty> : (
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs">
                {d.redirects.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2"><span className="font-mono">{r.fromPath} → {r.toPath} ({r.permanent ? "301" : "302"})</span><Btn variant="ghost" aria-label="Remove redirect" onClick={() => run("Redirect removed.", () => websiteApi.removeRedirect(r.id))}><Trash2 className="h-3.5 w-3.5" aria-hidden /></Btn></li>
                ))}
              </ul>
            )}
            <p className="m-0 mt-2 text-[11px]" style={{ color: "var(--app-text-faint)" }}>Chains and loops are refused. Redirect strategy suggestions come from SEO Autopilot.</p>
          </Card>
          <Card title="Maintenance mode">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span>{d.maintenanceMode ? "Visitors see your maintenance message. Takes effect immediately." : "Your site is open to visitors."}</span>
              <Btn variant={d.maintenanceMode ? "primary" : "danger"} onClick={() => { if (window.confirm(d.maintenanceMode ? "Reopen the site to visitors?" : "Put the whole site into maintenance mode now?")) run(d.maintenanceMode ? "Site reopened." : "Maintenance mode is on.", () => websiteApi.setMaintenance(!d.maintenanceMode)); }}>
                {d.maintenanceMode ? "Turn off" : "Turn on"}
              </Btn>
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}

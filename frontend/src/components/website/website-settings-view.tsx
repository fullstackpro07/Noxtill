"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Send } from "lucide-react";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { websiteApi, type SiteSettings } from "@/lib/website-api";
import { Btn, Card, Field, Kpi, Notice, Page, StatusBadge, errorText, inputClass, inputStyle } from "./website-ui";

export function WebsiteSettingsView() {
  useModuleHeader({ title: "Website Settings", subtitle: "Site-wide behaviour. Global settings stay in their own modules." });
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["website", "settings"], queryFn: websiteApi.settings });
  const [edited, setS] = useState<SiteSettings | null>(null);
  const s = edited ?? q.data?.settings ?? null;
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const save = useMutation({
    mutationFn: () => websiteApi.saveSettings(s!),
    onSuccess: () => { setMessage({ tone: "ok", text: "Settings saved as a draft. Publish to apply them to the live site." }); setS(null); void qc.invalidateQueries({ queryKey: ["website"] }); },
    onError: (e) => setMessage({ tone: "danger", text: errorText(e) }),
  });
  const publish = useMutation({
    mutationFn: () => websiteApi.publishSite({ settings: true }),
    onSuccess: (d) => { setMessage({ tone: "ok", text: `Settings published (deployment #${d.number}).` }); void qc.invalidateQueries({ queryKey: ["website"] }); },
    onError: (e) => setMessage({ tone: "danger", text: errorText(e) }),
  });

  if (q.isLoading || !s) return <Page><p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading…</p></Page>;
  if (q.isError || !q.data) return <Page><Notice tone="danger">{errorText(q.error)}</Notice></Page>;
  const d = q.data;
  const dirty = JSON.stringify(s) !== JSON.stringify(d.settings);
  const set = (patch: Partial<SiteSettings>) => setS({ ...s, ...patch });
  const pageName = (id: string) => d.pages.find((p) => p.id === id);
  const missing = [!s.homePageId && "Home page", !s.siteName && "Site name"].filter(Boolean) as string[];
  const unpublishedRefs = [s.homePageId, s.notFoundPageId, s.privacyPageId].filter((id) => id && pageName(id)?.status !== "published").length;

  const pageSelect = (key: "homePageId" | "notFoundPageId" | "privacyPageId", label: string, hint: string) => (
    <Field label={label} hint={s[key] && pageName(s[key])?.status !== "published" ? "This page isn't published yet; publish it first or publishing settings will be blocked." : hint}>
      <select className={inputClass} style={inputStyle} value={s[key]} onChange={(e) => set({ [key]: e.target.value })}>
        <option value="">{key === "homePageId" ? "First published page" : "Default"}</option>
        {d.pages.map((p) => <option key={p.id} value={p.id}>{p.title} ({p.status})</option>)}
      </select>
    </Field>
  );

  return (
    <Page>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Configuration health" value={missing.length || unpublishedRefs ? "Needs attention" : "Good"} tone={missing.length || unpublishedRefs ? "warn" : "ok"} hint={[...missing.map((m) => `${m} not set`), unpublishedRefs ? `${unpublishedRefs} chosen page(s) not published` : ""].filter(Boolean).join(" · ") || undefined} />
        <Kpi label="Live settings" value={d.changed ? "Draft differs" : "Up to date"} tone={d.changed ? "warn" : undefined} />
        <Kpi label="Maintenance" value={d.maintenanceMode ? "On" : "Off"} tone={d.maintenanceMode ? "warn" : undefined} hint={<Link className="underline" href="/website/domains">Change in Domains &amp; Publishing</Link>} />
      </div>

      <div className="flex justify-end gap-2">
        <Btn onClick={() => save.mutate()} disabled={!dirty || save.isPending}><Save className="h-3.5 w-3.5" aria-hidden /> Save draft</Btn>
        <Btn variant="primary" disabled={dirty || !d.changed || publish.isPending} onClick={() => publish.mutate()}><Send className="h-3.5 w-3.5" aria-hidden /> Publish settings</Btn>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="General">
          <div className="grid gap-3">
            <Field label="Site name" hint={`Shown in the header and browser tab. Defaults to "${d.business.name}".`}><input className={inputClass} style={inputStyle} value={s.siteName} onChange={(e) => set({ siteName: e.target.value })} /></Field>
            <Field label="Tagline"><input className={inputClass} style={inputStyle} value={s.tagline} onChange={(e) => set({ tagline: e.target.value })} /></Field>
            {pageSelect("homePageId", "Home page", "What visitors see at the site root.")}
            {pageSelect("notFoundPageId", "Not-found (404) page", "Shown when a link is broken.")}
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={s.searchEnabled} onChange={(e) => set({ searchEnabled: e.target.checked })} /> Site search (searches published pages and posts)</label>
          </div>
        </Card>

        <Card title="Locale, time and formatting (references)">
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
            <dt style={{ color: "var(--app-text-muted)" }}>Language</dt><dd className="m-0">{d.business.locale}</dd>
            <dt style={{ color: "var(--app-text-muted)" }}>Time zone</dt><dd className="m-0">{d.business.timezone}</dd>
            <dt style={{ color: "var(--app-text-muted)" }}>Currency</dt><dd className="m-0">{d.business.currency}</dd>
          </dl>
          <p className="m-0 mt-2 text-[11px]" style={{ color: "var(--app-text-faint)" }}>These come from your business profile and are not copied here. Multi-language sites are not available.</p>
        </Card>

        <Card title="Cookies & privacy">
          <div className="grid gap-3">
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={s.cookieBannerEnabled} onChange={(e) => set({ cookieBannerEnabled: e.target.checked })} /> Show a cookie notice</label>
            <Field label="Cookie notice text" hint="The hosted site sets no tracking cookies of its own."><textarea className={inputClass} style={{ ...inputStyle, minHeight: 60 }} value={s.cookieBannerText} onChange={(e) => set({ cookieBannerText: e.target.value })} /></Field>
            {pageSelect("privacyPageId", "Privacy policy page", "Linked from the cookie notice.")}
          </div>
        </Card>

        <Card title="Maintenance & search engines">
          <div className="grid gap-3">
            <Field label="Maintenance message"><textarea className={inputClass} style={{ ...inputStyle, minHeight: 60 }} value={s.maintenanceMessage} onChange={(e) => set({ maintenanceMessage: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={s.indexable}
                onChange={(e) => {
                  if (!e.target.checked && !window.confirm("Hide the whole site from search engines? Pages will drop out of Google results after the next crawl.")) return;
                  set({ indexable: e.target.checked });
                }}
              />
              Allow search engines to index the site
            </label>
            {!s.indexable && <StatusBadge status="pending" label="Site is set to noindex" />}
          </div>
        </Card>
      </div>

      <Card title="Managed elsewhere">
        <ul className="m-0 grid list-none gap-1.5 p-0 text-xs md:grid-cols-2">
          <li>SEO, sitemaps and technical fixes: <Link className="underline" href="/marketing/seo-autopilot">SEO Autopilot</Link></li>
          <li>Provider connections, API keys and webhooks: <Link className="underline" href="/integrations">Integrations</Link></li>
          <li>Delivery zones and fees used by checkout: <Link className="underline" href="/deliveries">Deliveries</Link></li>
          <li>Storefront visibility and checkout switch: <Link className="underline" href="/website/storefront">Storefront</Link></li>
          <li>Payment processing: not available. There is no Payments &amp; Billing module in this workspace, so storefront orders stay unpaid until you confirm payment.</li>
          <li>Taxes and currency: your business profile in <Link className="underline" href="/settings">Settings</Link></li>
        </ul>
      </Card>
    </Page>
  );
}

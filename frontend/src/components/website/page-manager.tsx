"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, History, Plus, Save, Send, Trash2 } from "lucide-react";
import { fetchCampaigns } from "@/lib/campaigns-api";
import { fetchProducts } from "@/lib/products-api";
import { websiteApi, type Block, type PageDetail, type PageInput, type PageKind, type PageSummary } from "@/lib/website-api";
import { BlockEditor } from "./block-editor";
import { Btn, Card, Empty, Field, Kpi, Notice, StatusBadge, errorText, formatDate, inputClass, inputStyle } from "./website-ui";

const KIND_COPY: Record<PageKind, { noun: string; plural: string; empty: string }> = {
  page: { noun: "page", plural: "Pages", empty: "No pages yet. Create one, or generate a starter site in AI Website Builder." },
  landing: { noun: "landing page", plural: "Landing pages", empty: "No landing pages yet. Create one for a campaign: one offer, one goal." },
  post: { noun: "post", plural: "Posts", empty: "No posts yet. Write your first post." },
};

function siteUrl(slug: string, path: string) {
  return `/site/${slug}${path === "/" ? "" : path}`;
}

export function PageManager({ kind }: { kind: PageKind }) {
  const qc = useQueryClient();
  const params = useSearchParams();
  const [selected, setSelected] = useState<string | null>(params.get("page"));
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const copy = KIND_COPY[kind];

  const pages = useQuery({ queryKey: ["website", "pages", kind], queryFn: () => websiteApi.pages(kind) });
  const settings = useQuery({ queryKey: ["website", "settings"], queryFn: websiteApi.settings });
  const slug = settings.data?.business.slug;

  const create = useMutation({
    mutationFn: () => websiteApi.createPage(kind, { title: newTitle.trim(), blocks: kind === "post" ? [{ id: "b1", type: "text", heading: "", body: "" } as Block] : [] }),
    onSuccess: (page) => {
      setNewTitle("");
      setSelected(page.id);
      void qc.invalidateQueries({ queryKey: ["website"] });
    },
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (pages.data ?? []).filter((p) => (statusFilter === "all" || p.status === statusFilter) && (!q || `${p.title} ${p.slug} ${p.category ?? ""}`.toLowerCase().includes(q)));
  }, [pages.data, search, statusFilter]);
  const count = (s: string) => (pages.data ?? []).filter((p) => p.status === s).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Published" value={count("published")} tone="ok" />
        <Kpi label="Drafts" value={count("draft")} />
        <Kpi label="Scheduled" value={count("scheduled")} />
        <Kpi label="Unpublished edits" value={(pages.data ?? []).filter((p) => p.hasUnpublishedChanges).length} tone={(pages.data ?? []).some((p) => p.hasUnpublishedChanges) ? "warn" : undefined} />
        <Kpi label="Needs review" value={(pages.data ?? []).filter((p) => p.aiDraft).length} hint="Generated drafts not yet edited" />
      </div>

      <Card
        title={copy.plural}
        actions={
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newTitle.trim()) create.mutate();
            }}
          >
            <input aria-label={`New ${copy.noun} title`} className={inputClass} style={{ ...inputStyle, width: 220 }} placeholder={`New ${copy.noun} title`} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            <Btn type="submit" variant="primary" disabled={!newTitle.trim() || create.isPending}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> Create
            </Btn>
          </form>
        }
      >
        {create.isError && <Notice tone="danger">{errorText(create.error)}</Notice>}
        <div className="mb-3 flex flex-wrap gap-2">
          <input aria-label="Search" className={inputClass} style={{ ...inputStyle, maxWidth: 260 }} placeholder="Search title, slug, category" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select aria-label="Status filter" className={inputClass} style={{ ...inputStyle, maxWidth: 180 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="published">Published</option>
            <option value="unpublished">Unpublished</option>
          </select>
        </div>
        {pages.isLoading ? (
          <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading…</p>
        ) : pages.isError ? (
          <Notice tone="danger">{errorText(pages.error, "Couldn't load pages.")}</Notice>
        ) : rows.length === 0 ? (
          <Empty>{(pages.data ?? []).length ? "No matches for these filters." : copy.empty}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead style={{ color: "var(--app-text-faint)" }}>
                <tr>
                  <th className="py-2 pr-2 font-semibold">Title</th>
                  <th className="py-2 pr-2 font-semibold">Path</th>
                  <th className="py-2 pr-2 font-semibold">Status</th>
                  {kind === "post" && <th className="py-2 pr-2 font-semibold">Category</th>}
                  {kind === "landing" && <th className="py-2 pr-2 font-semibold">Goal</th>}
                  <th className="py-2 pr-2 font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="cursor-pointer border-t" style={{ borderColor: "var(--app-border)", background: selected === p.id ? "var(--app-surface-muted)" : undefined }} onClick={() => setSelected(p.id)}>
                    <td className="py-2 pr-2 font-semibold">
                      <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => setSelected(p.id)}>{p.title}</button>
                      {p.aiDraft && <span className="ml-2"><StatusBadge status="pending" label="Generated draft" /></span>}
                    </td>
                    <td className="py-2 pr-2 font-mono" style={{ color: "var(--app-text-muted)" }}>{p.path}</td>
                    <td className="py-2 pr-2">
                      <StatusBadge status={p.status} />
                      {p.hasUnpublishedChanges && <span className="ml-1"><StatusBadge status="pending" label="Edits not live" /></span>}
                      {p.status === "scheduled" && <span className="ml-1 text-[11px]" style={{ color: "var(--app-text-muted)" }}>{formatDate(p.publishAt)}</span>}
                    </td>
                    {kind === "post" && <td className="py-2 pr-2">{p.category ?? "—"}</td>}
                    {kind === "landing" && <td className="py-2 pr-2">{p.goal ?? "—"}</td>}
                    <td className="py-2 pr-2" style={{ color: "var(--app-text-muted)" }}>{formatDate(p.updatedAt)}{p.authorName ? ` · ${p.authorName}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selected && <PageEditor key={selected} kind={kind} pageId={selected} businessSlug={slug} onClose={() => setSelected(null)} />}
    </div>
  );
}

function PageEditor({ kind, pageId, businessSlug, onClose }: { kind: PageKind; pageId: string; businessSlug?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const page = useQuery({ queryKey: ["website", "page", pageId], queryFn: () => websiteApi.page(pageId) });
  const forms = useQuery({ queryKey: ["website", "forms"], queryFn: websiteApi.forms });
  const storefront = useQuery({ queryKey: ["website", "storefront"], queryFn: websiteApi.storefront });
  const products = useQuery({ queryKey: ["products", "website-picker"], queryFn: () => fetchProducts({}) });
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: fetchCampaigns, enabled: kind === "landing" });
  const [edited, setDraft] = useState<(PageInput & { blocks: Block[] }) | null>(null);
  const draft = edited ?? (page.data ? toDraft(page.data) : null);
  const [scheduleAt, setScheduleAt] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);


  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["website"] });
  };
  const run = (label: string, fn: () => Promise<unknown>) =>
    fn()
      .then(() => {
        setMessage({ tone: "ok", text: label });
        setDraft(null);
        refresh();
      })
      .catch((e: unknown) => setMessage({ tone: "danger", text: errorText(e) }));

  const save = useMutation({ mutationFn: () => websiteApi.updatePage(pageId, draft!), onSuccess: () => { setMessage({ tone: "ok", text: "Saved. This is a draft until you publish." }); setDraft(null); refresh(); }, onError: (e) => setMessage({ tone: "danger", text: errorText(e) }) });

  if (page.isLoading || !draft) return <Card><p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading editor…</p></Card>;
  if (page.isError || !page.data) return <Notice tone="danger">{errorText(page.error, "Couldn't load this page.")}</Notice>;
  const p = page.data;
  const dirty = JSON.stringify(toDraft(p)) !== JSON.stringify(draft);
  const set = (patch: Partial<PageInput>) => setDraft({ ...draft, ...patch });
  const refs = {
    forms: (forms.data?.forms ?? []).map((f) => ({ id: f.id, name: f.name, status: f.status })),
    collections: storefront.data?.collections ?? [],
    products: (products.data ?? []).map((x) => ({ id: x.id, name: x.name })),
  };
  const liveHref = businessSlug && p.status === "published" ? siteUrl(businessSlug, p.path) : null;
  const campaignUrl =
    kind === "landing" && businessSlug && typeof window !== "undefined"
      ? `${window.location.origin}${siteUrl(businessSlug, p.path)}?${new URLSearchParams(Object.entries({ utm_source: draft.utmSource ?? "", utm_medium: draft.utmMedium ?? "", utm_campaign: draft.utmCampaign ?? "" }).filter(([, v]) => v) as [string, string][]).toString()}`
      : null;

  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          Editing “{p.title}” <StatusBadge status={p.status} /> <span className="text-[11px] font-normal" style={{ color: "var(--app-text-faint)" }}>v{p.version}{p.publishedVersion ? ` · live v${p.publishedVersion}` : ""}</span>
        </span>
      }
      actions={
        <>
          {liveHref && (
            <a href={liveHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--app-border)" }}>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden /> View live
            </a>
          )}
          <Btn onClick={() => save.mutate()} disabled={!dirty || save.isPending}><Save className="h-3.5 w-3.5" aria-hidden /> Save draft</Btn>
          <Btn variant="primary" disabled={dirty} title={dirty ? "Save your changes first" : undefined} onClick={() => void run(`Published. Live at ${p.path}.`, () => websiteApi.publishPage(pageId))}>
            <Send className="h-3.5 w-3.5" aria-hidden /> {p.status === "published" ? "Publish changes" : "Publish"}
          </Btn>
          {p.status === "published" && <Btn onClick={() => void run("Unpublished.", () => websiteApi.unpublishPage(pageId))}>Unpublish</Btn>}
          <Btn onClick={() => void run("Duplicated as a new draft.", () => websiteApi.duplicatePage(pageId))}><Copy className="h-3.5 w-3.5" aria-hidden /> Duplicate</Btn>
          {p.status !== "published" && (
            <Btn variant="danger" onClick={() => { if (window.confirm(`Delete "${p.title}" and its version history?`)) void websiteApi.deletePage(pageId).then(() => { refresh(); onClose(); }).catch((e: unknown) => setMessage({ tone: "danger", text: errorText(e) })); }}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
            </Btn>
          )}
          <Btn variant="ghost" onClick={onClose}>Close</Btn>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        {p.aiDraft && <Notice tone="warn">Generated draft: check every fact and replace any text in [brackets] before publishing.</Notice>}

        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Title"><input className={inputClass} style={inputStyle} value={draft.title ?? ""} onChange={(e) => set({ title: e.target.value })} /></Field>
          <Field label="Slug" hint={`Public path: ${kind === "post" ? "/blog/" : kind === "landing" ? "/lp/" : "/"}${draft.slug ?? ""}`}>
            <input className={inputClass} style={inputStyle} value={draft.slug ?? ""} onChange={(e) => set({ slug: e.target.value })} />
          </Field>
          <Field label="Meta title" hint="Basic search title. Deeper SEO lives in SEO Autopilot.">
            <input className={inputClass} style={inputStyle} value={draft.metaTitle ?? ""} onChange={(e) => set({ metaTitle: e.target.value })} />
          </Field>
          <div className="md:col-span-3">
            <Field label="Meta description">
              <input className={inputClass} style={inputStyle} value={draft.metaDescription ?? ""} onChange={(e) => set({ metaDescription: e.target.value })} maxLength={320} />
            </Field>
          </div>
        </div>

        {kind === "post" && (
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Category"><input className={inputClass} style={inputStyle} value={draft.category ?? ""} onChange={(e) => set({ category: e.target.value })} /></Field>
            <Field label="Tags (comma separated)"><input className={inputClass} style={inputStyle} value={(draft.tags ?? []).join(", ")} onChange={(e) => set({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} /></Field>
            <Field label="Hero image URL"><input className={inputClass} style={inputStyle} value={draft.heroImageUrl ?? ""} placeholder="https://" onChange={(e) => set({ heroImageUrl: e.target.value })} /></Field>
            <div className="md:col-span-3"><Field label="Excerpt"><textarea className={inputClass} style={{ ...inputStyle, minHeight: 60 }} value={draft.excerpt ?? ""} onChange={(e) => set({ excerpt: e.target.value })} /></Field></div>
          </div>
        )}

        {kind === "landing" && (
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Campaign (Marketing)" hint={campaigns.data?.length === 0 ? "No campaigns yet: create one in Marketing." : "The campaign itself stays in Marketing."}>
              <select className={inputClass} style={inputStyle} value={draft.campaignId ?? ""} onChange={(e) => set({ campaignId: e.target.value || null })}>
                <option value="">None</option>
                {(campaigns.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.segment} · {new Date(c.createdAt).toLocaleDateString()}</option>)}
              </select>
            </Field>
            <Field label="Conversion goal">
              <select className={inputClass} style={inputStyle} value={draft.goal ?? ""} onChange={(e) => set({ goal: e.target.value || null })}>
                <option value="">Not set</option>
                <option value="form">Form submission</option>
                <option value="product">Product purchase</option>
                <option value="booking">Booking</option>
                <option value="contact">Contact</option>
              </select>
            </Field>
            <Field label="Goal target (form name, product or link)"><input className={inputClass} style={inputStyle} value={draft.goalTarget ?? ""} onChange={(e) => set({ goalTarget: e.target.value })} /></Field>
            <Field label="utm_source"><input className={inputClass} style={inputStyle} value={draft.utmSource ?? ""} onChange={(e) => set({ utmSource: e.target.value })} /></Field>
            <Field label="utm_medium"><input className={inputClass} style={inputStyle} value={draft.utmMedium ?? ""} onChange={(e) => set({ utmMedium: e.target.value })} /></Field>
            <Field label="utm_campaign"><input className={inputClass} style={inputStyle} value={draft.utmCampaign ?? ""} onChange={(e) => set({ utmCampaign: e.target.value })} /></Field>
            {campaignUrl && (
              <div className="md:col-span-3">
                <Field label="Campaign URL" hint={p.status === "published" ? "Form submissions record these UTM values on the lead." : "Works once the page is published."}>
                  <div className="flex gap-2">
                    <input readOnly className={`${inputClass} font-mono`} style={inputStyle} value={campaignUrl} />
                    <Btn onClick={() => void navigator.clipboard.writeText(campaignUrl)}>Copy</Btn>
                  </div>
                </Field>
              </div>
            )}
            <div className="md:col-span-3 flex flex-wrap gap-3 text-xs">
              <Link className="underline" href="/marketing/campaigns">Open campaigns</Link>
              <Link className="underline" href="/autonomous-commerce/experiment-lab">Run an experiment in Experiment Lab</Link>
            </div>
          </div>
        )}

        <div>
          <p className="m-0 mb-2 text-xs font-bold">Content</p>
          <BlockEditor blocks={draft.blocks} onChange={(blocks) => set({ blocks })} refs={refs} />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {p.status !== "published" && (
            <div className="rounded-xl border p-3" style={{ borderColor: "var(--app-border)" }}>
              <p className="m-0 mb-2 text-xs font-bold">Schedule</p>
              {p.status === "scheduled" ? (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  Publishes {formatDate(p.publishAt)} (checked every 5 minutes).
                  <Btn onClick={() => void run("Schedule cancelled.", () => websiteApi.schedulePage(pageId, null))}>Cancel schedule</Btn>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <input type="datetime-local" aria-label="Publish at" className={inputClass} style={{ ...inputStyle, maxWidth: 240 }} value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
                  <Btn disabled={!scheduleAt || dirty} onClick={() => void run("Scheduled.", () => websiteApi.schedulePage(pageId, new Date(scheduleAt).toISOString()))}>Schedule</Btn>
                </div>
              )}
              <p className="m-0 mt-1 text-[11px]" style={{ color: "var(--app-text-faint)" }}>Times are in your browser&rsquo;s time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</p>
            </div>
          )}
          <div className="rounded-xl border p-3" style={{ borderColor: "var(--app-border)" }}>
            <p className="m-0 mb-2 flex items-center gap-1 text-xs font-bold"><History className="h-3.5 w-3.5" aria-hidden /> Version history</p>
            <ul className="m-0 flex max-h-48 list-none flex-col gap-1 overflow-auto p-0 text-xs">
              {p.versions.map((v) => (
                <li key={v.version} className="flex items-center justify-between gap-2">
                  <span>
                    v{v.version} · {v.note ?? "Saved"} · {formatDate(v.createdAt)}{v.actorName ? ` · ${v.actorName}` : ""}
                  </span>
                  {v.version !== p.version && <Btn variant="ghost" onClick={() => void run(`Restored v${v.version} as a new draft version.`, () => websiteApi.restorePage(pageId, v.version))}>Restore</Btn>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Card>
  );
}

function toDraft(p: PageDetail): PageInput & { blocks: Block[] } {
  return {
    title: p.title,
    slug: p.slug,
    metaTitle: p.metaTitle ?? "",
    metaDescription: p.metaDescription ?? "",
    excerpt: p.excerpt ?? "",
    heroImageUrl: p.heroImageUrl ?? "",
    category: p.category ?? "",
    tags: p.tags,
    campaignId: p.campaignId,
    goal: p.goal,
    goalTarget: p.goalTarget ?? "",
    utmSource: p.utmSource ?? "",
    utmMedium: p.utmMedium ?? "",
    utmCampaign: p.utmCampaign ?? "",
    blocks: p.blocks,
  };
}

export type { PageSummary };

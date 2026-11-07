"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, CircleHelp, ExternalLink, Filter, Plus, Search, X } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import {
  createSeoCompetitorAction,
  createSeoCompetitorGap,
  fetchSeoCompetitorOverview,
  transitionSeoCompetitorGap,
  type SeoCompetitorAction,
  type SeoCompetitorGap,
  type SeoCompetitorKind,
  type SeoCompetitorOverview,
} from "@/lib/seo-autopilot-api";

type ViewTab = "keyword" | "content" | "backlink" | "ranking" | "page" | "serp_feature";

const VIEW_TABS: { id: ViewTab; label: string; kinds: SeoCompetitorKind[] }[] = [
  { id: "keyword", label: "Keyword Gap", kinds: ["keyword"] },
  { id: "content", label: "Content Gap", kinds: ["content"] },
  { id: "backlink", label: "Backlink Gap", kinds: ["backlink"] },
  { id: "ranking", label: "Ranking Comparison", kinds: ["ranking"] },
  { id: "page", label: "Page Comparison", kinds: ["page"] },
  { id: "serp_feature", label: "SERP Features", kinds: ["serp_feature"] },
];

const KIND_LABELS: Record<SeoCompetitorKind, string> = {
  keyword: "Keyword gap",
  content: "Content gap",
  backlink: "Backlink gap",
  ranking: "Ranking comparison",
  page: "Page comparison",
  serp_feature: "SERP feature",
};

const STATUS_LABELS: Record<SeoCompetitorGap["status"], string> = {
  open: "Open",
  actioned: "Action created",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

const fieldClass =
  "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--app-primary)]";
const fieldStyle: CSSProperties = {
  borderColor: "var(--app-border)",
  background: "var(--app-surface)",
  color: "var(--app-text)",
};

function errorText(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : "Competitor SEO data could not be saved.";
}

function dateLabel(value: string | null) {
  if (!value) return "Not checked";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Date unavailable" : parsed.toLocaleDateString();
}

function Card({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <section
      className={`rounded-xl border p-4 ${className}`}
      style={{ borderColor: "var(--app-border)", background: "var(--app-surface)", ...style }}
    >
      {children}
    </section>
  );
}

function Button({
  children,
  onClick,
  disabled = false,
  primary = false,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
      style={primary
        ? { background: "var(--app-primary)", color: "white" }
        : { border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text)" }}
    >
      {children}
    </button>
  );
}

function Field({ label, children, required = false, hint }: { label: string; children: ReactNode; required?: boolean; hint?: string }) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold">
      <span style={{ color: "var(--app-text-muted)" }}>
        {label}{required ? <span className="ms-1 text-red-500">*</span> : null}
      </span>
      {children}
      {hint ? <span className="text-[11px] font-normal leading-relaxed" style={{ color: "var(--app-text-faint)" }}>{hint}</span> : null}
    </label>
  );
}

function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warning" | "success" }) {
  const colors = tone === "warning"
    ? { color: "var(--app-warning-text)", background: "var(--app-warning-soft)" }
    : tone === "success"
      ? { color: "var(--app-primary)", background: "var(--app-surface-2)" }
      : { color: "var(--app-text-muted)", background: "var(--app-surface-2)" };
  return <span className="inline-flex rounded-full px-2 py-1 text-[11px] font-semibold" style={colors}>{children}</span>;
}

function Kpi({ label, value, note, warning = false }: { label: string; value: number; note: string; warning?: boolean }) {
  return (
    <Card>
      <p className="m-0 text-xs font-semibold" style={{ color: "var(--app-text-faint)" }}>{label}</p>
      <p className="mb-0 mt-2 text-2xl font-bold" style={{ color: warning && value > 0 ? "var(--app-warning-text)" : "var(--app-text)" }}>{value}</p>
      <p className="mb-0 mt-1 text-[11px]" style={{ color: "var(--app-text-faint)" }}>{note}</p>
    </Card>
  );
}

function kindFilter(gap: SeoCompetitorGap, tab: ViewTab) {
  return VIEW_TABS.find((item) => item.id === tab)?.kinds.includes(gap.kind) ?? false;
}

function positionText(gap: SeoCompetitorGap) {
  const competitor = gap.competitorRank == null ? "Competitor position not recorded" : `Competitor #${gap.competitorRank}`;
  const owned = gap.ownedRank == null ? "your position not tracked" : `your #${gap.ownedRank}`;
  return `${competitor} · ${owned}`;
}

function actionUrl(gap: SeoCompetitorGap) {
  if (gap.actionType === "keyword") return "/marketing/seo-autopilot/keywords";
  if (gap.actionType === "content") return "/marketing/seo-autopilot/content";
  if (gap.actionType === "link") return "/marketing/seo-autopilot/link-building";
  return null;
}

export function SeoCompetitorView() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["seo-competitor-overview"],
    queryFn: fetchSeoCompetitorOverview,
  });
  const [tab, setTab] = useState<ViewTab>("keyword");
  const [search, setSearch] = useState("");
  const [competitorFilter, setCompetitorFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createSeoCompetitorGap,
    onSuccess: async () => {
      toast.success("Competitor evidence recorded.");
      setCreateOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["seo-competitor-overview"] });
    },
    onError: (error) => toast.error(errorText(error)),
  });
  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: SeoCompetitorAction }) => createSeoCompetitorAction(id, action),
    onSuccess: async () => {
      toast.success("SEO action created from the recorded evidence.");
      await queryClient.invalidateQueries({ queryKey: ["seo-competitor-overview"] });
      await queryClient.invalidateQueries({ queryKey: ["seo-content-overview"] });
      await queryClient.invalidateQueries({ queryKey: ["seo-link-building-overview"] });
      await queryClient.invalidateQueries({ queryKey: ["seo-keywords"] });
    },
    onError: (error) => toast.error(errorText(error)),
  });
  const transitionMutation = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: "open" | "resolved" | "dismissed"; reason: string }) => transitionSeoCompetitorGap(id, { status, reason }),
    onSuccess: async () => {
      toast.success("Competitor evidence updated.");
      await queryClient.invalidateQueries({ queryKey: ["seo-competitor-overview"] });
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return (data?.gaps ?? []).filter((gap) => {
      if (!kindFilter(gap, tab)) return false;
      if (statusFilter !== "all" && gap.status !== statusFilter) return false;
      if (competitorFilter && gap.competitorId !== competitorFilter) return false;
      if (!needle) return true;
      return [gap.title, gap.keyword, gap.competitorName, gap.evidenceNote, gap.sourceLabel]
        .some((value) => value?.toLocaleLowerCase().includes(needle));
    });
  }, [competitorFilter, data?.gaps, search, statusFilter, tab]);
  const selected = data?.gaps.find((gap) => gap.id === detailId) ?? null;
  const disclosure = data?.disclosures[
    tab === "keyword" || tab === "ranking" ? "keywordData"
      : tab === "content" || tab === "page" ? "contentData"
        : tab === "backlink" ? "backlinkData" : "serpFeatures"
  ];

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-5 md:px-7 md:py-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="m-0 text-[22px] font-extrabold tracking-tight" style={{ color: "var(--app-text)" }}>Competitor SEO</h1>
            <Badge>Evidence-led</Badge>
          </div>
          <p className="mb-0 mt-1 max-w-3xl text-sm" style={{ color: "var(--app-text-muted)" }}>
            Find competitor SEO gaps that matter to your website.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/competitive/competitors" className="inline-flex min-h-10 items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold" style={{ borderColor: "var(--app-border)", color: "var(--app-text)", background: "var(--app-surface)" }}>
            Manage competitors <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
          <Button primary onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden /> Record SEO evidence
          </Button>
        </div>
      </div>

      <Card className="mt-5 flex items-start gap-3" style={{ background: "var(--app-surface-2)" }}>
        <CircleHelp className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--app-primary)" }} aria-hidden />
        <div className="text-xs leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
          <strong style={{ color: "var(--app-text)" }}>Evidence source:</strong> {data?.disclosures.evidence ?? "Competitor SEO findings are source-linked team observations; Noxtill does not crawl competitor sites."}
          <span className="ms-1">This screen does not invent competitor traffic, authority, or keyword counts.</span>
        </div>
      </Card>

      {isError ? (
        <Card className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 text-sm" style={{ color: "var(--app-danger-strong)" }}>Competitor SEO could not load.</p>
          <Button onClick={() => void refetch()}>Try again</Button>
        </Card>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Kpi label="Tracked Competitors" value={data?.trackedCompetitors ?? 0} note="Profiles from Competitive Insights" />
            <Kpi label="Keyword Gaps" value={data?.counts.keywordGaps ?? 0} note="Open, team-recorded evidence" warning />
            <Kpi label="Content Gaps" value={data?.counts.contentGaps ?? 0} note="Open, team-recorded evidence" warning />
            <Kpi label="Backlink Gaps" value={data?.counts.backlinkGaps ?? 0} note="Manual observations only" />
            <Kpi label="SERP Gaps" value={data?.counts.serpGaps ?? 0} note="Source-linked, manual observations" />
          </div>

          <div className="mt-6 overflow-x-auto border-b" style={{ borderColor: "var(--app-border)" }}>
            <div role="tablist" aria-label="Competitor SEO views" className="flex min-w-max gap-1">
              {VIEW_TABS.map((view) => (
                <button
                  type="button"
                  key={view.id}
                  role="tab"
                  aria-selected={tab === view.id}
                  onClick={() => setTab(view.id)}
                  className="border-b-2 px-3 py-2.5 text-[13px] font-semibold"
                  style={{ borderColor: tab === view.id ? "var(--app-primary)" : "transparent", color: tab === view.id ? "var(--app-text)" : "var(--app-text-faint)" }}
                >
                  {view.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1 sm:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--app-text-faint)" }} aria-hidden />
              <input className={`${fieldClass} pl-9`} style={fieldStyle} placeholder="Search evidence, keyword or competitor" aria-label="Search competitor SEO evidence" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <Button onClick={() => setFiltersOpen((open) => !open)}>
              <Filter className="h-4 w-4" aria-hidden /> More Filters
            </Button>
            <span className="text-xs" style={{ color: "var(--app-text-faint)" }}>{filtered.length} record{filtered.length === 1 ? "" : "s"}</span>
          </div>

          {filtersOpen ? (
            <Drawer title="More competitor filters" onClose={() => setFiltersOpen(false)}>
              <div className="grid gap-4">
                <Field label="Competitor">
                  <select className={fieldClass} style={fieldStyle} value={competitorFilter} onChange={(event) => setCompetitorFilter(event.target.value)}>
                    <option value="">All tracked competitors</option>
                    {(data?.competitors ?? []).map((competitor) => <option key={competitor.id} value={competitor.id}>{competitor.name}</option>)}
                  </select>
                </Field>
                <Field label="Evidence state">
                  <select className={fieldClass} style={fieldStyle} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                    <option value="open">Open</option><option value="actioned">Action created</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option><option value="all">All states</option>
                  </select>
                </Field>
                <p className="m-0 text-xs" style={{ color: "var(--app-text-faint)" }}>
                  Results update as you change these filters.
                </p>
                <div className="flex justify-between gap-2 border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
                  <Button onClick={() => { setCompetitorFilter(""); setStatusFilter("open"); }}>Reset filters</Button>
                  <Button primary onClick={() => setFiltersOpen(false)}>Done</Button>
                </div>
              </div>
            </Drawer>
          ) : null}

          <Card className="mt-4 overflow-hidden p-0">
            <div className="border-b px-4 py-3" style={{ borderColor: "var(--app-border)" }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="m-0 text-sm font-bold" style={{ color: "var(--app-text)" }}>{VIEW_TABS.find((view) => view.id === tab)?.label}</h2>
                  <p className="mb-0 mt-1 text-[11px]" style={{ color: "var(--app-text-faint)" }}>{disclosure}</p>
                </div>
                <Badge>{data?.counts.recordedEvidence ?? 0} total evidence records</Badge>
              </div>
            </div>
            {isLoading ? (
              <div className="px-4 py-12 text-center text-sm" style={{ color: "var(--app-text-faint)" }}>Loading saved competitor evidence…</div>
            ) : filtered.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="m-0 text-sm font-semibold" style={{ color: "var(--app-text)" }}>
                  {(data?.competitors.length ?? 0) === 0 ? "No competitors are tracked yet" : "No evidence recorded in this view"}
                </p>
                <p className="mx-auto mb-4 mt-2 max-w-lg text-xs leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
                  {(data?.competitors.length ?? 0) === 0
                    ? "Add a competitor in Competitive Insights first. SEO comparisons here stay linked to those profiles."
                    : "Competitor positions, content and backlink gaps are not auto-discovered. Add a dated source and evidence note to create a real comparison."}
                </p>
                {(data?.competitors.length ?? 0) === 0
                  ? <Link href="/competitive/competitors" className="text-sm font-semibold" style={{ color: "var(--app-primary)" }}>Open Competitive Insights</Link>
                  : <Button primary onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" aria-hidden /> Record evidence</Button>}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-left text-xs">
                  <thead>
                    <tr style={{ background: "var(--app-surface-2)", color: "var(--app-text-faint)" }}>
                      {["Opportunity", "Your state", "Competitor state", "Intent / topic", "Business relevance", "Evidence", "Next action"].map((label) => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((gap) => (
                      <tr key={gap.id} className="border-t" style={{ borderColor: "var(--app-border)" }}>
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => setDetailId(gap.id)} className="text-left font-semibold hover:underline" style={{ color: "var(--app-text)" }}>{gap.title}</button>
                          <span className="mt-1 block text-[11px]" style={{ color: "var(--app-text-faint)" }}>{gap.competitorName} · {KIND_LABELS[gap.kind]}</span>
                        </td>
                        <td className="px-4 py-3" style={{ color: "var(--app-text-muted)" }}>{gap.ownedRank == null ? "Not tracked" : `#${gap.ownedRank}`}<span className="mt-1 block text-[10px]">{dateLabel(gap.ownedRankCheckedAt)}</span></td>
                        <td className="px-4 py-3" style={{ color: "var(--app-text-muted)" }}>{gap.competitorRank == null ? "Not recorded" : `#${gap.competitorRank}`}<span className="mt-1 block text-[10px]">Observed {dateLabel(gap.observedAt)}</span></td>
                        <td className="px-4 py-3" style={{ color: "var(--app-text-muted)" }}>{gap.intent || gap.keyword || "Not specified"}</td>
                        <td className="px-4 py-3"><Badge>Team-recorded</Badge><span className="mt-1 block max-w-[180px] truncate" title={gap.evidenceNote} style={{ color: "var(--app-text-faint)" }}>{gap.evidenceNote}</span></td>
                        <td className="px-4 py-3"><a href={gap.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold" style={{ color: "var(--app-primary)" }}>{gap.sourceLabel}<ExternalLink className="h-3 w-3" aria-hidden /></a><span className="mt-1 block" style={{ color: "var(--app-text-faint)" }}>{STATUS_LABELS[gap.status]}</span></td>
                        <td className="px-4 py-3">
                          {actionUrl(gap) ? <Link className="font-semibold" href={actionUrl(gap)!} style={{ color: "var(--app-primary)" }}>Open action</Link> : <button type="button" onClick={() => setDetailId(gap.id)} className="font-semibold" style={{ color: "var(--app-primary)" }}>{gap.status === "open" ? "Review" : "View"}</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {createOpen && data ? (
        <CreateEvidenceDrawer
          overview={data}
          pending={createMutation.isPending}
          onClose={() => setCreateOpen(false)}
          onSave={(input) => createMutation.mutate(input)}
        />
      ) : null}
      {selected ? (
        <EvidenceDetailDrawer
          gap={selected}
          pending={actionMutation.isPending || transitionMutation.isPending}
          onClose={() => setDetailId(null)}
          onAction={(action) => actionMutation.mutate({ id: selected.id, action })}
          onTransition={(status, reason) => transitionMutation.mutate({ id: selected.id, status, reason })}
        />
      ) : null}
    </div>
  );
}

function CreateEvidenceDrawer({
  overview,
  pending,
  onClose,
  onSave,
}: {
  overview: SeoCompetitorOverview;
  pending: boolean;
  onClose: () => void;
  onSave: (input: Parameters<typeof createSeoCompetitorGap>[0]) => void;
}) {
  const [competitorId, setCompetitorId] = useState(overview.competitors[0]?.id ?? "");
  const [kind, setKind] = useState<SeoCompetitorKind>("keyword");
  const [title, setTitle] = useState("");
  const [keyword, setKeyword] = useState("");
  const [intent, setIntent] = useState("");
  const [competitorUrl, setCompetitorUrl] = useState("");
  const [ownedPageUrl, setOwnedPageUrl] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceLabel, setSourceLabel] = useState("Team observation");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [competitorRank, setCompetitorRank] = useState("");
  const [observedAt, setObservedAt] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({
      competitorId,
      kind,
      title: title.trim(),
      ...(keyword.trim() ? { keyword: keyword.trim() } : {}),
      ...(intent.trim() ? { intent: intent.trim() } : {}),
      ...(competitorUrl.trim() ? { competitorUrl: competitorUrl.trim() } : {}),
      ...(ownedPageUrl.trim() ? { ownedPageUrl: ownedPageUrl.trim() } : {}),
      sourceUrl: sourceUrl.trim(),
      ...(sourceLabel.trim() ? { sourceLabel: sourceLabel.trim() } : {}),
      evidenceNote: evidenceNote.trim(),
      ...(competitorRank ? { competitorRank: Number(competitorRank) } : {}),
      ...(observedAt ? { observedAt: new Date(observedAt).toISOString() } : {}),
    });
  }

  return (
    <Drawer title="Record competitor SEO evidence" onClose={onClose}>
      {overview.competitors.length === 0 ? (
        <div className="rounded-lg border p-4 text-sm" style={{ borderColor: "var(--app-border)", color: "var(--app-text-muted)" }}>
          Add the competitor profile in <Link href="/competitive/competitors" className="font-semibold" style={{ color: "var(--app-primary)" }}>Competitive Insights</Link> first.
        </div>
      ) : (
        <form className="grid gap-4" onSubmit={submit}>
          <Field label="Tracked competitor" required>
            <select className={fieldClass} style={fieldStyle} value={competitorId} onChange={(event) => setCompetitorId(event.target.value)} required>
              {overview.competitors.map((competitor) => <option key={competitor.id} value={competitor.id}>{competitor.name}</option>)}
            </select>
          </Field>
          <Field label="Evidence type" required>
            <select className={fieldClass} style={fieldStyle} value={kind} onChange={(event) => setKind(event.target.value as SeoCompetitorKind)}>
              {Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Opportunity or observation" required>
            <input className={fieldClass} style={fieldStyle} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={191} required placeholder="e.g. Competitor ranks for a product guide" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Keyword" hint="Required for keyword and ranking evidence.">
              <input className={fieldClass} style={fieldStyle} value={keyword} onChange={(event) => setKeyword(event.target.value)} maxLength={191} />
            </Field>
            <Field label="Intent / topic">
              <input className={fieldClass} style={fieldStyle} value={intent} onChange={(event) => setIntent(event.target.value)} maxLength={24} placeholder="Informational, local…" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Competitor page URL">
              <input type="url" className={fieldClass} style={fieldStyle} value={competitorUrl} onChange={(event) => setCompetitorUrl(event.target.value)} placeholder="https://competitor.example/page" />
            </Field>
            <Field label="Your target page URL" hint="Must match a site page in Business Listings / your latest audit to create a link action.">
              <input type="url" className={fieldClass} style={fieldStyle} value={ownedPageUrl} onChange={(event) => setOwnedPageUrl(event.target.value)} placeholder="https://your-site.example/page" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Evidence source / referrer URL" required hint="This URL is stored as evidence; Noxtill does not crawl it.">
              <input type="url" className={fieldClass} style={fieldStyle} value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} required placeholder="https://source.example/article" />
            </Field>
            <Field label="Competitor position" hint="Manual source position, if the source shows one.">
              <input type="number" min={1} max={1000} step={1} className={fieldClass} style={fieldStyle} value={competitorRank} onChange={(event) => setCompetitorRank(event.target.value)} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Source label">
              <input className={fieldClass} style={fieldStyle} value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)} maxLength={191} />
            </Field>
            <Field label="Observed at">
              <input type="datetime-local" className={fieldClass} style={fieldStyle} value={observedAt} onChange={(event) => setObservedAt(event.target.value)} />
            </Field>
          </div>
          <Field label="Evidence and why it may matter" required hint="Use what you observed; don't include an estimated traffic or authority score.">
            <textarea className={`${fieldClass} min-h-24`} style={fieldStyle} value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} maxLength={10000} required />
          </Field>
          <div className="flex justify-end gap-2 border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" primary disabled={pending || !competitorId}>{pending ? "Saving…" : "Save evidence"}</Button>
          </div>
        </form>
      )}
    </Drawer>
  );
}

function EvidenceDetailDrawer({
  gap,
  pending,
  onClose,
  onAction,
  onTransition,
}: {
  gap: SeoCompetitorGap;
  pending: boolean;
  onClose: () => void;
  onAction: (action: SeoCompetitorAction) => void;
  onTransition: (status: "open" | "resolved" | "dismissed", reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const nextUrl = actionUrl(gap);
  const actions: { kind: SeoCompetitorAction; label: string; disabled: boolean }[] = [
    { kind: "keyword", label: "Add to Keyword Intelligence", disabled: !gap.keyword },
    { kind: "content", label: "Create Content Brief", disabled: gap.kind === "backlink" || gap.kind === "serp_feature" },
    { kind: "link", label: "Create Link Opportunity", disabled: gap.kind !== "backlink" || !gap.ownedPageUrl },
  ];
  const canChange = gap.status === "open" || gap.status === "actioned";

  return (
    <Drawer title="Competitor evidence" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{KIND_LABELS[gap.kind]}</Badge>
          <Badge tone={gap.status === "resolved" ? "success" : gap.status === "open" ? "warning" : "neutral"}>{STATUS_LABELS[gap.status]}</Badge>
        </div>
        <div>
          <h3 className="m-0 text-lg font-bold" style={{ color: "var(--app-text)" }}>{gap.title}</h3>
          <p className="mb-0 mt-1 text-sm" style={{ color: "var(--app-text-muted)" }}>{gap.competitorName}{gap.keyword ? ` · ${gap.keyword}` : ""}</p>
        </div>
        {gap.keyword ? <Detail label="Position comparison" value={`${positionText(gap)}${gap.ownedRankCheckedAt ? ` · own rank checked ${dateLabel(gap.ownedRankCheckedAt)}` : ""}`} /> : null}
        <Detail label="Business relevance" value={`Team-recorded evidence · ${gap.intent || "intent not specified"}`} />
        <Detail label="Evidence note" value={gap.evidenceNote} />
        <Detail label="Source" value={<a href={gap.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1" style={{ color: "var(--app-primary)" }}>{gap.sourceLabel} <ExternalLink className="h-3 w-3" aria-hidden /></a>} />
        <Detail label="Observed" value={dateLabel(gap.observedAt)} />
        {gap.competitorUrl ? <Detail label="Competitor page" value={<a href={gap.competitorUrl} target="_blank" rel="noreferrer" className="break-all" style={{ color: "var(--app-primary)" }}>{gap.competitorUrl}</a>} /> : null}
        {gap.ownedPageUrl ? <Detail label="Your target page" value={<a href={gap.ownedPageUrl} target="_blank" rel="noreferrer" className="break-all" style={{ color: "var(--app-primary)" }}>{gap.ownedPageUrl}</a>} /> : null}
        {nextUrl ? <Link href={nextUrl} className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--app-primary)" }}>Open created action <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></Link> : null}

        {gap.status === "open" ? (
          <section className="space-y-2 border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
            <h4 className="m-0 text-sm font-bold" style={{ color: "var(--app-text)" }}>Create an SEO action</h4>
            {actions.map((action) => (
              <Button key={action.kind} disabled={pending || action.disabled} onClick={() => onAction(action.kind)}>
                {action.label}
              </Button>
            ))}
            <p className="m-0 text-[11px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
              Actions are handed to their existing SEO workflow. Creating an action does not publish to your site or send outreach.
            </p>
          </section>
        ) : null}

        <section className="space-y-2 border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
          <h4 className="m-0 text-sm font-bold" style={{ color: "var(--app-text)" }}>Decision history</h4>
          {gap.audits.length === 0 ? <p className="m-0 text-xs" style={{ color: "var(--app-text-faint)" }}>No decisions recorded yet.</p> : gap.audits.map((event) => (
            <div key={event.id} className="rounded-lg border p-3" style={{ borderColor: "var(--app-border)" }}>
              <div className="flex justify-between gap-2 text-xs"><strong>{event.action.replaceAll("_", " ")}</strong><span style={{ color: "var(--app-text-faint)" }}>{dateLabel(event.createdAt)}</span></div>
              {event.reason ? <p className="mb-0 mt-1 text-xs" style={{ color: "var(--app-text-muted)" }}>{event.reason}</p> : null}
            </div>
          ))}
        </section>

        {canChange ? (
          <section className="space-y-3 border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
            <Field label="Decision reason" required hint="Required for resolve or dismiss; saved in the audit history.">
              <textarea className={`${fieldClass} min-h-20`} style={fieldStyle} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button disabled={pending || !reason.trim()} onClick={() => onTransition("resolved", reason.trim())}>Mark resolved</Button>
              <Button disabled={pending || !reason.trim()} onClick={() => onTransition("dismissed", reason.trim())}>Dismiss</Button>
            </div>
          </section>
        ) : gap.status === "resolved" || gap.status === "dismissed" ? (
          <section className="space-y-3 border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
            <Field label="Reopen reason" required>
              <textarea className={`${fieldClass} min-h-20`} style={fieldStyle} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} />
            </Field>
            <Button disabled={pending || !reason.trim()} onClick={() => onTransition("open", reason.trim())}>Reopen evidence</Button>
          </section>
        ) : null}
      </div>
    </Drawer>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="text-[11px] font-semibold" style={{ color: "var(--app-text-faint)" }}>{label}</span>
      <div className="break-words text-sm leading-relaxed" style={{ color: "var(--app-text-muted)" }}>{value}</div>
    </div>
  );
}

function Drawer({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/40" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={title} className="h-full w-full max-w-2xl overflow-y-auto border-l p-5 shadow-2xl md:p-7" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
        <div className="mb-5 flex items-center justify-between gap-3 border-b pb-4" style={{ borderColor: "var(--app-border)" }}>
          <h2 className="m-0 text-lg font-extrabold" style={{ color: "var(--app-text)" }}>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close drawer" className="rounded-lg border p-2" style={{ borderColor: "var(--app-border)", color: "var(--app-text-muted)" }}><X className="h-4 w-4" aria-hidden /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

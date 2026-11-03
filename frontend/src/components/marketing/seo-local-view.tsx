"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import {
  createSeoLocalPageBrief,
  fetchSeoLocalOverview,
  type SeoLocalLocation,
  type SeoLocalOverview,
} from "@/lib/seo-autopilot-api";

const TABS = [
  "Locations",
  "Listings/NAP",
  "Local Pages",
  "Local Keywords",
  "Local Schema",
  "Reviews",
  "Citations",
  "Local Rankings",
] as const;
type LocalTab = (typeof TABS)[number];

const fieldClass = "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--app-primary)]";
const fieldStyle = { borderColor: "var(--app-border)", background: "var(--app-surface)" };

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border p-4 ${className}`} style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
      {children}
    </section>
  );
}

function Kpi({ label, value, hint, warning = false }: { label: string; value: ReactNode; hint: string; warning?: boolean }) {
  return (
    <Card>
      <p className="m-0 text-xs font-semibold" style={{ color: "var(--app-text-faint)" }}>{label}</p>
      <p className="m-0 mt-1 text-2xl font-bold" style={{ color: warning ? "var(--app-warning-text)" : "var(--app-text)" }}>{value}</p>
      <p className="m-0 mt-1 text-xs" style={{ color: "var(--app-text-faintest)" }}>{hint}</p>
    </Card>
  );
}

function Badge({ children, warning = false }: { children: ReactNode; warning?: boolean }) {
  return (
    <span className="inline-flex rounded-full px-2 py-1 text-[11px] font-semibold" style={{ color: warning ? "var(--app-warning-text)" : "var(--app-text-muted)", background: warning ? "var(--app-warning-soft)" : "var(--app-surface-2)" }}>
      {children}
    </span>
  );
}

function dateLabel(value: string | null | undefined) {
  return value ? formatDate(value) : "Not available";
}

function packShareLabel(value: number | null) {
  return value === null ? "Not tracked" : `${value}%`;
}

function locationName(location: SeoLocalLocation) {
  return location.listingName || location.locationName;
}

function locationSearchText(location: SeoLocalLocation) {
  return [location.locationName, location.listingName, location.city, location.address].filter(Boolean).join(" ").toLowerCase();
}

function issueLabel(location: SeoLocalLocation) {
  if (!location.listing.configured) return "Listing not set up";
  if (location.listing.issues > 0) return `${location.listing.issues} listing issues`;
  return "No detected listing issues";
}

function statusWarning(location: SeoLocalLocation) {
  return !location.listing.configured || location.listing.issues > 0;
}

function DetailDrawer({ location, onClose, onCreateBrief, pending }: {
  location: SeoLocalLocation;
  onClose: () => void;
  onCreateBrief: (id: string) => void;
  pending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside role="dialog" aria-modal="true" aria-label={`${locationName(location)} local SEO details`} className="flex h-full w-full max-w-2xl flex-col gap-4 overflow-y-auto border-l p-5" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)", color: "var(--app-text)" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-lg font-bold">{locationName(location)}</h2>
            <p className="m-0 mt-1 text-sm" style={{ color: "var(--app-text-faint)" }}>{location.address || location.city || "Location address not configured"}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border px-3 py-1.5 text-sm font-semibold" style={{ borderColor: "var(--app-border)" }}>Close</button>
        </div>

        <Card>
          <div className="flex items-center justify-between gap-3">
            <h3 className="m-0 text-sm font-bold">Canonical listing health</h3>
            <Badge warning={statusWarning(location)}>{issueLabel(location)}</Badge>
          </div>
          {location.listing.missingFields.length > 0 && <p className="mb-0 mt-3 text-sm">Missing NAP fields: {location.listing.missingFields.join(", ")}</p>}
          {location.listing.missingHours && <p className="mb-0 mt-2 text-sm">Business hours are not configured.</p>}
          {location.listing.missingCategories && <p className="mb-0 mt-2 text-sm">Business categories are not configured.</p>}
          <p className="mb-0 mt-3 text-xs" style={{ color: "var(--app-text-faint)" }}>SEO Autopilot does not edit listing data. Open Business Listings to make changes.</p>
          <Link href={location.listing.listingUrl} className="mt-3 inline-flex rounded-lg px-3 py-2 text-sm font-bold text-white" style={{ background: "var(--app-primary)" }}>Open Business Listings</Link>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <h3 className="m-0 text-sm font-bold">Local visibility</h3>
            <p className="mb-0 mt-2 text-2xl font-bold">{location.localPack ? packShareLabel(location.localPack.sharePercent) : "Not tracked"}</p>
            <p className="mb-0 mt-1 text-xs" style={{ color: "var(--app-text-faint)" }}>{location.localPack ? `${location.localPack.visiblePoints} of ${location.localPack.totalPoints} saved grid points showed the business` : "No saved local-pack scan for this location"}</p>
            {location.localPack && <p className="mb-0 mt-2 text-xs" style={{ color: "var(--app-text-faint)" }}>{location.localPack.keyword} · {dateLabel(location.localPack.scannedAt)}</p>}
          </Card>
          <Card>
            <h3 className="m-0 text-sm font-bold">Review signal · last 90 days</h3>
            <p className="mb-0 mt-2 text-2xl font-bold">{location.reviews90Days.averageStars ?? "Not available"}{location.reviews90Days.averageStars !== null ? " / 5" : ""}</p>
            <p className="mb-0 mt-1 text-xs" style={{ color: "var(--app-text-faint)" }}>{location.reviews90Days.count} external reviews in this period. Review records remain in Reviews.</p>
          </Card>
        </div>

        <Card>
          <h3 className="m-0 text-sm font-bold">Citation snapshots</h3>
          <p className="mb-0 mt-2 text-sm">{location.citations.total ? `${location.citations.stale} stale of ${location.citations.total} saved snapshots` : "No saved citation snapshots"}</p>
          <p className="mb-0 mt-1 text-xs" style={{ color: "var(--app-text-faint)" }}>{location.citations.sourceNote}</p>
          {location.citations.records.map((citation) => (
            <div key={citation.provider} className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm" style={{ borderColor: "var(--app-border)" }}>
              <span className="font-semibold">{citation.provider}</span>
              <span>{citation.status === "stale" ? `Changed: ${citation.mismatchedFields.join(", ")}` : "Matches snapshot"}</span>
              <span className="text-xs" style={{ color: "var(--app-text-faint)" }}>Synced {dateLabel(citation.syncedAt)} · {citation.ageDays} days ago</span>
            </div>
          ))}
        </Card>

        <Card>
          <h3 className="m-0 text-sm font-bold">Pages mentioning {location.city || "this location"}</h3>
          <p className="mb-0 mt-1 text-xs" style={{ color: "var(--app-text-faint)" }}>{location.cityMentions.crawlStartedAt ? `Latest crawl ${dateLabel(location.cityMentions.crawlStartedAt)} · checked titles, descriptions and H1s only` : "No completed website crawl is available for this location."}</p>
          {location.cityMentions.pages.length === 0 ? <p className="mb-0 mt-3 text-sm">{location.cityMentions.pageCount === null ? "Not available" : "No crawled page metadata mentions this city."}</p> : (
            <ul className="mb-0 mt-3 space-y-2 pl-5 text-sm">
              {location.cityMentions.pages.map((page) => <li key={page.url}><a href={page.url} target="_blank" rel="noreferrer" className="font-semibold underline">{page.title || page.url}</a><span className="ml-2 text-xs" style={{ color: "var(--app-text-faint)" }}>matched {page.mentionFields.join(", ")}</span></li>)}
            </ul>
          )}
        </Card>

        <button type="button" disabled={pending} onClick={() => onCreateBrief(location.businessId)} className="rounded-lg px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>
          {pending ? "Creating brief…" : "Create local page brief"}
        </button>
      </aside>
    </div>
  );
}

export function SeoLocalView() {
  const client = useQueryClient();
  const [activeTab, setActiveTab] = useState<LocalTab>("Locations");
  const [search, setSearch] = useState("");
  const [onlyNeedsAttention, setOnlyNeedsAttention] = useState(false);
  const [locationFilter, setLocationFilter] = useState("all");
  const [selected, setSelected] = useState<SeoLocalLocation | null>(null);
  const query = useQuery({ queryKey: ["seo-local-overview"], queryFn: fetchSeoLocalOverview, staleTime: 30_000 });
  const refresh = async () => client.invalidateQueries({ queryKey: ["seo-local-overview"] });
  const createBrief = useMutation({
    mutationFn: createSeoLocalPageBrief,
    onSuccess: async (brief) => {
      await refresh();
      toast.success(`Location-page brief created: ${brief.topic}`);
      setSelected(null);
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't create a local page brief.")),
  });

  const data: SeoLocalOverview | undefined = query.data;
  const locations = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data?.locations ?? []).filter((location) => {
      if (needle && !locationSearchText(location).includes(needle)) return false;
      if (onlyNeedsAttention && !statusWarning(location)) return false;
      if (locationFilter !== "all" && location.businessId !== locationFilter) return false;
      return true;
    });
  }, [data?.locations, locationFilter, onlyNeedsAttention, search]);
  const createFor = (id: string) => createBrief.mutate(id);

  if (query.isLoading) return <div className="p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading local SEO evidence…</div>;
  if (query.isError || !data) return (
    <div className="p-6">
      <Card>
        <p className="m-0 text-sm font-semibold">Local SEO could not be loaded.</p>
        <p className="mb-0 mt-1 text-sm" style={{ color: "var(--app-text-faint)" }}>{errorMessage(query.error, "Check the connection and try again.")}</p>
        <button type="button" onClick={() => void query.refetch()} className="mt-3 rounded-lg border px-3 py-2 text-sm font-bold" style={{ borderColor: "var(--app-border)" }}>Retry</button>
      </Card>
    </div>
  );

  const summary = data.summary;
  const locationsForTab = locations;
  const localKeywordRows = locationsForTab.flatMap((location) => location.localKeywords.records.map((keyword) => ({ ...keyword, location })));
  const citationRows = locationsForTab.flatMap((location) => location.citations.records.map((citation) => ({ ...citation, location })));

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <p className="m-0 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--app-primary)" }}>SEO Autopilot · Local SEO</p>
          <h1 className="m-0 mt-1 text-2xl font-bold">Local search by location</h1>
          <p className="m-0 mt-1 max-w-3xl text-sm" style={{ color: "var(--app-text-faint)" }}>Improve how each business location appears and ranks in local search. Listing changes stay in Business Listings; review records stay in Reviews.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setActiveTab("Listings/NAP")} className="rounded-lg border px-3 py-2 text-sm font-bold" style={{ borderColor: "var(--app-border)" }}>Improve Local Visibility</button>
          <Link href="/listings" className="rounded-lg px-3 py-2 text-sm font-bold text-white" style={{ background: "var(--app-primary)" }}>Open Business Listings</Link>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Locations" value={summary.locations} hint="Main business and active branches" />
        <Kpi label="Local visibility" value={summary.localPack.sharePercent === null ? "Not tracked" : `${summary.localPack.sharePercent}%`} hint={summary.localPack.totalPoints ? `${summary.localPack.visiblePoints} of ${summary.localPack.totalPoints} points across latest scans` : "No saved local-pack scans"} />
        <Kpi label="NAP consistency" value={summary.citationSnapshots ? `${summary.staleCitations} stale` : "Not tracked"} hint={summary.citationSnapshots ? `${summary.citationSnapshots} saved citation snapshots compared` : "No successful citation snapshots"} warning={summary.staleCitations > 0} />
        <Kpi label="Listing issues" value={summary.locationsWithListingIssues} hint={`${summary.missingListingFields} missing NAP fields across locations`} warning={summary.locationsWithListingIssues > 0} />
        <Kpi label="Review signals · 90 days" value={summary.averageReviewStars90Days === null ? "Not available" : `${summary.averageReviewStars90Days} / 5`} hint={`${summary.reviewCount90Days} external reviews`} />
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search locations, address or city" className={`${fieldClass} lg:max-w-sm`} style={fieldStyle} aria-label="Search locations" />
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--app-text-muted)" }}>
          <input type="checkbox" checked={onlyNeedsAttention} onChange={(event) => setOnlyNeedsAttention(event.target.checked)} /> Needs attention
        </label>
        <details className="relative text-sm">
          <summary className="cursor-pointer rounded-lg border px-3 py-2 font-semibold" style={{ borderColor: "var(--app-border)" }}>More filters</summary>
          <div className="absolute right-0 z-10 mt-2 w-64 rounded-xl border p-3 shadow-lg" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
            <label className="block text-xs font-semibold" htmlFor="seo-local-location-filter">Location</label>
            <select id="seo-local-location-filter" value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} className={`${fieldClass} mt-2`} style={fieldStyle}>
              <option value="all">All locations</option>
              {data.locations.map((location) => <option key={location.businessId} value={location.businessId}>{locationName(location)}</option>)}
            </select>
          </div>
        </details>
      </div>

      <div className="overflow-x-auto border-b" style={{ borderColor: "var(--app-border)" }} role="tablist" aria-label="Local SEO views">
        <div className="flex min-w-max gap-1">
          {TABS.map((tab) => <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} onClick={() => setActiveTab(tab)} className="border-b-2 px-3 py-2.5 text-[13px] font-semibold" style={{ borderColor: activeTab === tab ? "var(--app-primary)" : "transparent", color: activeTab === tab ? "var(--app-text)" : "var(--app-text-faint)" }}>{tab}</button>)}
        </div>
      </div>

      {activeTab === "Locations" && (
        <Card className="overflow-x-auto !p-0">
          <table className="w-full min-w-[920px] border-collapse text-left text-sm">
            <thead style={{ background: "var(--app-surface-2)", color: "var(--app-text-faint)" }}><tr>{["Location", "Visibility", "NAP health", "Listing issues", "Review signal", "Local keywords", "Status", "Action"].map((head) => <th key={head} className="px-4 py-3 text-xs font-bold">{head}</th>)}</tr></thead>
            <tbody>
              {locations.map((location) => <tr key={location.businessId} className="border-t" style={{ borderColor: "var(--app-border)" }}>
                <td className="px-4 py-3"><button type="button" onClick={() => setSelected(location)} className="text-left font-bold underline">{locationName(location)}</button><p className="m-0 mt-1 text-xs" style={{ color: "var(--app-text-faint)" }}>{location.city || "City not configured"}</p></td>
                <td className="px-4 py-3">{location.localPack ? packShareLabel(location.localPack.sharePercent) : "Not tracked"}</td>
                <td className="px-4 py-3">{location.citations.total ? `${location.citations.stale} stale / ${location.citations.total}` : "Not tracked"}</td>
                <td className="px-4 py-3">{location.listing.issues}</td>
                <td className="px-4 py-3">{location.reviews90Days.averageStars === null ? "Not available" : `${location.reviews90Days.averageStars} / 5 · ${location.reviews90Days.count}`}</td>
                <td className="px-4 py-3">{location.localKeywords.tracked} tracked · {location.localKeywords.improving} improving</td>
                <td className="px-4 py-3"><Badge warning={statusWarning(location)}>{issueLabel(location)}</Badge></td>
                <td className="px-4 py-3"><button type="button" onClick={() => setSelected(location)} className="font-bold underline">View details</button></td>
              </tr>)}
            </tbody>
          </table>
          {locations.length === 0 && <p className="m-0 p-5 text-sm" style={{ color: "var(--app-text-faint)" }}>No locations match these filters.</p>}
        </Card>
      )}

      {activeTab === "Listings/NAP" && (
        <div className="space-y-3">
          <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>Canonical listing fields are read from Business Listings. This screen never edits listings or provider records.</p>
          {locationsForTab.map((location) => <Card key={location.businessId}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="m-0 text-base font-bold">{locationName(location)}</h2><p className="m-0 mt-1 text-sm" style={{ color: "var(--app-text-faint)" }}>{location.address || "Address not configured"}</p></div><Link href={location.listing.listingUrl} className="text-sm font-bold underline">Fix in Business Listings</Link></div>
            {!location.listing.configured ? <p className="mb-0 mt-3 text-sm">Master listing is not configured for this location.</p> : <div className="mt-3 flex flex-wrap gap-2">{location.listing.missingFields.map((field) => <Badge key={field} warning>Missing {field}</Badge>)}{location.listing.missingHours && <Badge warning>Missing hours</Badge>}{location.listing.missingCategories && <Badge warning>Missing categories</Badge>}{location.listing.issues === 0 && <Badge>No detected listing issues</Badge>}</div>}
          </Card>)}
        </div>
      )}

      {activeTab === "Local Pages" && (
        <div className="space-y-3">
          <Card><h2 className="m-0 text-base font-bold">Location-page opportunities</h2><p className="mb-0 mt-1 text-sm" style={{ color: "var(--app-text-faint)" }}>Review pages whose crawled title, description or H1 mentions each city. You can create a location-page brief for your team; Noxtill does not publish to your website.</p></Card>
          {locationsForTab.map((location) => <Card key={location.businessId}>
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="m-0 text-sm font-bold">{locationName(location)}{location.city ? ` · ${location.city}` : ""}</h3><p className="m-0 mt-1 text-xs" style={{ color: "var(--app-text-faint)" }}>{location.cityMentions.pageCount === null ? "Crawl data not available" : `${location.cityMentions.pageCount} crawled pages mention this city`} · checked {dateLabel(location.cityMentions.crawlStartedAt)}</p></div><button type="button" disabled={createBrief.isPending} onClick={() => createFor(location.businessId)} className="rounded-lg px-3 py-2 text-sm font-bold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>Create Local Page Opportunity</button></div>
            {location.cityMentions.pages.length > 0 && <ul className="mb-0 mt-3 space-y-1 pl-5 text-sm">{location.cityMentions.pages.map((page) => <li key={page.url}><a href={page.url} target="_blank" rel="noreferrer" className="underline">{page.title || page.url}</a></li>)}</ul>}
          </Card>)}
        </div>
      )}

      {activeTab === "Local Keywords" && (
        <Card className="overflow-x-auto !p-0">
          <table className="w-full min-w-[780px] border-collapse text-left text-sm"><thead style={{ background: "var(--app-surface-2)", color: "var(--app-text-faint)" }}><tr>{["Keyword", "Location", "Current rank", "Previous rank", "Movement", "Checked"].map((head) => <th key={head} className="px-4 py-3 text-xs font-bold">{head}</th>)}</tr></thead><tbody>
            {localKeywordRows.map(({ id, keyword, location, currentRank, previousRank, positionsGained, movement, checkedAt }) => <tr key={`${location.businessId}:${id}`} className="border-t" style={{ borderColor: "var(--app-border)" }}><td className="px-4 py-3 font-semibold">{keyword}</td><td className="px-4 py-3">{locationName(location)}</td><td className="px-4 py-3">{currentRank === null ? "Not found in checked results" : `#${currentRank}`}</td><td className="px-4 py-3">{previousRank === null ? "Not available" : `#${previousRank}`}</td><td className="px-4 py-3">{movement === "not_comparable" ? "Not enough snapshots" : movement.replaceAll("_", " ")}{positionsGained !== null ? ` · ${positionsGained > 0 ? "+" : ""}${positionsGained}` : ""}</td><td className="px-4 py-3">{dateLabel(checkedAt)}</td></tr>)}
          </tbody></table>
          {localKeywordRows.length === 0 && <p className="m-0 p-5 text-sm" style={{ color: "var(--app-text-faint)" }}>No local-intent keywords are tracked for these locations.</p>}
        </Card>
      )}

      {activeTab === "Local Schema" && <Card><Badge>Not tracked</Badge><h2 className="m-0 mt-3 text-base font-bold">Local structured data</h2><p className="mb-0 mt-2 max-w-3xl text-sm" style={{ color: "var(--app-text-faint)" }}>Noxtill&rsquo;s site crawler does not currently detect or validate LocalBusiness structured data. Add or review schema on your website with your site tooling; this module will not claim schema coverage.</p></Card>}

      {activeTab === "Reviews" && (
        <div className="space-y-3">
          <Card><h2 className="m-0 text-base font-bold">Review signals</h2><p className="mb-0 mt-1 text-sm" style={{ color: "var(--app-text-faint)" }}>Aggregates from external review records created in the last 90 days. Individual reviews and replies remain in Reviews &amp; Reputation.</p></Card>
          {locationsForTab.map((location) => <Card key={location.businessId} className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="m-0 text-sm font-bold">{locationName(location)}</h3><p className="m-0 mt-1 text-xs" style={{ color: "var(--app-text-faint)" }}>Period starts {dateLabel(location.reviews90Days.since)}</p></div><div className="text-right"><p className="m-0 text-xl font-bold">{location.reviews90Days.averageStars === null ? "Not available" : `${location.reviews90Days.averageStars} / 5`}</p><p className="m-0 mt-1 text-xs" style={{ color: "var(--app-text-faint)" }}>{location.reviews90Days.count} reviews</p></div></Card>)}
        </div>
      )}

      {activeTab === "Citations" && (
        <div className="space-y-3">
          <Card><h2 className="m-0 text-base font-bold">Citation freshness</h2><p className="mb-0 mt-1 text-sm" style={{ color: "var(--app-text-faint)" }}>These are snapshots from successful Noxtill syncs, compared with canonical NAP fields. A match is not confirmation of the live directory listing.</p></Card>
          {citationRows.map((citation) => <Card key={`${citation.location.businessId}:${citation.provider}`} className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="m-0 text-sm font-bold">{locationName(citation.location)} · {citation.provider}</h3><p className="m-0 mt-1 text-xs" style={{ color: "var(--app-text-faint)" }}>Last synced {dateLabel(citation.syncedAt)} · {citation.ageDays} days ago</p></div><Badge warning={citation.status === "stale"}>{citation.status === "stale" ? `Stale: ${citation.mismatchedFields.join(", ")}` : "Matches canonical snapshot"}</Badge></Card>)}
          {citationRows.length === 0 && <Card><p className="m-0 text-sm">No successful citation snapshots are available for these locations.</p></Card>}
        </div>
      )}

      {activeTab === "Local Rankings" && (
        <div className="space-y-3">
          <Card><h2 className="m-0 text-base font-bold">Saved local-pack scans</h2><p className="mb-0 mt-1 text-sm" style={{ color: "var(--app-text-faint)" }}>Visibility is the share of saved grid points where the business appeared in the local pack. No scan or no appearance is never inferred as a ranking estimate.</p></Card>
          {locationsForTab.map((location) => <Card key={location.businessId} className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="m-0 text-sm font-bold">{locationName(location)}</h3><p className="m-0 mt-1 text-xs" style={{ color: "var(--app-text-faint)" }}>{location.localPack ? `${location.localPack.keyword} · checked ${dateLabel(location.localPack.scannedAt)}` : "No saved local-pack scan"}</p></div><div className="text-right"><p className="m-0 text-xl font-bold">{location.localPack ? packShareLabel(location.localPack.sharePercent) : "Not tracked"}</p>{location.localPack && <p className="m-0 mt-1 text-xs" style={{ color: "var(--app-text-faint)" }}>{location.localPack.visiblePoints} / {location.localPack.totalPoints} grid points</p>}</div></Card>)}
        </div>
      )}

      <footer className="flex flex-wrap gap-x-5 gap-y-2 border-t pt-3 text-xs" style={{ borderColor: "var(--app-border)", color: "var(--app-text-faint)" }}>
        <span>{data.disclosures.localSchema}</span>
        <span>{summary.localKeywords} tracked local keywords · {summary.improvingLocalKeywords} improving · {summary.decliningLocalKeywords} declining</span>
        <span>Updated {dateLabel(data.generatedAt)}</span>
      </footer>

      {selected && <DetailDrawer location={selected} onClose={() => setSelected(null)} onCreateBrief={createFor} pending={createBrief.isPending} />}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchCompetitorsRaw,
  fetchCompetitorHistory,
  fetchCompetitorCategoryAverage,
  removeCompetitor,
  triggerCompetitorSnapshot,
  searchCompetitorPlaces,
  addCompetitor,
  addCompetitorFromPlace,
  type RawCompetitor,
  type CompetitorHistoryPoint,
  type PlaceSearchResult,
} from "@/lib/competitors-api";
import { fetchReviewsSummary, fetchReviewMetricsHistory, type ReviewMetricsSnapshotPoint } from "@/lib/reviews-api";
import { MAX_COMPETITORS } from "@/lib/competitors";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const primaryBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };

function downloadCsv(rows: RawCompetitor[]) {
  const header = "Name,Rating,Review Count\n";
  const body = rows.map((c) => `"${c.name}",${c.lastRating ?? ""},${c.lastReviewsCount ?? ""}`).join("\n");
  const blob = new Blob([header + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `competitors-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function CompetitorsView() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [detail, setDetail] = useState<RawCompetitor | null>(null);

  const { data: summary } = useQuery({ queryKey: ["reviews-summary"], queryFn: fetchReviewsSummary });
  const { data: categoryAverage } = useQuery({ queryKey: ["competitor-category-average"], queryFn: fetchCompetitorCategoryAverage });
  const { data: competitors = [] } = useQuery({ queryKey: ["competitors-raw"], queryFn: fetchCompetitorsRaw });
  const { data: yourHistory = [] } = useQuery({ queryKey: ["review-metrics-history"], queryFn: fetchReviewMetricsHistory });

  const historyQueries = useQueries({
    queries: competitors.map((c) => ({ queryKey: ["competitor-history", c.id], queryFn: () => fetchCompetitorHistory(c.id) })),
  });
  const historyById = new Map<string, CompetitorHistoryPoint[]>(competitors.map((c, i) => [c.id, historyQueries[i]?.data ?? []]));

  const refreshMutation = useMutation({
    mutationFn: (id: string) => triggerCompetitorSnapshot(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["competitors-raw"] }); queryClient.invalidateQueries({ queryKey: ["competitor-history"] }); toast.success("Refreshed."); },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't refresh this competitor right now."),
  });
  const removeMutation = useMutation({
    mutationFn: (id: string) => removeCompetitor(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["competitors-raw"] }); toast.success("Competitor removed."); },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't remove this competitor."),
  });

  const yourRating = summary?.averageRating ?? 0;
  const rated = competitors.filter((c) => c.lastRating != null && Number(c.lastRating) > 0);
  const rank = 1 + rated.filter((c) => Number(c.lastRating) > yourRating).length;
  const totalRanked = rated.length + (summary ? 1 : 0);
  const leader = Math.max(yourRating, ...rated.map((c) => Number(c.lastRating)));
  const gap = leader - yourRating;
  const atLimit = competitors.length >= MAX_COMPETITORS;

  const cpLabels = useMemo(() => {
    const longest = Math.max(0, ...competitors.map((c) => (historyById.get(c.id) ?? []).length));
    return Array.from({ length: Math.max(longest, 1) }, (_, i) => i);
  }, [competitors, historyById]);

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[10px]">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Competitors</h2>
        <span className="text-[11.5px]" style={{ color: "var(--app-text-faintest)" }}>Up to {MAX_COMPETITORS} nearby businesses · public listing data</span>
        <div className="ml-auto flex flex-wrap gap-[9px]">
          <button type="button" onClick={() => downloadCsv(competitors)} style={outlineBtn}>Export</button>
          <button type="button" onClick={() => competitors.forEach((c) => refreshMutation.mutate(c.id))} style={outlineBtn}>Refresh Now</button>
          <button type="button" onClick={() => (atLimit ? toast.error(`You can track up to ${MAX_COMPETITORS} competitors.`) : setAddOpen(true))} style={primaryBtn}>Add Competitor</button>
        </div>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1.5px solid var(--app-success-border)" }}>
          <div className="text-[12px] font-bold" style={{ color: "var(--app-success-text)" }}>Your Rating</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{yourRating > 0 ? yourRating.toFixed(1) : "—"}</div>
        </div>
        <Kpi label="Category Average" value={categoryAverage?.averageRating != null ? categoryAverage.averageRating.toFixed(1) : "—"} />
        <Kpi label="Your Rank" value={totalRanked > 0 ? `#${rank} of ${totalRanked}` : "—"} />
        <Kpi label="Gap to Leader" value={gap <= 0 ? "You lead" : `−${gap.toFixed(1)}`} />
      </div>

      <div className="grid gap-[15px]" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        <div className="min-w-0 rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="mb-1.5 flex flex-wrap items-center gap-3.5">
            <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Rating comparison</h3>
            <Legend color="var(--app-primary)" label="You (current)" />
            {competitors.slice(0, 4).map((c, i) => (
              <Legend key={c.id} color={COMPETITOR_COLORS[i % COMPETITOR_COLORS.length]} label={c.name} />
            ))}
          </div>
          {competitors.length === 0 ? (
            <p className="m-0 py-8 text-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Track a competitor to see a comparison.</p>
          ) : (
            <RatingComparisonChart yourRating={yourRating} yourHistory={yourHistory} competitors={competitors} historyById={historyById} labels={cpLabels} />
          )}
          {yourHistory.length < 2 && (
            <p className="m-0 mt-2 text-[11px]" style={{ color: "var(--app-text-disabled)" }}>Your own line shows only your current rating until a few weekly snapshots have run (every Monday).</p>
          )}
        </div>
        <div className="min-w-0 rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-3 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Review volume{yourHistory.length >= 2 ? "" : " — current"}</h3>
          <VolumeComparisonChart
            yourCount={summary ? summary.distribution.reduce((s, d) => s + d.count, 0) : 0}
            yourHistory={yourHistory}
            competitors={competitors}
            historyById={historyById}
            labels={cpLabels}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex items-center gap-2.5 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Tracked competitors</h3>
          {atLimit && <span className="rounded-full px-2.5 py-[3px] text-[11px] font-bold" style={{ background: "var(--app-warning-bg)", color: "var(--app-warning-text)" }}>Maximum of {MAX_COMPETITORS} reached</span>}
        </div>
        {competitors.length === 0 ? (
          <div className="p-[52px_18px] text-center">
            <p className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Add up to {MAX_COMPETITORS} local competitors to track</p>
            <p className="m-0 mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Search a real business by name and location — nothing is invented.</p>
            <button type="button" onClick={() => setAddOpen(true)} className="mt-[15px]" style={{ ...primaryBtn, padding: "12px 22px" }}>Add Competitor</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 760 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  {["Competitor", "Rating", "Review Count", "Weekly Change", ""].map((h) => (
                    <th key={h} className="p-[10px_17px] text-left text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {competitors.map((c) => {
                  const history = historyById.get(c.id) ?? [];
                  const change = history.length >= 2 ? history[history.length - 1].rating - history[history.length - 2].rating : null;
                  return (
                    <tr key={c.id} onClick={() => setDetail(c)} className="cursor-pointer" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
                      <td className="p-3 pl-[17px] text-[12.5px] font-bold" style={{ color: "var(--app-success-text)" }}>{c.name}</td>
                      <td className="p-3 text-[13px] font-extrabold" style={{ color: "var(--app-text)" }}>{c.lastRating != null ? Number(c.lastRating).toFixed(1) : "—"}</td>
                      <td className="p-3 text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{c.lastReviewsCount ?? "—"}</td>
                      <td className="p-3 text-[12px] font-extrabold" style={{ color: change == null ? "var(--app-text-disabled)" : change > 0 ? "var(--app-success-text)" : change < 0 ? "var(--app-danger-strong)" : "var(--app-text-faint)" }}>
                        {change == null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(1)}`}
                      </td>
                      <td className="p-3 pr-[17px] text-right">
                        <span className="inline-flex gap-1.5">
                          <button type="button" onClick={(e) => { e.stopPropagation(); removeMutation.mutate(c.id); }} className="rounded-[9px] px-3 py-2 text-[11.5px] font-bold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-faintest)" }}>Remove</button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); setDetail(c); }} className="rounded-[9px] px-3 py-2 text-[11.5px] font-bold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)" }}>View</button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {addOpen && <AddCompetitorModal onClose={() => setAddOpen(false)} atLimit={atLimit} />}
      {detail && <CompetitorDetailDrawer competitor={detail} history={historyById.get(detail.id) ?? []} onClose={() => setDetail(null)} onRefresh={() => refreshMutation.mutate(detail.id)} />}
    </main>
  );
}

const COMPETITOR_COLORS = ["#98A2B3", "#2563EB", "#9333EA", "#F97316"];

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
      <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>{label}</div>
      <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{value}</div>
    </div>
  );
}
function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: "var(--app-text-faint)" }}>
      <span className="h-2 w-2 rounded-[2px]" style={{ background: color }} />
      {label.length > 16 ? `${label.slice(0, 16)}…` : label}
    </span>
  );
}

function RatingComparisonChart({
  yourRating,
  yourHistory,
  competitors,
  historyById,
  labels,
}: {
  yourRating: number;
  yourHistory: ReviewMetricsSnapshotPoint[];
  competitors: RawCompetitor[];
  historyById: Map<string, CompetitorHistoryPoint[]>;
  labels: number[];
}) {
  const width = 620;
  const height = 122;
  const min = 3.5;
  const max = 5;
  const span = max - min;
  const x = (i: number) => 20 + (labels.length > 1 ? (i / (labels.length - 1)) * (width - 40) : 0);
  const y = (v: number) => 12 + (height - 30) * (1 - (v - min) / span);

  function lineFor(vals: number[]) {
    if (vals.length === 0) return "";
    return vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  }

  // Real weekly history (UPD-BE-M31) once at least 2 snapshots exist; otherwise a single flat
  // point at the current rating, same honest fallback as before for a brand-new business.
  const yourVals = yourHistory.length >= 2 ? yourHistory.map((h) => h.averageRating) : [yourRating];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" style={{ height }}>
      <path d={lineFor(yourVals)} fill="none" stroke="var(--app-primary)" strokeWidth={2.4} strokeLinejoin="round" />
      {yourVals.map((v, i) => (
        <circle key={`you-${i}`} cx={x(i)} cy={y(v)} r={3} fill="#fff" stroke="var(--app-primary)" strokeWidth={1.6} />
      ))}
      {competitors.slice(0, 4).map((c, i) => {
        const history = historyById.get(c.id) ?? [];
        const vals = history.length > 0 ? history.map((h) => h.rating) : (c.lastRating != null ? [Number(c.lastRating)] : []);
        return <path key={c.id} d={lineFor(vals)} fill="none" stroke={COMPETITOR_COLORS[i % COMPETITOR_COLORS.length]} strokeWidth={2} strokeLinejoin="round" />;
      })}
    </svg>
  );
}

function VolumeComparisonChart({
  yourCount,
  yourHistory,
  competitors,
  historyById,
  labels,
}: {
  yourCount: number;
  yourHistory: ReviewMetricsSnapshotPoint[];
  competitors: RawCompetitor[];
  historyById: Map<string, CompetitorHistoryPoint[]>;
  labels: number[];
}) {
  if (yourHistory.length >= 2) {
    const width = 620;
    const height = 118;
    const allCounts = [
      ...yourHistory.map((h) => h.totalReviews),
      ...competitors.flatMap((c) => (historyById.get(c.id) ?? []).map((h) => h.reviewsCount)),
      yourCount,
    ];
    const max = Math.max(1, ...allCounts);
    const x = (i: number) => 20 + (labels.length > 1 ? (i / (labels.length - 1)) * (width - 40) : 0);
    const y = (v: number) => 10 + (height - 24) * (1 - v / max);
    function lineFor(vals: number[]) {
      if (vals.length === 0) return "";
      return vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
    }
    const yourVals = yourHistory.map((h) => h.totalReviews);
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" style={{ height }}>
        <path d={lineFor(yourVals)} fill="none" stroke="var(--app-primary)" strokeWidth={2.4} strokeLinejoin="round" />
        {competitors.slice(0, 4).map((c, i) => {
          const history = historyById.get(c.id) ?? [];
          const vals = history.map((h) => h.reviewsCount);
          return <path key={c.id} d={lineFor(vals)} fill="none" stroke={COMPETITOR_COLORS[i % COMPETITOR_COLORS.length]} strokeWidth={2} strokeLinejoin="round" />;
        })}
      </svg>
    );
  }

  // Fallback for a brand-new business with no weekly history yet: a simple, honest current-values comparison.
  const bars = [{ name: "You", count: yourCount, color: "var(--app-primary)" }, ...competitors.map((c, i) => ({ name: c.name, count: c.lastReviewsCount ?? 0, color: COMPETITOR_COLORS[i % COMPETITOR_COLORS.length] }))];
  const max = Math.max(1, ...bars.map((b) => b.count));
  return (
    <div className="flex flex-col gap-2.5">
      {bars.map((b) => (
        <div key={b.name}>
          <div className="mb-[5px] flex justify-between"><span className="max-w-[220px] truncate text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{b.name}</span><span className="text-[11.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{b.count}</span></div>
          <span className="block h-2 overflow-hidden rounded-[6px]" style={{ background: "var(--app-surface-2)" }}>
            <span className="block h-full rounded-[6px]" style={{ width: `${(b.count / max) * 100}%`, background: b.color }} />
          </span>
        </div>
      ))}
    </div>
  );
}

function CompetitorDetailDrawer({ competitor, history, onClose, onRefresh }: { competitor: RawCompetitor; history: CompetitorHistoryPoint[]; onClose: () => void; onRefresh: () => void }) {
  const change = history.length >= 2 ? history[history.length - 1].rating - history[history.length - 2].rating : null;
  return (
    <div className="fixed inset-0 z-[85]">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0" style={{ background: "rgba(10,27,42,.36)" }} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-[480px] flex-col" style={{ background: "var(--app-surface)", boxShadow: "-18px 0 46px rgba(10,27,42,.18)" }}>
        <div className="flex items-center gap-3 p-[17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 flex-1 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>Competitor Detail</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px]" style={{ border: "1px solid var(--app-border)" }}>×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-[17px]">
          <div className="flex flex-col gap-3.5">
            <div className="text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>{competitor.name}</div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}><div className="text-[11.5px] font-bold" style={{ color: "var(--app-text-faintest)" }}>Rating</div><div className="mt-1 text-[20px] font-extrabold" style={{ color: "var(--app-text)" }}>{competitor.lastRating != null ? Number(competitor.lastRating).toFixed(1) : "—"}</div></div>
              <div className="rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}><div className="text-[11.5px] font-bold" style={{ color: "var(--app-text-faintest)" }}>Review count</div><div className="mt-1 text-[20px] font-extrabold" style={{ color: "var(--app-text)" }}>{competitor.lastReviewsCount ?? "—"}</div></div>
              <div className="rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}><div className="text-[11.5px] font-bold" style={{ color: "var(--app-text-faintest)" }}>Weekly change</div><div className="mt-1 text-[20px] font-extrabold" style={{ color: "var(--app-text)" }}>{change != null ? `${change > 0 ? "+" : ""}${change.toFixed(1)}` : "—"}</div></div>
              <div className="rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}><div className="text-[11.5px] font-bold" style={{ color: "var(--app-text-faintest)" }}>Snapshots</div><div className="mt-1 text-[20px] font-extrabold" style={{ color: "var(--app-text)" }}>{history.length}</div></div>
            </div>
            <div className="rounded-[11px] p-[11px_13px] text-[12px]" style={{ background: "var(--app-warning-bg)", border: "1px solid var(--app-warning-border)", color: "#93370D" }}>
              Competitor figures come from public listing data. Review text itself isn&apos;t stored by Noxtill.
            </div>
          </div>
        </div>
        <div className="flex gap-[9px] p-[14px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
          <button type="button" onClick={onClose} style={outlineBtn}>Close</button>
          <button type="button" onClick={onRefresh} style={{ ...primaryBtn, flex: 1 }}>Refresh Now</button>
        </div>
      </aside>
    </div>
  );
}

function AddCompetitorModal({ onClose, atLimit }: { onClose: () => void; atLimit: boolean }) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[] | null>(null);
  const [manualName, setManualName] = useState("");

  const searchMutation = useMutation({
    mutationFn: () => searchCompetitorPlaces(query.trim()),
    onSuccess: (r) => setResults(r),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Search failed — please try again."),
  });
  const addFromPlace = useMutation({
    mutationFn: (place: PlaceSearchResult) => addCompetitorFromPlace(place),
    onSuccess: (_d, place) => { queryClient.invalidateQueries({ queryKey: ["competitors-raw"] }); toast.success(`${place.name} added to competitor tracking.`); onClose(); },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't add this competitor."),
  });
  const addManual = useMutation({
    mutationFn: () => addCompetitor(manualName.trim()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["competitors-raw"] }); toast.success(`${manualName} added to competitor tracking.`); onClose(); },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't add this competitor."),
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-5" style={{ background: "rgba(10,27,42,.42)" }} onClick={onClose}>
      <div className="w-[490px] max-w-full rounded-[18px]" style={{ background: "var(--app-surface)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 p-[17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 flex-1 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>Add Competitor</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-[9px]" style={{ border: "1px solid var(--app-border)" }}>×</button>
        </div>
        {atLimit ? (
          <div className="p-[17px] text-[13px]" style={{ color: "var(--app-danger-strong)" }}>You&apos;re tracking the maximum of {MAX_COMPETITORS} competitors. Remove one before adding another.</div>
        ) : (
          <div className="flex flex-col gap-3 p-[17px]">
            <div className="flex gap-2">
              <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchMutation.mutate()} placeholder="Search a business…" className="flex-1 rounded-[11px] p-3 text-[13.5px]" style={{ border: "1px solid var(--app-border)" }} autoFocus />
              <button type="button" onClick={() => searchMutation.mutate()} disabled={!query.trim() || searchMutation.isPending} style={outlineBtn}>{searchMutation.isPending ? "…" : "Search"}</button>
            </div>
            {results && results.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded-[11px]" style={{ border: "1px solid var(--app-border)" }}>
                {results.map((r) => (
                  <button key={r.placeId} type="button" onClick={() => addFromPlace.mutate(r)} disabled={addFromPlace.isPending} className="flex w-full items-center gap-[10px] p-3 text-left">
                    <span className="min-w-0 flex-1"><span className="block truncate text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{r.name}</span>{r.address && <span className="block truncate text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{r.address}</span>}</span>
                    {r.rating != null && <span className="text-[11px] font-bold" style={{ color: "var(--app-text-faint)" }}>{r.rating.toFixed(1)}★</span>}
                    <span className="text-[11px] font-bold" style={{ color: "var(--app-success-text)" }}>Match</span>
                  </button>
                ))}
              </div>
            )}
            {results && results.length === 0 && (
              <p className="m-0 text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>No search results — add manually below instead.</p>
            )}
            <div className="rounded-[11px] p-[11px_13px] text-[11.5px]" style={{ background: "var(--app-surface-2)", color: "var(--app-text-faint)" }}>Only real businesses found in listing search can be matched — nothing is invented.</div>
            <div className="flex gap-2 pt-3" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
              <input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Or add by name (no lookup)" className="flex-1 rounded-[11px] p-3 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
              <button type="button" onClick={() => addManual.mutate()} disabled={!manualName.trim() || addManual.isPending} style={primaryBtn}>{addManual.isPending ? "Adding…" : "Add"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

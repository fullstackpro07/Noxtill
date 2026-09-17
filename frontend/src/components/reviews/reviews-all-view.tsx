"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/session";
import { useReviewsSearchStore } from "@/store/reviews-search-store";
import {
  fetchReviews,
  fetchReviewsSummary,
  replyToReview,
  aiDraftReply,
  type LiveInboxEntry,
  type LiveExternalReview,
  type LivePrivateFeedback,
} from "@/lib/reviews-api";
import { fetchCustomers } from "@/lib/customers-api";
import { formatDate } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { useSendReviewRequestDialog } from "./send-review-request-dialog";

const PLATFORM_META: Record<string, { bg: string; fg: string; init: string }> = {
  google: { bg: "#EEF4FF", fg: "#4285F4", init: "G" },
  facebook: { bg: "#EEF4FF", fg: "#1877F2", init: "f" },
  trustpilot: { bg: "#E8F7EE", fg: "#00B67A", init: "T" },
  tripadvisor: { bg: "#E6F6F4", fg: "#0D9488", init: "TA" },
  yelp: { bg: "#FEF3F2", fg: "#D32323", init: "Y" },
};
const DEFAULT_PLATFORM_META = { bg: "var(--app-surface-2)", fg: "var(--app-text-faint)", init: "P" };

function platformMeta(platform: string) {
  return PLATFORM_META[platform.toLowerCase()] ?? DEFAULT_PLATFORM_META;
}
function platformLabel(platform: string): string {
  if (platform.toLowerCase() === "gmb") return "Google";
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}
function isReplied(e: LiveInboxEntry): boolean {
  return e.source === "external" ? !!e.replyText : e.status !== "open";
}
function starList(n: number) {
  return [1, 2, 3, 4, 5].map((i) => i <= n);
}

function downloadCsv(rows: LiveInboxEntry[]) {
  const header = "Source,Platform/Status,Author,Stars,Text,Date\n";
  const body = rows
    .map((r) =>
      r.source === "external"
        ? `external,"${r.platform}","${(r.author ?? "").replace(/"/g, '""')}",${r.stars},"${(r.text ?? "").replace(/"/g, '""')}",${r.createdAt}`
        : `private,"${r.status}","",${r.stars},"${(r.message ?? "").replace(/"/g, '""')}",${r.createdAt}`,
    )
    .join("\n");
  const blob = new Blob([header + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reviews-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 10, padding: "8px 12px", fontSize: 11.5, fontWeight: 700, color: "var(--app-text-faint)", minHeight: 40 };

export function ReviewsAllView() {
  const session = useSession();
  const owner = session.user.role !== "staff";
  const searchQuery = useReviewsSearchStore((s) => s.query);
  const sendDialog = useSendReviewRequestDialog();

  const [platform, setPlatform] = useState("All");
  const [rating, setRating] = useState("All stars");
  const [status, setStatus] = useState("All");
  const [dateRange, setDateRange] = useState("Last 30 days");
  const [autoDraftIds, setAutoDraftIds] = useState<Set<string>>(new Set());

  const { data: entries = [], isPending, isError, refetch } = useQuery({ queryKey: ["reviews"], queryFn: fetchReviews });
  const { data: summary } = useQuery({ queryKey: ["reviews-summary"], queryFn: fetchReviewsSummary });
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const customerNames = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);

  const platforms = useMemo(() => [...new Set(entries.filter((e): e is LiveExternalReview => e.source === "external").map((e) => e.platform))].sort(), [entries]);

  const now = new Date();
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const windowDays = dateRange === "Last 30 days" ? 30 : dateRange === "Last 90 days" ? 90 : dateRange === "This year" ? 366 : null;
    return entries.filter((e) => {
      if (platform !== "All") {
        if (platform === "Private" ? e.source !== "private" : e.source !== "external" || e.platform.toLowerCase() !== platform.toLowerCase()) return false;
      }
      if (rating !== "All stars" && e.stars !== Number(rating)) return false;
      if (status !== "All") {
        const replied = isReplied(e);
        if (status === "Replied" && !replied) return false;
        if (status === "Unreplied" && replied) return false;
      }
      if (windowDays !== null) {
        const days = (now.getTime() - new Date(e.createdAt).getTime()) / 86_400_000;
        if (days > windowDays) return false;
      }
      if (q) {
        const haystack = (e.source === "external" ? `${e.author ?? ""} ${e.text ?? ""}` : `${e.message ?? ""}`).toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [entries, platform, rating, status, dateRange, searchQuery, now]);

  const totalReviews = entries.length;
  const unrepliedCount = entries.filter((e) => !isReplied(e)).length;
  const newMonth = entries.filter((e) => {
    const d = new Date(e.createdAt);
    return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
  }).length;
  const responseRate = totalReviews > 0 ? Math.round((entries.filter(isReplied).length / totalReviews) * 100) : 0;

  const starCounts = summary?.distribution ?? [];
  const maxStarCount = Math.max(1, ...starCounts.map((d) => d.count));
  const platformDist = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      const key = e.source === "external" ? platformLabel(e.platform) : "Private";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const sparkline = summary?.sparkline ?? [];
  const trendDirection =
    sparkline.length >= 2 ? (sparkline[sparkline.length - 1] > sparkline[sparkline.length - 2] ? "up" : sparkline[sparkline.length - 1] < sparkline[sparkline.length - 2] ? "down" : "flat") : null;

  function runBulkAiDraft() {
    const ids = entries.filter((e) => e.source === "external" && !e.replyText).slice(0, 5).map((e) => e.id);
    if (ids.length === 0) {
      toast.error("Nothing unreplied to draft.");
      return;
    }
    setAutoDraftIds(new Set(ids));
    toast.success(`Drafting AI replies for ${ids.length} review${ids.length === 1 ? "" : "s"} — each still needs your approval.`);
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div data-kpi className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))" }}>
        <KpiCard label="Average Rating" value={summary ? `${summary.averageRating.toFixed(1)} / 5` : "…"} />
        <KpiCard label="Total Reviews" value={String(totalReviews)} />
        <KpiCard label="New This Month" value={String(newMonth)} />
        <KpiCard label="Unreplied" value={String(unrepliedCount)} accentBorder="#FDD9D6" accentColor="var(--app-danger-strong)" />
        <KpiCard label="Response Rate" value={`${responseRate}%`} valueColor="var(--app-primary)" />
      </div>

      <div className="grid items-start gap-[15px]" style={{ gridTemplateColumns: "210px minmax(0,1fr) 292px" }}>
        {/* Filters */}
        <div className="flex flex-col gap-[11px] rounded-[16px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 text-[13.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Filters</h3>
          <FilterSelect label="Platform" value={platform} onChange={setPlatform} options={["All", ...platforms.map(platformLabel), "Private"]} />
          <FilterSelect label="Rating" value={rating} onChange={setRating} options={["All stars", "5", "4", "3", "2", "1"]} />
          <FilterSelect label="Status" value={status} onChange={setStatus} options={["All", "Unreplied", "Replied"]} />
          <FilterSelect label="Date range" value={dateRange} onChange={setDateRange} options={["Last 30 days", "Last 90 days", "This year", "All time"]} />
          <button
            type="button"
            onClick={() => {
              setPlatform("All");
              setRating("All stars");
              setStatus("All");
              setDateRange("All time");
            }}
            style={outlineBtn}
          >
            Clear filters
          </button>
          {owner && (
            <>
              <button type="button" onClick={runBulkAiDraft} style={{ ...outlineBtn, border: "1px dashed #C6CFD8", color: "var(--app-success-text)" }}>
                Bulk AI Draft
              </button>
              <button type="button" onClick={() => downloadCsv(filtered)} style={outlineBtn}>
                Export
              </button>
            </>
          )}
        </div>

        {/* Feed */}
        <div className="flex min-w-0 flex-col gap-[11px]">
          {isError ? (
            <div className="rounded-[16px] p-[24px] text-center" style={{ background: "var(--app-surface)", border: "1px solid #FDD9D6" }}>
              <p className="m-0 text-[13px] font-bold" style={{ color: "var(--app-danger-strong)" }}>Couldn&apos;t load reviews</p>
              <button type="button" onClick={() => refetch()} className="mt-3" style={outlineBtn}>Retry</button>
            </div>
          ) : isPending ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-[86px] animate-pulse rounded-[15px]" style={{ background: "var(--app-surface-2)" }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-[16px] p-[52px_18px] text-center" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <p className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No reviews match — send your first review request</p>
              <button type="button" onClick={sendDialog.open} className="mt-[15px] rounded-[12px] px-[22px] py-3 text-[13px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>
                Send Review Request
              </button>
            </div>
          ) : (
            filtered.map((entry) =>
              entry.source === "external" ? (
                <ExternalReviewCard
                  key={entry.id}
                  review={entry}
                  owner={owner}
                  autoDraft={autoDraftIds.has(entry.id)}
                  onAutoDraftHandled={() => setAutoDraftIds((prev) => { const next = new Set(prev); next.delete(entry.id); return next; })}
                />
              ) : (
                <PrivateFeedbackCard key={entry.id} entry={entry} customerName={entry.customerId ? (customerNames.get(entry.customerId) ?? "Customer") : "Anonymous"} />
              ),
            )
          )}
        </div>

        {/* Side charts */}
        <div className="flex flex-col gap-[15px]">
          <div className="rounded-[16px] p-4" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <h3 className="m-0 mb-2.5 text-[13.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Rating trend — last 8 weeks</h3>
            {sparkline.length >= 2 ? <RatingTrendChart values={sparkline} /> : <p className="m-0 text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Not enough weekly history yet.</p>}
          </div>
          <div className="rounded-[16px] p-4" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <h3 className="m-0 mb-2.5 text-[13.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Star distribution</h3>
            <div className="flex flex-col gap-2">
              {starCounts.map((d) => (
                <div key={d.stars} className="flex items-center gap-[9px]">
                  <span className="w-3 text-[11.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>{d.stars}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--app-surface-2)" }}>
                    <span className="block h-full rounded-full" style={{ width: `${(d.count / maxStarCount) * 100}%`, background: d.stars >= 4 ? "var(--app-primary)" : d.stars === 3 ? "#F59E0B" : "var(--app-danger-strong)" }} />
                  </span>
                  <span className="w-[22px] text-right text-[11px] font-bold" style={{ color: "var(--app-text-faintest)" }}>{d.count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[16px] p-4" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <h3 className="m-0 mb-2.5 text-[13.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Reviews per platform</h3>
            <div className="flex flex-col gap-2">
              {platformDist.map(([name, count]) => (
                <div key={name} className="flex items-center gap-[9px]">
                  <span className="h-2 w-2 rounded-[2px]" style={{ background: name === "Private" ? "var(--app-text-faint)" : platformMeta(name).fg }} />
                  <span className="flex-1 text-[11.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{name}</span>
                  <span className="text-[11.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{count}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-col gap-1.5 pt-2.5" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
              <div className="flex justify-between">
                <span className="text-[11.5px]" style={{ color: "var(--app-text-faintest)" }}>Response rate</span>
                <span className="text-[11.5px] font-extrabold" style={{ color: "var(--app-success-text)" }}>{responseRate}%</span>
              </div>
              {trendDirection && (
                <div className="flex justify-between">
                  <span className="text-[11.5px]" style={{ color: "var(--app-text-faintest)" }}>Recent trend</span>
                  <span className="text-[11.5px] font-extrabold" style={{ color: trendDirection === "up" ? "var(--app-success-text)" : trendDirection === "down" ? "var(--app-danger-strong)" : "var(--app-text-faint)" }}>
                    {trendDirection === "up" ? "▲ Improving" : trendDirection === "down" ? "▼ Declining" : "— Steady"}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function KpiCard({ label, value, accentBorder, accentColor, valueColor }: { label: string; value: string; accentBorder?: string; accentColor?: string; valueColor?: string }) {
  return (
    <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: `${accentBorder ? "1.5px" : "1px"} solid ${accentBorder ?? "var(--app-border)"}` }}>
      <div className="text-[12px] font-semibold" style={{ color: accentColor ?? "var(--app-text-faintest)" }}>{label}</div>
      <div className="mt-1.5 text-[23px] font-extrabold" style={{ color: valueColor ?? "var(--app-text)", letterSpacing: "-.6px" }}>{value}</div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label className="mb-[5px] block text-[10.5px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-[10px] p-[9px] text-[12.5px] font-semibold"
        style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", minHeight: 42 }}
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

function RatingTrendChart({ values }: { values: number[] }) {
  const width = 260;
  const height = 96;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (width - 20) / (values.length - 1);
  const pts = values.map((v, i) => ({ x: 10 + i * step, y: 10 + (height - 22) * (1 - (v - min) / span) }));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)} ${height - 10} L${pts[0].x.toFixed(1)} ${height - 10} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" style={{ height: 96 }}>
      <path d={area} fill="rgba(18,161,80,.10)" />
      <path d={line} fill="none" stroke="var(--app-primary)" strokeWidth={2.2} strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.8} fill="#fff" stroke="var(--app-primary)" strokeWidth={1.6} />
      ))}
    </svg>
  );
}

function ExternalReviewCard({
  review,
  owner,
  autoDraft,
  onAutoDraftHandled,
}: {
  review: LiveExternalReview;
  owner: boolean;
  autoDraft: boolean;
  onAutoDraftHandled: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const queryClient = useQueryClient();
  const posted = !!review.replyText;
  const meta = platformMeta(review.platform);

  const draftMutation = useMutation({
    mutationFn: () => aiDraftReply(review.id),
    onSuccess: ({ draft: text }) => {
      setDraft(text);
      setEditing(true);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't draft a reply — please try again."),
    onSettled: onAutoDraftHandled,
  });

  const postMutation = useMutation({
    mutationFn: () => replyToReview(review.id, draft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviews"] });
      setEditing(false);
      toast.success("Reply saved — it'll post once your Google listing is connected.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this reply — please try again."),
  });

  useEffect(() => {
    if (autoDraft && !posted && !editing && !draftMutation.isPending) draftMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDraft]);

  return (
    <article className="rounded-[15px] p-[15px_17px]" style={{ background: "var(--app-surface)", border: `1px solid ${posted ? "var(--app-border)" : "var(--app-warning-border)"}` }}>
      <div className="flex flex-wrap items-center gap-[9px]">
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] text-[11px] font-extrabold" style={{ background: meta.bg, color: meta.fg }}>{meta.init}</span>
        <span>
          <span className="block text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{review.author ?? "Anonymous"}</span>
          <span className="block text-[10.5px]" style={{ color: "var(--app-text-disabled)", marginTop: 1 }}>{platformLabel(review.platform)} · {formatDate(review.createdAt)}</span>
        </span>
        <span className="ml-auto flex gap-0.5">
          {starList(review.stars).map((filled, i) => (
            <StarIcon key={i} filled={filled} size={14} />
          ))}
        </span>
        <span className="rounded-full px-[9px] py-[3px] text-[10px] font-extrabold" style={{ background: posted ? "var(--app-success-bg)" : "#FEE4E2", color: posted ? "var(--app-success-text)" : "var(--app-danger-strong)" }}>
          {posted ? "Replied" : "Unreplied"}
        </span>
      </div>
      <p className="m-0 mt-[11px] text-[13px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>{review.text ?? "(no text left with this review)"}</p>

      {posted ? (
        <div className="mt-[11px] rounded-[11px] p-[11px_13px]" style={{ background: "var(--app-success-bg)", border: "1px solid var(--app-success-border)" }}>
          <div className="text-[10.5px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-success-text)" }}>Your reply</div>
          <div className="mt-1 text-[12.5px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>{review.replyText}</div>
        </div>
      ) : editing ? (
        <div className="mt-[11px]">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} autoFocus className="w-full rounded-[11px] p-[11px] text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 12px", fontSize: 11.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 40 }}>Cancel</button>
            <button type="button" onClick={() => postMutation.mutate()} disabled={!draft.trim() || postMutation.isPending} style={{ border: 0, background: "var(--app-primary)", borderRadius: 9, padding: "8px 14px", fontSize: 11.5, fontWeight: 800, color: "#fff", minHeight: 40 }}>
              {postMutation.isPending ? "Saving…" : "Approve & Post"}
            </button>
          </div>
        </div>
      ) : (
        owner && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => toast.success(`Reported to ${platformLabel(review.platform)} — Noxtill can't remove reviews directly; also flag it there.`)} style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 12px", fontSize: 11.5, fontWeight: 700, color: "var(--app-text-faintest)", minHeight: 40 }}>
              Report
            </button>
            <span className="flex-1" />
            <button type="button" onClick={() => draftMutation.mutate()} disabled={draftMutation.isPending} style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 13px", fontSize: 11.5, fontWeight: 700, color: "var(--app-success-text)", minHeight: 40 }}>
              {draftMutation.isPending ? "Drafting…" : "AI Reply"}
            </button>
            <button type="button" onClick={() => setEditing(true)} style={{ border: 0, background: "var(--app-primary)", borderRadius: 9, padding: "8px 14px", fontSize: 11.5, fontWeight: 800, color: "#fff", minHeight: 40 }}>
              Reply
            </button>
          </div>
        )
      )}
    </article>
  );
}

function PrivateFeedbackCard({ entry, customerName }: { entry: LivePrivateFeedback; customerName: string }) {
  return (
    <article className="rounded-[15px] p-[15px_17px]" style={{ background: "var(--app-surface)", border: `1px solid ${entry.status === "open" ? "var(--app-warning-border)" : "var(--app-border)"}` }}>
      <div className="flex flex-wrap items-center gap-[9px]">
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] text-[11px] font-extrabold" style={{ background: "var(--app-surface-2)", color: "var(--app-text-faint)" }}>P</span>
        <span>
          <span className="block text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{customerName}</span>
          <span className="block text-[10.5px]" style={{ color: "var(--app-text-disabled)", marginTop: 1 }}>Private · {formatDate(entry.createdAt)}</span>
        </span>
        <span className="ml-auto flex gap-0.5">
          {starList(entry.stars).map((filled, i) => (
            <StarIcon key={i} filled={filled} size={14} />
          ))}
        </span>
        <span className="rounded-full px-[9px] py-[3px] text-[10px] font-extrabold" style={{ background: entry.status === "resolved" ? "var(--app-success-bg)" : entry.status === "assigned" ? "#EEF4FF" : "#FEE4E2", color: entry.status === "resolved" ? "var(--app-success-text)" : entry.status === "assigned" ? "#3538CD" : "var(--app-danger-strong)" }}>
          {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
        </span>
      </div>
      <p className="m-0 mt-[11px] text-[13px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>{entry.message ?? "(no message left)"}</p>
      <p className="m-0 mt-2 text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Private feedback — never posted publicly. Manage from the Private Reviews tab.</p>
    </article>
  );
}

function StarIcon({ filled, size = 14 }: { filled: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "#F59E0B" : "#E1E7EE"} stroke={filled ? "#F59E0B" : "#E1E7EE"}>
      <path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.4l6-.8Z" />
    </svg>
  );
}

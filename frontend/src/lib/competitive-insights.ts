/**
 * Competitive Insights — pure derivations over real rows.
 *
 * Every figure returned here is computed from something Noxtill actually holds: Google Places
 * rating/review snapshots, Meta Ad Library ads, observations the owner recorded by hand, and the
 * business's own reviews / products / sales. Where the market side of a comparison genuinely cannot
 * be known from outside a business, the row says so (`comparable: false`) instead of inventing a
 * number. No function here calls the network — screens fetch, this file only derives.
 */
import type {
  CompetitorAd,
  CompetitorDetails,
  CompetitorHistoryPoint,
  CompetitorPriority,
  RawCompetitor,
} from "@/lib/competitors-api";
import type {
  CompetitiveOpportunity,
  CompetitiveOpportunityKind,
  CompetitiveRecommendation,
  CompetitorObservation,
  CompetitorSocial,
} from "@/lib/competitive-api";
import type { Product } from "@/lib/products";
import type { ProfitProductRow } from "@/lib/profit-api";

/* ─────────────────────────────── ranges ─────────────────────────────── */

export const RANGE_OPTIONS = ["Last 30 days", "This week", "This month", "This quarter"] as const;
export type RangeKey = (typeof RANGE_OPTIONS)[number];

export function rangeSince(key: RangeKey, now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  switch (key) {
    case "This week": {
      // Monday-start week.
      const day = d.getDay();
      d.setDate(d.getDate() - ((day + 6) % 7));
      return d;
    }
    case "This month":
      d.setDate(1);
      return d;
    case "This quarter":
      d.setMonth(Math.floor(d.getMonth() / 3) * 3, 1);
      return d;
    default:
      return new Date(now.getTime() - 30 * 86_400_000);
  }
}

export function rangePhrase(key: RangeKey): string {
  return key === "Last 30 days" ? "in the last 30 days" : key.toLowerCase();
}

/* ─────────────────────────────── formatting ─────────────────────────────── */

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function shortDate(d: Date): string {
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
}

export function longDate(d: Date): string {
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function relTime(d: Date, now: Date): string {
  const ms = Math.max(0, now.getTime() - d.getTime());
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return shortDate(d);
}

export function initials(name: string): string {
  const parts = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export const PRIORITY_LABEL: Record<CompetitorPriority, string> = {
  watch_closely: "Watch closely",
  keep_an_eye: "Keep an eye on",
  background: "Background",
};
export const PRIORITY_KEYS = ["watch_closely", "keep_an_eye", "background"] as const satisfies readonly CompetitorPriority[];

/** Chip colours from the design's `chip()` table. */
export const CHIP: Record<string, { bg: string; fg: string }> = {
  "Watch closely": { bg: "#FEF3F2", fg: "#B42318" },
  "Keep an eye on": { bg: "#FEF6E7", fg: "#B54708" },
  Background: { bg: "#F2F4F7", fg: "#475467" },
  Ahead: { bg: "#E8F7EE", fg: "#0E8442" },
  Behind: { bg: "#FEF3F2", fg: "#B42318" },
  Level: { bg: "#F2F4F7", fg: "#475467" },
  "Not comparable": { bg: "#F2F4F7", fg: "#475467" },
  Observed: { bg: "#EEF4FF", fg: "#3538CD" },
  Unknown: { bg: "#F2F4F7", fg: "#475467" },
  Price: { bg: "#FEF6E7", fg: "#B54708" },
  Product: { bg: "#EEF4FF", fg: "#3538CD" },
  Service: { bg: "#EEF4FF", fg: "#3538CD" },
  Offer: { bg: "#F5EBFE", fg: "#7E22CE" },
  Content: { bg: "#E8F7EE", fg: "#0E8442" },
  Listing: { bg: "#F2F4F7", fg: "#475467" },
  Reviews: { bg: "#FEF6E7", fg: "#B54708" },
  High: { bg: "#E8F7EE", fg: "#0E8442" },
  Medium: { bg: "#FEF6E7", fg: "#B54708" },
  Low: { bg: "#F2F4F7", fg: "#475467" },
};
export const chip = (key: string) => CHIP[key] ?? CHIP.Unknown;

/* ─────────────────────────────── observations ─────────────────────────────── */

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const dayKey = (iso: string) => iso.slice(0, 10);

/** Latest recorded price/service line per label for one competitor, plus how it came to be. */
export interface ServiceRow {
  label: string;
  amount: number | null;
  seen: Date;
  source: string | null;
  /** First recorded AFTER the day the owner started recording for this competitor, and within 30 days. */
  isNew: boolean;
}

export function serviceRowsFor(competitorId: string, observations: CompetitorObservation[], now: Date): ServiceRow[] {
  const mine = observations
    .filter((o) => o.competitorId === competitorId && (o.kind === "price" || o.kind === "service"))
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  if (mine.length === 0) return [];
  const baselineDay = dayKey(observationsFor(competitorId, observations)[0].observedAt);

  const byLabel = new Map<string, CompetitorObservation[]>();
  for (const o of mine) {
    const k = norm(o.label);
    byLabel.set(k, [...(byLabel.get(k) ?? []), o]);
  }
  const rows: ServiceRow[] = [];
  for (const list of byLabel.values()) {
    const first = list[0];
    const latest = list[list.length - 1];
    // A later "service" line with no price must not blank out an earlier known price.
    const latestPriced = [...list].reverse().find((o) => o.amount != null);
    rows.push({
      label: latest.label,
      amount: latestPriced ? latestPriced.amount : null,
      seen: new Date(latest.observedAt),
      source: latest.source,
      isNew: dayKey(first.observedAt) !== baselineDay && now.getTime() - new Date(first.observedAt).getTime() <= 30 * 86_400_000,
    });
  }
  return rows.sort((a, b) => b.seen.getTime() - a.seen.getTime());
}

function observationsFor(competitorId: string, observations: CompetitorObservation[]) {
  return observations
    .filter((o) => o.competitorId === competitorId)
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
}

/* ─────────────────────────────── change events ─────────────────────────────── */

export type ChangeCategory = "Reviews" | "Price" | "Service" | "Offer";

export interface ChangeEvent {
  id: string;
  competitorId: string;
  competitorName: string;
  category: ChangeCategory;
  what: string;
  at: Date;
  /** "Google" for a snapshot, otherwise whatever the owner typed as the source. */
  source: string;
  provenance: "Observed" | "Entered by you";
  was: string;
  now: string;
  meaning: string;
  confidence: string;
  /** Set on Price / Service events that carry a price — feeds the Pricing screen. */
  price?: { label: string; from: number | null; to: number | null; dir: "up" | "down" | "new" };
  offer?: { label: string; endsAt: Date | null };
}

export interface InsightsInput {
  now: Date;
  range: RangeKey;
  money: (n: number) => string;
  competitors: RawCompetitor[];
  /** Google rating snapshots per competitor id, oldest first. */
  history: Record<string, CompetitorHistoryPoint[]>;
  observations: CompetitorObservation[];
  /** Meta Ad Library ads per competitor id — only present for competitors with a linked page. */
  ads: Record<string, CompetitorAd[]>;
  yourRating: number | null;
  yourReviewCount: number;
  /** % of your public reviews that have a reply, or null when you have none. */
  yourReplyRate: number | null;
  categoryAverage: { averageRating: number | null; ratedCount: number } | null;
  products: Product[];
  profitRows: ProfitProductRow[];
  yourPostsPerWeek: number | null;
  /** Your currently active ad campaigns, or null when the ads data isn't available. */
  yourActiveAds: number | null;
  /** Your listing scored on the same seven public checks as a competitor's Google listing, or null with no Master Record. */
  yourListingCompleteness: number | null;
  /** Public listing details and completeness per competitor id, from Google Places (only those that resolved). */
  details: Record<string, CompetitorDetails>;
  /** Public Instagram posting per competitor id (only competitors with a handle). */
  social: Record<string, CompetitorSocial>;
  opportunities: CompetitiveOpportunity[];
  recommendations: CompetitiveRecommendation[];
}

function yourProductFor(label: string, products: Product[]): Product | undefined {
  const k = norm(label);
  return products.find((p) => p.active && norm(p.name) === k);
}

function marginPct(price: number, cost: number): number | null {
  return price > 0 ? ((price - cost) / price) * 100 : null;
}

export function buildChangeEvents(input: InsightsInput): ChangeEvent[] {
  const { competitors, history, observations, yourRating, money, products } = input;
  const nameOf = new Map(competitors.map((c) => [c.id, c.name]));
  const events: ChangeEvent[] = [];

  // 1 — Google snapshots: a change is any week-to-week movement in rating or review count.
  for (const c of competitors) {
    const h = history[c.id] ?? [];
    for (let i = 1; i < h.length; i++) {
      const prev = h[i - 1];
      const next = h[i];
      const dCount = next.reviewsCount - prev.reviewsCount;
      const dRating = Math.round((next.rating - prev.rating) * 10) / 10;
      if (dCount === 0 && dRating === 0) continue;
      const parts: string[] = [];
      if (dCount !== 0) {
        parts.push(
          `${dCount > 0 ? "gained" : "lost"} ${Math.abs(dCount)} public review${Math.abs(dCount) === 1 ? "" : "s"} (${prev.reviewsCount} → ${next.reviewsCount})`,
        );
      }
      if (dRating !== 0) {
        parts.push(`rating ${dRating > 0 ? "rose" : "fell"} from ${prev.rating.toFixed(1)} to ${next.rating.toFixed(1)}`);
      }
      const gap = yourRating != null ? Math.round((next.rating - yourRating) * 10) / 10 : null;
      events.push({
        id: `snap-${c.id}-${next.capturedAt}`,
        competitorId: c.id,
        competitorName: c.name,
        category: "Reviews",
        what: `${c.name} ${parts.join(", and its ")}.`,
        at: new Date(next.capturedAt),
        source: "Google",
        provenance: "Observed",
        was: `${prev.rating.toFixed(1)} from ${prev.reviewsCount} reviews`,
        now: `${next.rating.toFixed(1)} from ${next.reviewsCount} reviews`,
        meaning:
          gap == null
            ? "Your own rating isn't available yet, so there is nothing to compare it with."
            : gap > 0
              ? `${c.name} is now rated ${gap.toFixed(1)} above your ${yourRating!.toFixed(1)}.`
              : gap < 0
                ? `${c.name} is now rated ${Math.abs(gap).toFixed(1)} below your ${yourRating!.toFixed(1)}.`
                : `${c.name} is now level with your ${yourRating!.toFixed(1)} rating.`,
        confidence: "High — read from their public Google listing.",
      });
    }
  }

  // 2 — Owner-recorded observations. The first day the owner records anything for a competitor is a
  // baseline (what was true when they started watching), not a change.
  const byCompetitor = new Map<string, CompetitorObservation[]>();
  for (const o of observations) byCompetitor.set(o.competitorId, [...(byCompetitor.get(o.competitorId) ?? []), o]);

  for (const [competitorId, list] of byCompetitor) {
    const name = nameOf.get(competitorId);
    if (!name) continue;
    const sorted = [...list].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
    const baselineDay = dayKey(sorted[0].observedAt);
    const seenLabels = new Map<string, CompetitorObservation>();

    for (const o of sorted) {
      const key = norm(o.label);
      const at = new Date(o.observedAt);
      const src = o.source?.trim() || "your own note";

      if (o.kind === "offer") {
        if (dayKey(o.observedAt) === baselineDay) continue;
        events.push({
          id: o.id,
          competitorId,
          competitorName: name,
          category: "Offer",
          what: `${name} started a public offer: ${o.label}.`,
          at,
          source: src,
          provenance: "Entered by you",
          was: "No offer recorded",
          now: o.label,
          meaning: o.endsAt
            ? `It ends ${longDate(new Date(o.endsAt))}.`
            : "No end date was published, so whether it is promotional or permanent is not yet clear.",
          confidence: "Recorded by you from their public page — as reliable as the note.",
          offer: { label: o.label, endsAt: o.endsAt ? new Date(o.endsAt) : null },
        });
        continue;
      }

      const prev = seenLabels.get(key);
      seenLabels.set(key, o.amount != null || !prev ? o : { ...prev, observedAt: o.observedAt });
      const isBaseline = dayKey(o.observedAt) === baselineDay;
      const mine = yourProductFor(o.label, products);

      if (!prev) {
        if (isBaseline) continue;
        events.push({
          id: o.id,
          competitorId,
          competitorName: name,
          category: "Service",
          what: `${name} listed ${o.label}${o.amount != null ? ` at ${money(o.amount)}` : ""}.`,
          at,
          source: src,
          provenance: "Entered by you",
          was: "Not previously listed",
          now: o.amount != null ? money(o.amount) : "Listed, no price published",
          meaning: mine
            ? `You list ${mine.name} at ${money(mine.price)}.`
            : "You don't list a matching item, so there is nothing to compare it with directly.",
          confidence: "Recorded by you from their public page — as reliable as the note.",
          price: { label: o.label, from: null, to: o.amount, dir: "new" },
        });
        continue;
      }

      if (o.amount != null && prev.amount != null && Number(o.amount) !== Number(prev.amount)) {
        const up = o.amount > prev.amount;
        events.push({
          id: o.id,
          competitorId,
          competitorName: name,
          category: "Price",
          what: `${name} moved ${o.label} from ${money(prev.amount)} to ${money(o.amount)}.`,
          at,
          source: src,
          provenance: "Entered by you",
          was: money(prev.amount),
          now: money(o.amount),
          meaning: mine
            ? `Yours is ${money(mine.price)}. ${
                mine.price < o.amount ? "You are the cheaper option." : mine.price > o.amount ? "You are now the dearer option." : "You are level."
              }`
            : "You don't list a matching item, so there is nothing to compare it with directly.",
          confidence: "Recorded by you from their public page — as reliable as the note.",
          price: { label: o.label, from: prev.amount, to: o.amount, dir: up ? "up" : "down" },
        });
      } else if (o.amount != null && prev.amount == null) {
        events.push({
          id: o.id,
          competitorId,
          competitorName: name,
          category: "Price",
          what: `${name} published a price for ${o.label}: ${money(o.amount)}.`,
          at,
          source: src,
          provenance: "Entered by you",
          was: "No price published",
          now: money(o.amount),
          meaning: mine ? `Yours is ${money(mine.price)}.` : "You don't list a matching item.",
          confidence: "Recorded by you from their public page — as reliable as the note.",
          price: { label: o.label, from: null, to: o.amount, dir: "new" },
        });
      }
    }
  }

  return events.sort((a, b) => b.at.getTime() - a.at.getTime());
}

/* ─────────────────────────────── per-competitor stats ─────────────────────────────── */

export interface CompetitorStats {
  competitor: RawCompetitor;
  init: string;
  rating: number | null;
  reviews: number | null;
  since: Date;
  changesInRange: number;
  changesTotal: number;
  recent: string;
  sparkline: number[];
}

export function buildCompetitorStats(input: InsightsInput, events: ChangeEvent[]): CompetitorStats[] {
  const since = rangeSince(input.range, input.now);
  return input.competitors.map((c) => {
    const mine = events.filter((e) => e.competitorId === c.id);
    const inRange = mine.filter((e) => e.at >= since);
    return {
      competitor: c,
      init: initials(c.name),
      rating: c.lastRating != null ? Number(c.lastRating) : null,
      reviews: c.lastReviewsCount,
      since: new Date(c.createdAt),
      changesInRange: inRange.length,
      changesTotal: mine.length,
      recent: mine[0] ? mine[0].what : "No changes seen yet — Noxtill records a change when their public rating or a recorded price moves.",
      sparkline: (input.history[c.id] ?? []).map((h) => h.rating),
    };
  });
}

/* ─────────────────────────────── you against the market ─────────────────────────────── */

export type BenchPosition = "Ahead" | "Behind" | "Level" | "Not comparable";

export interface BenchRow {
  key: string;
  label: string;
  you: string;
  them: string;
  pos: BenchPosition;
  /** A sentence about this row for SWOT / the brief, or null when the row says nothing useful. */
  note: string | null;
}

export function buildBench(input: InsightsInput): BenchRow[] {
  const { competitors, yourRating, yourReviewCount, yourReplyRate, categoryAverage, products, yourPostsPerWeek, yourActiveAds, yourListingCompleteness, ads } = input;
  const rows: BenchRow[] = [];

  const themRating = categoryAverage?.averageRating ?? null;
  rows.push({
    key: "rating",
    label: "Public rating",
    you: yourRating != null && yourReviewCount > 0 ? yourRating.toFixed(1) : "—",
    them: themRating != null ? themRating.toFixed(1) : "Not tracked",
    pos:
      yourRating == null || yourReviewCount === 0 || themRating == null
        ? "Not comparable"
        : yourRating - themRating > 0.05
          ? "Ahead"
          : yourRating - themRating < -0.05
            ? "Behind"
            : "Level",
    note:
      yourRating != null && themRating != null
        ? `Your public rating (${yourRating.toFixed(1)}) against the tracked-competitor average (${themRating.toFixed(1)})`
        : null,
  });

  const counts = competitors.map((c) => c.lastReviewsCount).filter((n): n is number => n != null);
  const themCount = counts.length ? Math.round(counts.reduce((a, b) => a + b, 0) / counts.length) : null;
  rows.push({
    key: "reviews",
    label: "Public review count",
    you: String(yourReviewCount),
    them: themCount != null ? String(themCount) : "Not tracked",
    pos: themCount == null ? "Not comparable" : yourReviewCount > themCount ? "Ahead" : yourReviewCount < themCount ? "Behind" : "Level",
    note: themCount != null ? `${yourReviewCount} public reviews against a competitor average of ${themCount}` : null,
  });

  rows.push({
    key: "replied",
    label: "Reviews replied to",
    you: yourReplyRate != null ? `${Math.round(yourReplyRate)}%` : "—",
    // Google's public Places data carries no owner replies, so a competitor's reply rate cannot be read.
    them: "Not available",
    pos: "Not comparable",
    note: yourReplyRate != null ? `You reply to ${Math.round(yourReplyRate)}% of your public reviews` : null,
  });

  const activeItems = products.filter((p) => p.active).length;
  const observedCounts = competitors
    .map((c) => serviceRowsFor(c.id, input.observations, input.now).length)
    .filter((n) => n > 0);
  const themItems = observedCounts.length ? Math.round((observedCounts.reduce((a, b) => a + b, 0) / observedCounts.length) * 10) / 10 : null;
  rows.push({
    key: "services",
    label: "Services and products listed",
    you: String(activeItems),
    them: themItems != null ? `${themItems} (recorded lines)` : "Not tracked",
    pos: themItems == null ? "Not comparable" : activeItems > themItems ? "Ahead" : activeItems < themItems ? "Behind" : "Level",
    note: null,
  });

  const igOk = Object.values(input.social).flatMap((r) => (r.status === "ok" ? [r] : []));
  const themPerWeek = igOk.length ? igOk.reduce((sum, r) => sum + r.postsLast30 / (30 / 7), 0) / igOk.length : null;
  const themCapped = igOk.some((r) => r.capped);
  rows.push({
    key: "posts",
    label: "Posts per week",
    you: yourPostsPerWeek != null ? yourPostsPerWeek.toFixed(1) : "—",
    them: themPerWeek != null ? `${themCapped ? "≥ " : ""}${themPerWeek.toFixed(1)} (Instagram)` : "Not tracked",
    pos:
      themPerWeek == null || yourPostsPerWeek == null
        ? "Not comparable"
        : yourPostsPerWeek > themPerWeek + 0.05
          ? "Ahead"
          : yourPostsPerWeek < themPerWeek - 0.05
            ? "Behind"
            : "Level",
    note:
      themPerWeek != null && yourPostsPerWeek != null
        ? `You publish ${yourPostsPerWeek.toFixed(1)} posts a week against about ${themPerWeek.toFixed(1)} on competitors' Instagram`
        : null,
  });

  const themAds = Object.values(ads).reduce((sum, list) => sum + list.filter((a) => !a.endedAt).length, 0);
  const haveAds = Object.keys(ads).length > 0;
  rows.push({
    key: "ads",
    label: "Ads visible right now",
    you: yourActiveAds != null ? String(yourActiveAds) : "—",
    them: haveAds ? String(Math.round((themAds / Object.keys(ads).length) * 10) / 10) : "Not tracked",
    pos:
      !haveAds || yourActiveAds == null
        ? "Not comparable"
        : yourActiveAds > themAds / Object.keys(ads).length
          ? "Ahead"
          : yourActiveAds < themAds / Object.keys(ads).length
            ? "Behind"
            : "Level",
    note: null,
  });

  const compScores = Object.values(input.details).flatMap((d) => (d.completeness ? [d.completeness.percent] : []));
  const themComplete = compScores.length ? compScores.reduce((a, b) => a + b, 0) / compScores.length : null;
  rows.push({
    key: "completeness",
    label: "Listing completeness",
    you: yourListingCompleteness != null ? `${Math.round(yourListingCompleteness)}%` : "—",
    them: themComplete != null ? `${Math.round(themComplete)}%` : "Not tracked",
    pos:
      themComplete == null || yourListingCompleteness == null
        ? "Not comparable"
        : yourListingCompleteness > themComplete + 0.5
          ? "Ahead"
          : yourListingCompleteness < themComplete - 0.5
            ? "Behind"
            : "Level",
    note:
      themComplete != null && yourListingCompleteness != null
        ? `Your listing is ${Math.round(yourListingCompleteness)}% complete against a competitor average of ${Math.round(themComplete)}% (same seven public checks)`
        : null,
  });

  return rows;
}

/* ─────────────────────────────── price comparison ─────────────────────────────── */

export interface CompareRow {
  yourName: string | null;
  yourPrice: number | null;
  theirName: string | null;
  theirPrice: number | null;
  /** yours − theirs, only when both prices exist. */
  diff: number | null;
  diffPct: number | null;
  seen: Date | null;
  yourKind: "product" | "service" | null;
  unitsSold: number;
  marginPct: number | null;
}

export function buildCompareRows(competitorId: string, input: InsightsInput): CompareRow[] {
  const theirs = serviceRowsFor(competitorId, input.observations, input.now);
  const units = new Map(input.profitRows.map((r) => [r.productId, r.units]));
  const yours = input.products.filter((p) => p.active);
  const used = new Set<string>();
  const rows: CompareRow[] = [];

  for (const p of yours) {
    const match = theirs.find((t) => norm(t.label) === norm(p.name));
    if (match) used.add(norm(match.label));
    const both = match != null && match.amount != null && match.amount > 0;
    rows.push({
      yourName: p.name,
      yourPrice: p.price,
      theirName: match ? match.label : null,
      theirPrice: match ? match.amount : null,
      diff: both ? p.price - match!.amount! : null,
      diffPct: both ? (Math.abs(p.price - match!.amount!) / match!.amount!) * 100 : null,
      seen: match ? match.seen : null,
      yourKind: p.kind === "service" ? "service" : "product",
      unitsSold: units.get(p.id) ?? 0,
      marginPct: marginPct(p.price, p.costPrice),
    });
  }
  for (const t of theirs) {
    if (used.has(norm(t.label))) continue;
    rows.push({
      yourName: null,
      yourPrice: null,
      theirName: t.label,
      theirPrice: t.amount,
      diff: null,
      diffPct: null,
      seen: t.seen,
      yourKind: null,
      unitsSold: 0,
      marginPct: null,
    });
  }
  return rows;
}

export interface GapCard {
  kind: "Yours alone" | "Theirs alone" | "You lead" | "They lead";
  title: string;
  detail: string;
}

export function buildGapCards(rows: CompareRow[], theirLineCount: number, money: (n: number) => string): GapCard[] {
  if (theirLineCount === 0) return [];
  const cards: GapCard[] = [];

  const onlyYours = rows.filter((r) => r.yourName && !r.theirName).sort((a, b) => b.unitsSold - a.unitsSold)[0];
  if (onlyYours) {
    cards.push({
      kind: "Yours alone",
      title: `You offer ${onlyYours.yourName}, they have no matching line`,
      detail: `${money(onlyYours.yourPrice ?? 0)}${onlyYours.unitsSold > 0 ? `, ${onlyYours.unitsSold} sold in the last 30 days` : ""}. Only lines you have recorded for this competitor are compared, so this may just mean it hasn't been recorded.`,
    });
  }
  const onlyTheirs = rows.find((r) => !r.yourName && r.theirName);
  if (onlyTheirs) {
    cards.push({
      kind: "Theirs alone",
      title: `They list ${onlyTheirs.theirName}, you don't`,
      detail:
        onlyTheirs.theirPrice != null
          ? `Listed at ${money(onlyTheirs.theirPrice)}. Worth a look before assuming it matters.`
          : "No price published, so demand and positioning are unknown. Worth a look before assuming it matters.",
    });
  }
  const matched = rows.filter((r) => r.diff != null && r.diff !== 0).sort((a, b) => (b.diffPct ?? 0) - (a.diffPct ?? 0))[0];
  if (matched) {
    const cheaper = matched.diff! < 0;
    cards.push({
      kind: cheaper ? "You lead" : "They lead",
      title: `Your ${matched.yourName} is ${money(Math.abs(matched.diff!))} ${cheaper ? "cheaper" : "dearer"}`,
      detail: `${matched.marginPct != null ? `Your margin on it is ${Math.round(matched.marginPct)}%. ` : ""}${
        cheaper
          ? "You are already the better-value option on this line."
          : "A higher price is not automatically a problem — what it costs you and how much demand you have matter more."
      }`,
    });
  }
  return cards;
}

/* ─────────────────────────────── pricing ─────────────────────────────── */

export interface OfferRow {
  id: string;
  who: string;
  offer: string;
  ends: string;
  live: boolean;
}

export function buildOffers(input: InsightsInput): OfferRow[] {
  const nameOf = new Map(input.competitors.map((c) => [c.id, c.name]));
  return input.observations
    .filter((o) => o.kind === "offer" && nameOf.has(o.competitorId))
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt))
    .map((o) => {
      const ends = o.endsAt ? new Date(o.endsAt) : null;
      const live = ends == null || ends.getTime() > input.now.getTime();
      return {
        id: o.id,
        who: nameOf.get(o.competitorId)!,
        offer: o.label,
        ends: ends == null ? "No end date published" : live ? `Ends ${shortDate(ends)}` : `Ended ${shortDate(ends)}`,
        live,
      };
    });
}

/* ─────────────────────────────── review themes ─────────────────────────────── */

export const THEMES: { key: string; label: string; words: RegExp }[] = [
  { key: "wait", label: "Waiting time", words: /\b(wait(ed|ing)?|queue|slow|late|delay(ed)?|long time)\b/i },
  { key: "price", label: "Price", words: /\b(pric(e|es|ey|ing)|expensive|cheap(er)?|overpriced|cost(s)?|value|afford\w*)\b/i },
  { key: "staff", label: "Staff", words: /\b(staff|team|friendly|rude|helpful|polite|barber|stylist|therapist|owner)\b/i },
  { key: "booking", label: "Booking process", words: /\b(book(ing|ed)?|appointment|reservation|schedul\w*)\b/i },
  { key: "clean", label: "Cleanliness", words: /\b(clean|dirty|hygien\w*|spotless)\b/i },
];

/** How many of the given review texts mention each theme (a review counts once per theme). */
export function themeCounts(texts: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of THEMES) out[t.key] = texts.filter((x) => t.words.test(x)).length;
  return out;
}

/* ─────────────────────────────── trends / SWOT ─────────────────────────────── */

export interface TrendCard {
  kind: "Reviews" | "Price" | "Service" | "Content";
  title: string;
  evidence: string;
  confidence: "High" | "Medium" | "Low";
  points: number;
}

const confidenceFor = (points: number): "High" | "Medium" | "Low" => (points >= 4 ? "High" : points >= 2 ? "Medium" : "Low");

export function buildTrends(input: InsightsInput, events: ChangeEvent[]): TrendCard[] {
  const cards: TrendCard[] = [];
  const { competitors, history, ads } = input;

  // Ratings: average first→last movement across competitors that have ≥2 snapshots.
  const moves = competitors
    .map((c) => history[c.id] ?? [])
    .filter((h) => h.length >= 2)
    .map((h) => ({ from: h[0].rating, to: h[h.length - 1].rating, weeks: h.length }));
  if (moves.length > 0) {
    const from = moves.reduce((s, m) => s + m.from, 0) / moves.length;
    const to = moves.reduce((s, m) => s + m.to, 0) / moves.length;
    const d = Math.round((to - from) * 10) / 10;
    cards.push({
      kind: "Reviews",
      title: d > 0 ? "Competitor ratings are rising" : d < 0 ? "Competitor ratings are slipping" : "Competitor ratings are holding steady",
      evidence: `Across ${moves.length} competitor${moves.length === 1 ? "" : "s"} with history, the average public rating went from ${from.toFixed(1)} to ${to.toFixed(1)} over ${Math.max(...moves.map((m) => m.weeks))} snapshots.`,
      confidence: confidenceFor(moves.reduce((s, m) => s + m.weeks, 0)),
      points: moves.reduce((s, m) => s + m.weeks, 0),
    });
  }

  const priceEvents = events.filter((e) => e.price && e.price.dir !== "new");
  if (priceEvents.length > 0) {
    const up = priceEvents.filter((e) => e.price!.dir === "up").length;
    const down = priceEvents.length - up;
    cards.push({
      kind: "Price",
      title: down > up ? "Recorded competitor prices are drifting down" : up > down ? "Recorded competitor prices are drifting up" : "Recorded competitor prices are moving both ways",
      evidence: `${priceEvents.length} price change${priceEvents.length === 1 ? "" : "s"} recorded: ${down} down, ${up} up.`,
      confidence: confidenceFor(priceEvents.length),
      points: priceEvents.length,
    });
  }

  const newLines = events.filter((e) => e.category === "Service");
  if (newLines.length > 0) {
    const who = [...new Set(newLines.map((e) => e.competitorName))];
    cards.push({
      kind: "Service",
      title: `${newLines.length} new line${newLines.length === 1 ? "" : "s"} appeared at competitors`,
      evidence: `Recorded at ${who.join(", ")}: ${newLines
        .slice(0, 3)
        .map((e) => e.price?.label ?? e.what)
        .join(", ")}${newLines.length > 3 ? " and more" : ""}.`,
      confidence: confidenceFor(newLines.length),
      points: newLines.length,
    });
  }

  const adCompetitors = Object.keys(ads);
  if (adCompetitors.length > 0) {
    const running = Object.values(ads).reduce((s, l) => s + l.filter((a) => !a.endedAt).length, 0);
    cards.push({
      kind: "Content",
      title: running > 0 ? "Competitors are running public ads" : "No competitor ads are running right now",
      evidence: `${running} ad${running === 1 ? "" : "s"} running across ${adCompetitors.length} linked competitor${adCompetitors.length === 1 ? "" : "s"} in the Meta Ad Library.`,
      confidence: confidenceFor(adCompetitors.length),
      points: adCompetitors.length,
    });
  }
  return cards;
}

export interface SwotBox {
  key: "strong" | "weak" | "open" | "watch";
  heading: string;
  color: string;
  bg: string;
  border: string;
  items: string[];
}

export function buildSwot(input: InsightsInput, bench: BenchRow[], events: ChangeEvent[], stats: CompetitorStats[]): SwotBox[] {
  const strong = bench.filter((b) => b.pos === "Ahead" && b.note).map((b) => `${b.note} — you are ahead`);
  const weak = bench.filter((b) => b.pos === "Behind" && b.note).map((b) => `${b.note} — you are behind`);
  const yourRating = input.yourRating;
  const rated = stats.filter((s) => s.rating != null && yourRating != null && s.rating > yourRating);
  for (const s of rated) weak.push(`${s.competitor.name} is rated ${s.rating!.toFixed(1)}, above your ${yourRating!.toFixed(1)}`);

  const open = input.recommendations.slice(0, 4).map((r) => r.recommendation);
  const watch: string[] = [];
  for (const e of events.filter((x) => x.category === "Price" && x.price?.dir === "down").slice(0, 2)) watch.push(e.what);
  for (const e of events.filter((x) => x.category === "Offer").slice(0, 2)) watch.push(e.what);
  for (const s of stats.filter((x) => x.competitor.priority === "watch_closely" && x.changesInRange > 0).slice(0, 2)) {
    watch.push(`${s.competitor.name} made ${s.changesInRange} change${s.changesInRange === 1 ? "" : "s"} in this period`);
  }

  const none = "Nothing to report yet.";
  return [
    { key: "strong", heading: "What you do well", color: "#0E8442", bg: "#F7FCF9", border: "#D5EFE0", items: strong.length ? strong.slice(0, 4) : [none] },
    { key: "weak", heading: "Where you are weaker", color: "#B42318", bg: "#FEF3F2", border: "#FDD9D6", items: weak.length ? weak.slice(0, 4) : [none] },
    { key: "open", heading: "Openings", color: "#3538CD", bg: "#EEF4FF", border: "#C7D7FE", items: open.length ? open : [none] },
    { key: "watch", heading: "What to watch", color: "#B54708", bg: "#FFFBF2", border: "#FDE3B3", items: watch.length ? watch.slice(0, 4) : [none] },
  ];
}

/* ─────────────────────────────── overview headline cards ─────────────────────────────── */

export interface HeadlineCard {
  title: string;
  why: string;
  evidence: string;
  /** Rows for the "Worth watching" drawer. */
  rows: { label: string; value: string; provenance: "Observed" | "Your records" | "Calculated" | "Unavailable" }[];
  verdict: string;
  kind: "price" | "rating" | "opportunity";
}

/** The single most decision-worthy thing: a price undercut you can measure, else a rival out-rating you, else your top opportunity. */
export function buildTopThreat(input: InsightsInput, stats: CompetitorStats[]): HeadlineCard | null {
  const { money, products, profitRows, competitors } = input;
  const units = new Map(profitRows.map((r) => [r.productId, r.units]));

  let best: { c: RawCompetitor; row: ServiceRow; mine: Product; pct: number } | null = null;
  for (const c of competitors) {
    for (const row of serviceRowsFor(c.id, input.observations, input.now)) {
      if (row.amount == null || row.amount <= 0) continue;
      const mine = yourProductFor(row.label, products);
      if (!mine || mine.price <= row.amount) continue;
      const pct = ((mine.price - row.amount) / mine.price) * 100;
      if (!best || pct > best.pct) best = { c, row, mine, pct };
    }
  }
  if (best) {
    const { c, row, mine, pct } = best;
    const sold = units.get(mine.id) ?? 0;
    const m0 = marginPct(mine.price, mine.costPrice);
    const m1 = marginPct(row.amount!, mine.costPrice);
    const lost = sold > 0 ? (mine.price - row.amount!) * sold : null;
    return {
      kind: "price",
      title: `${c.name} is undercutting your ${mine.name} by about ${Math.round(pct)}%`,
      why: `They list it at ${money(row.amount!)} against your ${money(mine.price)}. ${
        m0 != null && m1 != null
          ? `Your cost on it is ${money(mine.costPrice)}${sold > 0 ? ` and it sold ${sold} time${sold === 1 ? "" : "s"} in the last 30 days` : ""}, so matching their price would cut your margin from ${Math.round(m0)}% to ${Math.round(m1)}%.`
          : ""
      }`,
      evidence: `Recorded ${relTime(row.seen, input.now)}${row.source ? ` · ${row.source}` : ""}`,
      rows: [
        { label: "Their listed price", value: money(row.amount!), provenance: "Observed" },
        { label: "Your price", value: money(mine.price), provenance: "Your records" },
        { label: "Your cost", value: money(mine.costPrice), provenance: "Your records" },
        ...(m0 != null ? [{ label: "Your margin today", value: `${m0.toFixed(1)}%`, provenance: "Your records" as const }] : []),
        ...(m1 != null ? [{ label: "Margin if you matched", value: `${m1.toFixed(1)}%`, provenance: "Calculated" as const }] : []),
        { label: "Sold in the last 30 days", value: String(sold), provenance: "Your records" },
        { label: "Their volume", value: "Not knowable", provenance: "Unavailable" },
      ],
      verdict:
        lost != null
          ? `Matching them would cost you about ${money(lost)} a month in margin on sales you are already making. That assumes the same volume — whether it would hold, or whether you are losing sales to them, cannot be seen from outside.`
          : "You have no sales of this item in the last 30 days, so there is no measured margin at stake yet.",
    };
  }

  const yourRating = input.yourRating;
  if (yourRating != null) {
    const ahead = stats
      .filter((s) => s.rating != null && s.rating > yourRating)
      .sort((a, b) => b.rating! - a.rating!)[0];
    if (ahead) {
      return {
        kind: "rating",
        title: `${ahead.competitor.name} is rated ${ahead.rating!.toFixed(1)} against your ${yourRating.toFixed(1)}`,
        why: `${ahead.reviews != null ? `${ahead.competitor.name} has ${ahead.reviews} public reviews to your ${input.yourReviewCount}. ` : ""}Anyone comparing listings sees the higher rating first.`,
        evidence: `Google listing · ${ahead.sparkline.length} snapshot${ahead.sparkline.length === 1 ? "" : "s"}`,
        rows: [
          { label: `${ahead.competitor.name} rating`, value: ahead.rating!.toFixed(1), provenance: "Observed" },
          { label: "Your rating", value: yourRating.toFixed(1), provenance: "Your records" },
          { label: `${ahead.competitor.name} reviews`, value: ahead.reviews != null ? String(ahead.reviews) : "—", provenance: "Observed" },
          { label: "Your reviews", value: String(input.yourReviewCount), provenance: "Your records" },
          { label: "Their customer count", value: "Not knowable", provenance: "Unavailable" },
        ],
        verdict: "A rating gap is visible to everyone, but it only tells you how reviewers feel — not how many customers they have or why they rate as they do.",
      };
    }
  }

  const opp = input.opportunities[0];
  if (opp) {
    return {
      kind: "opportunity",
      title: opp.evidence,
      why: opp.recommendation ?? "Open Trends & Opportunities to see the evidence behind this.",
      evidence: `${opportunityKindLabel(opp.kind)} · found ${relTime(new Date(opp.createdAt), input.now)}`,
      rows: [
        { label: "What was found", value: opp.evidence, provenance: "Calculated" },
        { label: "Area", value: opportunityKindLabel(opp.kind), provenance: "Your records" },
      ],
      verdict: "This is a gap in your own visibility that Noxtill found by comparing your records against the thresholds in Settings.",
    };
  }
  return null;
}

export function opportunityKindLabel(k: CompetitiveOpportunityKind): string {
  return { keyword: "Keyword rankings", review: "Reviews", listing: "Listings", social: "Social" }[k];
}

export function buildTopAhead(bench: BenchRow[], stats: CompetitorStats[], input: InsightsInput): { title: string; why: string; evidence: string } | null {
  const ratingRow = bench.find((b) => b.key === "rating" && b.pos === "Ahead");
  if (ratingRow && input.yourRating != null) {
    return {
      title: `Your public rating is above the competitor average`,
      why: `${ratingRow.note}. ${input.yourReplyRate != null ? `You also reply to ${Math.round(input.yourReplyRate)}% of your public reviews.` : ""}`.trim(),
      evidence: `Google · ${stats.filter((s) => s.rating != null).length} competitor${stats.length === 1 ? "" : "s"} rated`,
    };
  }
  const reviewsRow = bench.find((b) => b.key === "reviews" && b.pos === "Ahead");
  if (reviewsRow) return { title: "You have more public reviews than the competitor average", why: `${reviewsRow.note}.`, evidence: "Google" };
  if (input.yourReplyRate != null && input.yourReplyRate >= 50) {
    return {
      title: `You reply to ${Math.round(input.yourReplyRate)}% of your public reviews`,
      why: "Replies are visible to anyone reading your listing before they choose. Whether competitors reply cannot be seen from outside Noxtill's data, so this isn't a comparison.",
      evidence: "Your review records",
    };
  }
  return null;
}

/* ─────────────────────────────── KPI cards ─────────────────────────────── */

export interface Kpi {
  key: string;
  label: string;
  value: string;
  sub: string;
  color: string;
  border: string;
  /** Where the figure comes from — shown in the "Where this comes from" drawer. */
  source: string;
}

const BENCH_SHORT: Record<string, string> = {
  rating: "rating",
  reviews: "review count",
  replied: "reply rate",
  services: "range",
  posts: "posting",
  ads: "ads",
  completeness: "listing",
};

/** How many things currently deserve a decision: measurable price undercuts, rivals rated above you, and open gaps. */
export function countWorthWatching(input: InsightsInput, stats: CompetitorStats[]): number {
  let n = input.opportunities.length;
  for (const c of input.competitors) {
    for (const row of serviceRowsFor(c.id, input.observations, input.now)) {
      const mine = row.amount != null && row.amount > 0 ? yourProductFor(row.label, input.products) : undefined;
      if (mine && row.amount != null && mine.price > row.amount) n += 1;
    }
  }
  if (input.yourRating != null) n += stats.filter((s) => s.rating != null && s.rating > input.yourRating!).length;
  return n;
}

export function buildKpis(input: InsightsInput, events: ChangeEvent[], bench: BenchRow[], stats: CompetitorStats[], maxCompetitors: number): Kpi[] {
  const since = rangeSince(input.range, input.now);
  const inRange = events.filter((e) => e.at >= since);
  const price = inRange.filter((e) => e.price && e.price.dir !== "new");
  const priceUp = price.filter((e) => e.price!.dir === "up").length;
  const newSvc = inRange.filter((e) => e.category === "Service");
  const newSvcWho = [...new Set(newSvc.map((e) => e.competitorName))];
  const offers = inRange.filter((e) => e.category === "Offer");
  const running = offers.filter((e) => !e.offer?.endsAt || e.offer.endsAt.getTime() > input.now.getTime()).length;
  const adEntries = Object.entries(input.ads);
  const adsRunning = adEntries.reduce((s, [, l]) => s + l.filter((a) => !a.endedAt).length, 0);
  const lead = bench.filter((b) => b.pos === "Ahead");
  const worth = countWorthWatching(input, stats);
  const AMBER = "#B54708";
  const INK = "#0F172A";

  return [
    { key: "watched", label: "Competitors watched", value: String(input.competitors.length), sub: `of ${maxCompetitors} allowed`, color: INK, border: "#E6EAF0", source: "Competitors you have added to your watchlist" },
    { key: "changes", label: "Changes seen", value: String(inRange.length), sub: rangePhrase(input.range), color: INK, border: "#E6EAF0", source: "Week-to-week movement in public Google ratings and review counts, plus prices, services and offers you recorded" },
    {
      key: "price",
      label: "Price changes",
      value: String(price.length),
      sub: price.length ? `${price.length - priceUp} down, ${priceUp} up` : "none recorded",
      color: price.length ? AMBER : INK,
      border: "#E6EAF0",
      source: "Prices you recorded from competitors' public pages — a change is a new price for a line you already recorded",
    },
    {
      key: "services",
      label: "New services",
      value: String(newSvc.length),
      sub: newSvc.length ? (newSvcWho.length === 1 ? `all at ${newSvcWho[0]}` : `across ${newSvcWho.length} competitors`) : "none recorded",
      color: newSvc.length ? AMBER : INK,
      border: "#E6EAF0",
      source: "Lines you recorded that a competitor had not listed before your first recording day",
    },
    {
      key: "offers",
      label: "New public offers",
      value: String(offers.length),
      sub: offers.length ? `${running} still running` : "none recorded",
      color: INK,
      border: "#E6EAF0",
      source: "Public offers you recorded from competitors' own pages",
    },
    {
      key: "ads",
      label: "Ads seen",
      value: adEntries.length ? String(adsRunning) : "—",
      sub: adEntries.length ? "running in the Meta Ad Library" : "link a Meta page to a competitor",
      color: INK,
      border: "#E6EAF0",
      source: "Meta Ad Library, for competitors that have a Facebook Page ID linked",
    },
    { key: "worth", label: "Worth watching", value: String(worth), sub: worth ? "need a decision from you" : "nothing open", color: worth ? "#B42318" : INK, border: worth ? "#FDD9D6" : "#E6EAF0", source: "Recorded competitor prices below yours, competitors rated above you, and open gaps found by comparing your keyword, review, listing and social records against your alert thresholds" },
    {
      key: "lead",
      label: "Where you lead",
      value: String(lead.length),
      sub: lead.length ? lead.map((l) => BENCH_SHORT[l.key] ?? l.label.toLowerCase()).slice(0, 3).join(", ") : "no measured lead yet",
      color: lead.length ? "#12A150" : INK,
      border: lead.length ? "#BFE7CF" : "#E6EAF0",
      source: "Measures in the table below where your figure beats the competitor figure Noxtill can actually see",
    },
  ];
}

/* ─────────────────────────────── profile: reading the signals ─────────────────────────────── */

export interface Signals {
  strong: string;
  weak: string;
  watch: string;
  confidence: string;
}

/** Deterministic, rule-based reading of one competitor from real numbers — never a made-up narrative. */
export function readSignals(stat: CompetitorStats, input: InsightsInput, events: ChangeEvent[]): Signals {
  const { yourRating, yourReviewCount } = input;
  const strong: string[] = [];
  const weak: string[] = [];
  if (stat.rating != null && yourRating != null) {
    if (stat.rating > yourRating) strong.push(`Rated ${stat.rating.toFixed(1)} publicly, above your ${yourRating.toFixed(1)}.`);
    if (stat.rating < yourRating) weak.push(`Rated ${stat.rating.toFixed(1)} publicly, below your ${yourRating.toFixed(1)}.`);
  }
  if (stat.reviews != null) {
    if (stat.reviews > yourReviewCount) strong.push(`${stat.reviews} public reviews against your ${yourReviewCount}.`);
    if (stat.reviews < yourReviewCount) weak.push(`${stat.reviews} public reviews against your ${yourReviewCount}.`);
  }
  const movement = stat.sparkline.length >= 2 ? Math.round((stat.sparkline[stat.sparkline.length - 1] - stat.sparkline[0]) * 10) / 10 : 0;
  if (movement > 0) strong.push(`Their public rating has risen ${movement.toFixed(1)} over ${stat.sparkline.length} snapshots.`);
  if (movement < 0) weak.push(`Their public rating has fallen ${Math.abs(movement).toFixed(1)} over ${stat.sparkline.length} snapshots.`);

  const recent = events.find((e) => e.competitorId === stat.competitor.id);
  const points = stat.sparkline.length + stat.changesTotal;
  return {
    strong: strong.length ? strong.join(" ") : "Nothing measurable stands out in their favour from the public data Noxtill holds.",
    weak: weak.length ? weak.join(" ") : "Nothing measurable stands out against them from the public data Noxtill holds.",
    watch: recent ? `${recent.what} (${relTime(recent.at, input.now)}).` : "No change has been seen yet — check back after the next snapshot.",
    confidence: `${confidenceFor(points)} — based on ${stat.sparkline.length} Google snapshot${stat.sparkline.length === 1 ? "" : "s"} and ${stat.changesTotal} recorded change${stat.changesTotal === 1 ? "" : "s"}. Their costs, margins and customer numbers are not visible.`,
  };
}

/* ─────────────────────────────── your own posting ─────────────────────────────── */

/** When a published post actually went out: its latest platform publish time, else the row's last update. */
export function postPublishedAt(post: { updatedAt: string; targets: { publishedAt: string | null }[] }): Date {
  const times = post.targets.map((t) => t.publishedAt).filter((t): t is string => !!t).map((t) => new Date(t).getTime());
  return new Date(times.length ? Math.max(...times) : new Date(post.updatedAt).getTime());
}

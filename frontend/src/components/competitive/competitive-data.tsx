"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  fetchCompetitorAds,
  fetchCompetitorCategoryAverage,
  fetchCompetitorDetails,
  fetchCompetitorHistory,
  fetchCompetitorsRaw,
  type CompetitorAd,
  type CompetitorDetails,
  type CompetitorHistoryPoint,
  type RawCompetitor,
} from "@/lib/competitors-api";
import {
  fetchCompetitiveOpportunities,
  fetchCompetitiveRecommendations,
  fetchCompetitiveSettings,
  fetchCompetitorObservations,
  fetchCompetitorSocial,
  fetchOwnListingCompleteness,
  type CompetitiveOpportunity,
  type CompetitiveRecommendation,
  type CompetitiveSettings,
  type CompetitorObservation,
  type CompetitorSocial,
} from "@/lib/competitive-api";
import { fetchReviews, type LiveExternalReview, type LiveInboxEntry } from "@/lib/reviews-api";
import { fetchProducts } from "@/lib/products-api";
import { fetchProfitByProduct } from "@/lib/profit-api";
import { fetchSocialPosts, type SocialPost } from "@/lib/social-posts-api";
import { fetchCampaigns, type AdCampaign } from "@/lib/ads-api";
import { formatCurrency } from "@/lib/format";
import { useSession } from "@/lib/session";
import { MAX_COMPETITORS } from "@/lib/competitors";
import {
  buildBench,
  buildChangeEvents,
  buildCompetitorStats,
  buildKpis,
  buildTopAhead,
  buildTopThreat,
  postPublishedAt,
  type BenchRow,
  type ChangeEvent,
  type CompetitorStats,
  type HeadlineCard,
  type InsightsInput,
  type Kpi,
} from "@/lib/competitive-insights";
import { useCompetitiveUi } from "./competitive-store";

const STALE = 60_000;
const DAY = 86_400_000;

export interface CompetitiveData {
  /** True until the competitor list itself has loaded — every other source degrades independently. */
  loading: boolean;
  error: boolean;
  refetch: () => void;
  now: Date;
  money: (n: number) => string;
  competitors: RawCompetitor[];
  history: Record<string, CompetitorHistoryPoint[]>;
  observations: CompetitorObservation[];
  ads: Record<string, CompetitorAd[]>;
  adsLoading: boolean;
  /** Public Google listing details + completeness per competitor id (only those Google resolved). */
  details: Record<string, CompetitorDetails>;
  detailsLoading: boolean;
  /** Public Instagram posting per competitor id (only competitors with a handle set). */
  social: Record<string, CompetitorSocial>;
  socialLoading: boolean;
  /** Your own listing scored on the same seven public checks, or null with no Master Record yet. */
  ownCompleteness: { percent: number; checks: { key: string; label: string; present: boolean }[] } | null;
  reviews: LiveInboxEntry[];
  settings: CompetitiveSettings | undefined;
  opportunities: CompetitiveOpportunity[];
  recommendations: CompetitiveRecommendation[];
  input: InsightsInput;
  events: ChangeEvent[];
  stats: CompetitorStats[];
  bench: BenchRow[];
  kpis: Kpi[];
  topThreat: HeadlineCard | null;
  topAhead: { title: string; why: string; evidence: string } | null;
  /** Most recent Google snapshot across all competitors, or null when none has run yet. */
  lastChecked: Date | null;
  campaigns: AdCampaign[];
  posts: SocialPost[];
}

const Ctx = createContext<CompetitiveData | null>(null);

export function useCompetitiveData(): CompetitiveData {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCompetitiveData must be used inside CompetitiveDataProvider");
  return v;
}

export function CompetitiveDataProvider({ children }: { children: ReactNode }) {
  const { business } = useSession();
  const range = useCompetitiveUi((s) => s.range);

  const competitorsQ = useQuery({ queryKey: ["competitors"], queryFn: fetchCompetitorsRaw, staleTime: STALE });
  const competitors = useMemo(() => competitorsQ.data ?? [], [competitorsQ.data]);
  const linked = useMemo(() => competitors.filter((c) => !!c.metaPageId), [competitors]);

  const historyQs = useQueries({
    queries: competitors.map((c) => ({
      queryKey: ["competitor-history", c.id],
      queryFn: () => fetchCompetitorHistory(c.id),
      staleTime: STALE,
    })),
  });
  const adQs = useQueries({
    queries: linked.map((c) => ({
      queryKey: ["competitor-ads", c.id, c.metaPageId],
      queryFn: () => fetchCompetitorAds(c.id),
      staleTime: 5 * 60_000,
    })),
  });

  const detailQs = useQueries({
    queries: competitors.map((c) => ({
      queryKey: ["competitor-details", c.id],
      queryFn: () => fetchCompetitorDetails(c.id),
      staleTime: 5 * 60_000,
    })),
  });
  const withHandle = useMemo(() => competitors.filter((c) => !!c.instagramHandle), [competitors]);
  const socialQs = useQueries({
    queries: withHandle.map((c) => ({
      queryKey: ["competitor-social", c.id, c.instagramHandle],
      queryFn: () => fetchCompetitorSocial(c.id),
      staleTime: 5 * 60_000,
    })),
  });

  const observationsQ = useQuery({ queryKey: ["competitor-observations"], queryFn: () => fetchCompetitorObservations(), staleTime: STALE });
  const reviewsQ = useQuery({ queryKey: ["competitive-your-reviews"], queryFn: fetchReviews, staleTime: STALE });
  const categoryQ = useQuery({ queryKey: ["competitor-category-average"], queryFn: fetchCompetitorCategoryAverage, staleTime: STALE });
  const productsQ = useQuery({ queryKey: ["competitive-products"], queryFn: () => fetchProducts({ active: true }), staleTime: STALE });
  const profitQ = useQuery({ queryKey: ["competitive-profit-30"], queryFn: () => fetchProfitByProduct(30), staleTime: STALE });
  const postsQ = useQuery({ queryKey: ["competitive-social-published"], queryFn: () => fetchSocialPosts("published"), staleTime: STALE });
  const campaignsQ = useQuery({ queryKey: ["competitive-ad-campaigns"], queryFn: fetchCampaigns, staleTime: STALE });
  const completenessQ = useQuery({ queryKey: ["competitive-own-completeness"], queryFn: fetchOwnListingCompleteness, staleTime: STALE });
  const oppQ = useQuery({ queryKey: ["competitive-opportunities"], queryFn: fetchCompetitiveOpportunities, staleTime: STALE });
  const recQ = useQuery({ queryKey: ["competitive-recommendations"], queryFn: fetchCompetitiveRecommendations, staleTime: STALE });
  const settingsQ = useQuery({ queryKey: ["competitive-settings"], queryFn: fetchCompetitiveSettings, staleTime: STALE });

  // Each useQueries result is a new array every render; these keys change only when a query's data does.
  const historyKey = historyQs.map((q) => q.dataUpdatedAt).join(",");
  const adKey = adQs.map((q) => `${q.dataUpdatedAt}:${q.isPending ? 1 : 0}`).join(",");
  const detailKey = detailQs.map((q) => `${q.dataUpdatedAt}:${q.isPending ? 1 : 0}`).join(",");
  const socialKey = socialQs.map((q) => `${q.dataUpdatedAt}:${q.isPending ? 1 : 0}`).join(",");

  const value = useMemo<CompetitiveData>(() => {
    const now = new Date();
    const history: Record<string, CompetitorHistoryPoint[]> = {};
    competitors.forEach((c, i) => {
      history[c.id] = historyQs[i]?.data ?? [];
    });
    // Only competitors whose ad lookup actually resolved count as "having ad data".
    const ads: Record<string, CompetitorAd[]> = {};
    linked.forEach((c, i) => {
      const data = adQs[i]?.data;
      if (data) ads[c.id] = data;
    });

    // Only competitors whose lookup actually resolved appear here — a failed or pending one is absent, never a fake empty.
    const details: Record<string, CompetitorDetails> = {};
    competitors.forEach((c, i) => {
      const data = detailQs[i]?.data;
      if (data) details[c.id] = data;
    });
    const social: Record<string, CompetitorSocial> = {};
    withHandle.forEach((c, i) => {
      const data = socialQs[i]?.data;
      if (data) social[c.id] = data;
    });

    const reviews = reviewsQ.data ?? [];
    const external = reviews.filter((r): r is LiveExternalReview => r.source === "external");
    const rated = external.filter((r) => r.stars > 0);
    const yourRating = rated.length ? Math.round((rated.reduce((s, r) => s + r.stars, 0) / rated.length) * 10) / 10 : null;
    const yourReplyRate = external.length ? (external.filter((r) => !!r.replyText).length / external.length) * 100 : null;

    const posts = postsQ.data ?? [];
    const recentPosts = posts.filter((p) => now.getTime() - postPublishedAt(p).getTime() <= 28 * DAY);
    const campaigns = campaignsQ.data ?? [];

    const money = (n: number) => formatCurrency(n, business.currency, business.locale);
    const input: InsightsInput = {
      now,
      range,
      money,
      competitors,
      history,
      observations: observationsQ.data ?? [],
      ads,
      yourRating,
      yourReviewCount: external.length,
      yourReplyRate,
      categoryAverage: categoryQ.data ?? null,
      products: productsQ.data ?? [],
      profitRows: profitQ.data?.products ?? [],
      yourPostsPerWeek: postsQ.data ? recentPosts.length / 4 : null,
      yourActiveAds: campaignsQ.data ? campaigns.filter((c) => c.status === "active").length : null,
      yourListingCompleteness: completenessQ.data?.percent ?? null,
      details,
      social,
      opportunities: oppQ.data ?? [],
      recommendations: recQ.data ?? [],
    };

    const events = buildChangeEvents(input);
    const stats = buildCompetitorStats(input, events);
    const bench = buildBench(input);
    const kpis = buildKpis(input, events, bench, stats, MAX_COMPETITORS);
    const times = Object.values(history).flatMap((h) => h.map((p) => new Date(p.capturedAt).getTime()));

    return {
      loading: competitorsQ.isPending,
      error: competitorsQ.isError,
      refetch: () => void competitorsQ.refetch(),
      now,
      money,
      competitors,
      history,
      observations: input.observations,
      ads,
      adsLoading: adQs.some((q) => q.isPending),
      details,
      detailsLoading: detailQs.some((q) => q.isPending),
      social,
      socialLoading: socialQs.some((q) => q.isPending),
      ownCompleteness: completenessQ.data ?? null,
      reviews,
      settings: settingsQ.data,
      opportunities: input.opportunities,
      recommendations: input.recommendations,
      input,
      events,
      stats,
      bench,
      kpis,
      topThreat: buildTopThreat(input, stats),
      topAhead: buildTopAhead(bench, stats, input),
      lastChecked: times.length ? new Date(Math.max(...times)) : null,
      campaigns,
      posts,
    };
    // historyQs / adQs / detailQs / socialQs are read inside but are new arrays each render — their keys stand in for them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    competitors,
    linked,
    historyKey,
    adKey,
    detailKey,
    socialKey,
    withHandle,
    range,
    business.currency,
    business.locale,
    competitorsQ.isPending,
    competitorsQ.isError,
    observationsQ.data,
    reviewsQ.data,
    categoryQ.data,
    productsQ.data,
    profitQ.data,
    postsQ.data,
    campaignsQ.data,
    completenessQ.data,
    oppQ.data,
    recQ.data,
    settingsQ.data,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

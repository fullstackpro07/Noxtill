"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, Eye, Heart, BarChart3, Clock } from "lucide-react";
import { Select } from "@/components/ui/select";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { EmptyState } from "@/components/shared/empty-state";
import { fetchSocialAnalyticsSummary, fetchSocialAnalyticsForPlatform } from "@/lib/social-analytics-api";
import { fetchSocialPosts, fetchSocialPostAnalytics } from "@/lib/social-posts-api";
import { SOCIAL_PLATFORMS, SOCIAL_PLATFORM_LABELS, type SocialPlatform } from "@/lib/social-accounts-api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function AnalyticsView() {
  const [platform, setPlatform] = useState<SocialPlatform>("facebook");
  const { data: summary, isPending, isError, refetch } = useQuery({
    queryKey: ["social-analytics-summary"],
    queryFn: fetchSocialAnalyticsSummary,
  });

  const platformsWithData = Object.keys(summary?.byPlatform ?? {}) as SocialPlatform[];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-fg">Social Analytics</h1>
        <p className="mt-0.5 text-sm text-fg-muted">Follower growth, reach, and engagement across every connected account.</p>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load analytics" onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : !summary || platformsWithData.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No analytics yet"
          description="Snapshots build up once your connected accounts have been polled at least once."
        />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard icon={Users} label="Total followers" value={summary.totalFollowers.toLocaleString()} />
            <StatCard icon={Eye} label="Total reach" value={summary.totalReach.toLocaleString()} />
            <StatCard icon={Heart} label="Total engagement" value={summary.totalEngagement.toLocaleString()} />
          </div>

          <p className="mb-2 text-sm font-medium text-fg">By platform</p>
          <div className="mb-6 overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-fg-faint">
                  <th className="px-4 py-2 font-medium">Platform</th>
                  <th className="px-4 py-2 font-medium">Followers</th>
                  <th className="px-4 py-2 font-medium">Reach</th>
                  <th className="px-4 py-2 font-medium">Engagement</th>
                  <th className="px-4 py-2 font-medium">Impressions</th>
                </tr>
              </thead>
              <tbody>
                {platformsWithData.map((p) => {
                  const row = summary.byPlatform[p];
                  return (
                    <tr key={p} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 font-medium text-fg">{SOCIAL_PLATFORM_LABELS[p] ?? p}</td>
                      <td className="px-4 py-2 tabular-nums text-fg">{row.followers.toLocaleString()}</td>
                      <td className="px-4 py-2 tabular-nums text-fg">{row.reach.toLocaleString()}</td>
                      <td className="px-4 py-2 tabular-nums text-fg">{row.engagement.toLocaleString()}</td>
                      <td className="px-4 py-2 tabular-nums text-fg">{row.impressions.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-fg">90-day trend</p>
              <Select value={platform} onChange={(e) => setPlatform(e.target.value as SocialPlatform)} className="w-40">
                {SOCIAL_PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {SOCIAL_PLATFORM_LABELS[p]}
                  </option>
                ))}
              </Select>
            </div>
            <PlatformTrend platform={platform} />
          </div>

          <div className="mt-6 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
            <div className="mb-1 flex items-center gap-2 text-sm font-medium text-fg">
              <Clock className="h-4 w-4 text-fg-faint" aria-hidden />
              Best posting times
            </div>
            <BestPostingTimesHeatmap />
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <div className="flex items-center gap-2 text-xs text-fg-faint">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </div>
      <p className="mt-1 font-display text-xl font-bold text-fg">{value}</p>
    </div>
  );
}

function PlatformTrend({ platform }: { platform: SocialPlatform }) {
  const { data, isPending } = useQuery({
    queryKey: ["social-analytics-platform", platform],
    queryFn: () => fetchSocialAnalyticsForPlatform(platform),
  });

  if (isPending) return <SkeletonRow />;
  if (!data || data.length < 2) {
    return <p className="py-6 text-center text-sm text-fg-faint">Not enough history yet for {SOCIAL_PLATFORM_LABELS[platform]}.</p>;
  }

  const sorted = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const width = 640;
  const height = 140;
  const values = sorted.map((s) => s.followers);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = max - min || 1;
  const points = sorted.map((s, i) => ({
    x: (i / (sorted.length - 1)) * width,
    y: height - ((s.followers - min) / span) * height,
  }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  const last = points[points.length - 1];

  return (
    <div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Follower trend">
        <path d={areaPath} fill="var(--chart-1)" opacity={0.08} />
        <path d={linePath} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={last.x} cy={last.y} r={4} fill="var(--chart-1)" />
      </svg>
      <div className="mt-1 flex justify-between text-xs text-fg-faint">
        <span>{formatDate(sorted[0].date)}</span>
        <span>
          {formatDate(sorted[sorted.length - 1].date)} · {sorted[sorted.length - 1].followers.toLocaleString()} followers
        </span>
      </div>
    </div>
  );
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Built from real data only: every published `SocialPostTarget.publishedAt`, weighted by that
 * target's stored `reach` when analytics have already been pulled for it (never triggers a new
 * pull itself — this reads whatever `GET /social/posts/:id/analytics` already has). Falls back to
 * plain posting frequency where no reach is stored, and says so rather than implying every cell is
 * reach-weighted.
 */
function BestPostingTimesHeatmap() {
  const postsQuery = useQuery({ queryKey: ["social-posts"], queryFn: () => fetchSocialPosts() });
  const publishedPosts = (postsQuery.data ?? []).filter((p) => p.status === "published" || p.status === "partially_failed");

  const analyticsQuery = useQuery({
    queryKey: ["social-posts-analytics-bulk", publishedPosts.map((p) => p.id)],
    queryFn: () => Promise.all(publishedPosts.map((p) => fetchSocialPostAnalytics(p.id))),
    enabled: publishedPosts.length > 0,
  });

  if (postsQuery.isPending || (publishedPosts.length > 0 && analyticsQuery.isPending)) {
    return <SkeletonRow />;
  }

  const reachByTarget = new Map<string, number>();
  for (const rows of analyticsQuery.data ?? []) {
    for (const row of rows) reachByTarget.set(row.socialPostTargetId, row.reach);
  }

  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  let anyReachData = false;
  let total = 0;
  for (const post of publishedPosts) {
    for (const target of post.targets) {
      if (target.status !== "published" || !target.publishedAt) continue;
      const when = new Date(target.publishedAt);
      const reach = reachByTarget.get(target.id);
      const weight = reach && reach > 0 ? reach : 1;
      if (reach && reach > 0) anyReachData = true;
      grid[when.getDay()][when.getHours()] += weight;
      total += 1;
    }
  }

  if (total === 0) {
    return <p className="py-6 text-center text-sm text-fg-faint">No published posts yet to learn a pattern from.</p>;
  }

  const max = Math.max(...grid.flat(), 1);

  return (
    <div>
      <p className="mb-3 text-xs text-fg-muted">
        {anyReachData
          ? "Weighted by reach where it's been pulled (Published Posts), posting frequency elsewhere."
          : "Based on posting frequency only — pull per-post insights from Published Posts to weight this by reach."}
      </p>
      <div className="overflow-x-auto">
        <div className="grid min-w-[640px] grid-cols-[2.5rem_repeat(24,1fr)] gap-0.5">
          <div />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="text-center text-[9px] text-fg-faint">
              {h % 6 === 0 ? h : ""}
            </div>
          ))}
          {DAY_LABELS.map((label, day) => (
            <div key={label} className="contents">
              <div className="flex items-center text-[10px] text-fg-faint">{label}</div>
              {grid[day].map((value, hour) => (
                <div
                  key={hour}
                  title={`${label} ${hour}:00 — ${value.toFixed(0)}`}
                  className={cn("aspect-square rounded-[2px]", value === 0 && "bg-surface-2")}
                  style={value > 0 ? { backgroundColor: "var(--chart-1)", opacity: 0.15 + 0.75 * (value / max) } : undefined}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

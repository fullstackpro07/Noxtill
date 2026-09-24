"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ErrorBanner } from "@/components/shared/error-states";
import { postPublishedAt } from "@/lib/competitive-insights";
import type { CompetitorSocial } from "@/lib/competitive-api";
import { useCompetitiveData } from "../competitive-data";
import { useCompetitiveUi } from "../competitive-store";
import { Card, CardHead, EmptyCard, InfoBanner, SkeletonBlock, TableCard, Th } from "../competitive-ui";

const DAY = 86_400_000;

function trendOf(now: number, prev: number, capped = false): { t: string; c: string } {
  const p = capped ? `${prev}+` : String(prev);
  if (now > prev) return { t: `▲ up from ${p}`, c: "#0E8442" };
  if (now < prev) return { t: `▼ down from ${p}`, c: "#B42318" };
  return { t: "— steady", c: "#475467" };
}

function formatsOf(r: Extract<CompetitorSocial, { status: "ok" }>): string {
  const parts = [
    r.formats.video ? `${r.formats.video} video` : null,
    r.formats.image ? `${r.formats.image} image` : null,
    r.formats.carousel ? `${r.formats.carousel} carousel` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "—";
}

export function SocialScreen() {
  const router = useRouter();
  const data = useCompetitiveData();
  const openModal = useCompetitiveUi((s) => s.openModal);
  const setActive = useCompetitiveUi((s) => s.setActiveCompetitor);
  const setProfileTab = useCompetitiveUi((s) => s.setProfileTab);

  const you = useMemo(() => {
    const now = data.now.getTime();
    const times = data.posts.map((p) => ({ at: postPublishedAt(p).getTime(), media: p.mediaKeys.length > 0 }));
    const last = times.filter((t) => now - t.at <= 30 * DAY);
    const prev = times.filter((t) => now - t.at > 30 * DAY && now - t.at <= 60 * DAY);
    return { last: last.length, prev: prev.length, media: last.filter((t) => t.media).length };
  }, [data.posts, data.now]);

  if (data.error) return <ErrorBanner title="Couldn't load competitors" onRetry={data.refetch} />;
  if (data.loading) return <SkeletonBlock h={280} />;

  const yourTrend = trendOf(you.last, you.prev);
  const readable = data.competitors.filter((c) => data.social[c.id]?.status === "ok").length;

  const goProfile = (id: string) => {
    setActive(id);
    setProfileTab("Overview");
    router.push("/competitive/profile");
  };

  return (
    <div className="flex flex-col gap-[15px]">
      <InfoBanner>
        Competitor posting is read from Instagram only, through Instagram Business Discovery, using your own connected Instagram account. It works for public business or
        creator accounts that have a username saved on their profile here. Facebook and TikTok don&apos;t share another business&apos;s posts, so those aren&apos;t shown.
      </InfoBanner>

      <Card overflow>
        <CardHead title="Posting over the last 30 days" sub={data.competitors.length ? `${readable} of ${data.competitors.length} competitors readable` : undefined} />
        <TableCard
          minWidth={760}
          head={
            <>
              <Th edge>Business</Th>
              <Th align="right">Public posts</Th>
              <Th>Format</Th>
              <Th>Talking about</Th>
              <Th align="right" edge>
                Trend
              </Th>
            </>
          }
        >
          {data.competitors.map((c) => {
            const r = data.social[c.id];
            if (r?.status === "ok") {
              const trend = trendOf(r.postsLast30, r.postsPrev30, r.capped);
              return (
                <tr key={c.id} className="border-t border-[#F2F4F7]">
                  <td className="px-[17px] py-3">
                    <span className="block text-[12.5px] font-bold text-[#101828]">{c.name}</span>
                    <span className="block text-[10.5px] text-[#98A2B3]">
                      @{r.handle}
                      {r.followers != null ? ` · ${r.followers.toLocaleString("en-US")} followers` : ""}
                    </span>
                  </td>
                  <td className="p-3 text-right text-[12.5px] font-extrabold text-[#101828]">
                    {r.capped ? "≥ " : ""}
                    {r.postsLast30}
                  </td>
                  <td className="p-3 text-[12px] text-[#475467]">{formatsOf(r)}</td>
                  <td className="p-3 text-[12px] text-[#667085]">{r.topics.length ? r.topics.join(" ") : "No hashtags"}</td>
                  <td className="px-[17px] py-3 text-right text-[12px] font-extrabold" style={{ color: trend.c }}>
                    {trend.t}
                  </td>
                </tr>
              );
            }
            let note: ReactNode;
            if (!c.instagramHandle) {
              note = (
                <button type="button" onClick={() => goProfile(c.id)} className="cursor-pointer border-0 bg-transparent p-0 text-[12px] font-bold text-[#0E8442] hover:underline">
                  Add their Instagram username
                </button>
              );
            } else if (!r) {
              note = <span className="italic text-[#98A2B3]">Reading @{c.instagramHandle}…</span>;
            } else if (r.status === "not_connected") {
              note = (
                <span className="text-[#98A2B3]">
                  <Link href="/social" className="font-bold">
                    Connect Instagram in Social
                  </Link>{" "}
                  to read @{c.instagramHandle}
                </span>
              );
            } else {
              note = <span className="italic text-[#98A2B3]">{r.message}</span>;
            }
            return (
              <tr key={c.id} className="border-t border-[#F2F4F7]">
                <td className="px-[17px] py-3 text-[12.5px] font-bold text-[#101828]">{c.name}</td>
                <td className="p-3 text-right text-[12.5px] text-[#98A2B3]">—</td>
                <td colSpan={3} className="px-3 py-3 text-[12px]">
                  {note}
                </td>
              </tr>
            );
          })}
          <tr className="border-t border-[#F2F4F7] bg-[#F7FCF9]">
            <td className="px-[17px] py-3">
              <span className="flex items-center gap-2">
                <span className="text-[12.5px] font-bold text-[#101828]">Your business</span>
                <span className="rounded-[5px] bg-[#E8F7EE] px-[7px] py-0.5 text-[9.5px] font-extrabold text-[#0E8442]">You</span>
              </span>
            </td>
            <td className="p-3 text-right text-[12.5px] font-extrabold text-[#101828]">{you.last}</td>
            <td className="p-3 text-[12px] text-[#475467]">{you.last === 0 ? "—" : `${you.media} with media, ${you.last - you.media} text only`}</td>
            <td className="p-3 text-[12px] italic text-[#98A2B3]">Not analysed</td>
            <td className="px-[17px] py-3 text-right text-[12px] font-extrabold" style={{ color: yourTrend.c }}>
              {yourTrend.t}
            </td>
          </tr>
        </TableCard>
      </Card>

      {data.competitors.length === 0 ? (
        <EmptyCard
          title="Add competitors to line them up here"
          body="Competitor rows will appear above once you add them and save their Instagram usernames."
          action={{ label: "Add competitor", onClick: () => openModal({ type: "add" }) }}
        />
      ) : null}

      <Card border="#BFE7CF" thick pad>
        <div className="text-[14px] font-extrabold text-[#101828]">
          {you.last === 0 ? "You have not published in the last 30 days" : `You published ${you.last} post${you.last === 1 ? "" : "s"} in the last 30 days`}
        </div>
        <div className="mt-2 text-[12.5px] leading-[1.65] text-[#344054]">
          {you.prev > 0 || you.last > 0
            ? `That compares with ${you.prev} in the 30 days before. ${you.last > 0 ? `${you.media} of the recent ones carried media.` : ""}`
            : "Publishing from Social will show up here."}
        </div>
        <div className="mt-3 rounded-[11px] border border-[#FDE3B3] bg-[#FFFBF2] p-3 text-[11.5px] leading-[1.6] text-[#93370D]">
          Your count is posts Noxtill itself published, across all connected platforms. Competitor counts are Instagram only, from up to their 50 most recent posts — so the two are
          not like-for-like, and a count marked ≥ was cut off by that sample.
        </div>
      </Card>
    </div>
  );
}

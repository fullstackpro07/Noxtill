"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ErrorBanner } from "@/components/shared/error-states";
import { shortDate } from "@/lib/competitive-insights";
import { useCompetitiveData } from "../competitive-data";
import { useCompetitiveUi } from "../competitive-store";
import { Card, CardHead, EmptyCard, InfoBanner, SkeletonBlock, TableCard, Th } from "../competitive-ui";

const DAY = 86_400_000;

export function AdsScreen() {
  const data = useCompetitiveData();
  const openModal = useCompetitiveUi((s) => s.openModal);

  const rows = useMemo(
    () =>
      data.competitors.map((c) => {
        const ads = data.ads[c.id];
        const running = ads ? ads.filter((a) => !a.endedAt) : [];
        const started = (ads ?? []).map((a) => (a.startedAt ? new Date(a.startedAt).getTime() : 0)).filter(Boolean);
        const newest = running.slice().sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""))[0];
        const recentNew = (ads ?? []).filter((a) => a.startedAt && data.now.getTime() - new Date(a.startedAt).getTime() <= 7 * DAY).length;
        const recentStopped = (ads ?? []).filter((a) => a.endedAt && data.now.getTime() - new Date(a.endedAt).getTime() <= 7 * DAY).length;
        return { c, linked: !!c.metaPageId, loaded: !!ads, running: running.length, newest, recentNew, recentStopped, since: started.length ? new Date(Math.min(...started)) : null };
      }),
    [data.competitors, data.ads, data.now],
  );

  const yourSpend = data.campaigns.reduce((s, c) => s + (c.stats.spend ?? 0), 0);
  const yourResults = data.campaigns.reduce((s, c) => s + (c.stats.results ?? 0), 0);
  const themTotal = rows.reduce((s, r) => s + r.running, 0);
  const linkedCount = rows.filter((r) => r.loaded).length;

  if (data.error) return <ErrorBanner title="Couldn't load competitors" onRetry={data.refetch} />;
  if (data.loading) return <SkeletonBlock h={280} />;

  const vs: { l: string; you: string; them: string; note: string }[] = [
    {
      l: "Ads visible now",
      you: data.input.yourActiveAds != null ? String(data.input.yourActiveAds) : "—",
      them: linkedCount ? `${themTotal} across ${linkedCount} competitor${linkedCount === 1 ? "" : "s"}` : "Not tracked",
      note: "Theirs observed in the public Meta Ad Library · yours are your active campaigns",
    },
    {
      l: "Your cost per result",
      you: yourResults > 0 ? data.money(yourSpend / yourResults) : "Not tracked",
      them: "Not knowable",
      note: "Yours from your ad accounts",
    },
    { l: "Their spend and return", you: "—", them: "Not knowable", note: "Nobody outside a business can see what an ad cost or earned" },
  ];

  return (
    <div className="flex flex-col gap-[15px]">
      <InfoBanner>
        Platforms publish the ads themselves, so those are visible. Nobody outside a business can see what an ad cost or what it earned — those figures stay empty
        rather than being filled with a guess.
      </InfoBanner>

      {data.competitors.length === 0 ? (
        <EmptyCard
          title="Add competitors to see their public ads"
          action={{ label: "Add competitor", onClick: () => openModal({ type: "add" }) }}
        />
      ) : (
        <Card overflow>
          <CardHead title="Ads running publicly" />
          <TableCard
            minWidth={860}
            head={
              <>
                <Th edge>Business</Th>
                <Th align="right">Ads</Th>
                <Th>Newest started</Th>
                <Th>Message</Th>
                <Th>Preview</Th>
                <Th align="right" edge>
                  Change
                </Th>
              </>
            }
          >
            {rows.map((r) => {
              const change = !r.loaded
                ? { t: r.linked ? (data.adsLoading ? "Reading…" : "Couldn’t read") : "No page linked", c: "#98A2B3" }
                : r.recentNew > 0
                  ? { t: `▲ ${r.recentNew} new`, c: "#0E8442" }
                  : r.recentStopped > 0
                    ? { t: `▼ ${r.recentStopped} stopped`, c: "#B42318" }
                    : r.running === 0
                      ? { t: "None visible", c: "#98A2B3" }
                      : { t: "— steady", c: "#475467" };
              return (
                <tr key={r.c.id} className="border-t border-[#F2F4F7]">
                  <td className="px-[17px] py-3 text-[12.5px] font-bold text-[#101828]">{r.c.name}</td>
                  <td className="p-3 text-right text-[12.5px] font-extrabold text-[#101828]">{r.loaded ? r.running : "—"}</td>
                  <td className="p-3 text-[12px] text-[#475467]">{r.newest?.startedAt ? shortDate(new Date(r.newest.startedAt)) : "—"}</td>
                  <td className="max-w-[280px] p-3 text-[12px] text-[#667085]">
                    <span className="line-clamp-2">{r.newest?.body ?? "—"}</span>
                  </td>
                  <td className="p-3 text-[12px]">
                    {r.newest?.snapshotUrl ? (
                      <a href={r.newest.snapshotUrl} target="_blank" rel="noreferrer" className="font-bold">
                        View ad
                      </a>
                    ) : (
                      <span className="text-[#98A2B3]">—</span>
                    )}
                  </td>
                  <td className="px-[17px] py-3 text-right text-[12px] font-extrabold" style={{ color: change.c }}>
                    {change.t}
                  </td>
                </tr>
              );
            })}
          </TableCard>
          {linkedCount < rows.length ? (
            <div className="border-t border-[#F0F2F5] px-[17px] py-[11px] text-[11.5px] text-[#98A2B3]">
              Ads are read per competitor from a linked Facebook Page. Link one from{" "}
              <Link href="/competitive/profile" className="font-bold">
                a competitor&apos;s profile
              </Link>
              . If ads still don&apos;t load, Meta Ad Library access may not be configured on this server.
            </div>
          ) : null}
        </Card>
      )}

      <Card overflow>
        <CardHead title="You against them" />
        <div>
          {vs.map((v) => (
            <div key={v.l} className="flex flex-wrap items-center gap-3 border-t border-[#F2F4F7] px-[17px] py-3">
              <span className="min-w-[150px] flex-1 text-[12.5px] text-[#667085]">{v.l}</span>
              <span className="min-w-[90px] text-right text-[12.5px] font-extrabold text-[#101828]">{v.you}</span>
              <span className="min-w-[150px] text-right text-[12.5px] text-[#475467]">{v.them}</span>
              <span className="w-full text-[10.5px] text-[#98A2B3]">{v.note}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

"use client";

import { RANGE_OPTIONS, chip, relTime, type RangeKey, rangeSince } from "@/lib/competitive-insights";
import { useCompetitiveData } from "../competitive-data";
import { useCompetitiveUi } from "../competitive-store";
import { Card, CardHead, Chip, EmptyCard, GhostButton, InfoBanner, SkeletonBlock, TableCard, Th, selectClass } from "../competitive-ui";
import { ErrorBanner } from "@/components/shared/error-states";

export function OverviewScreen() {
  const data = useCompetitiveData();
  const range = useCompetitiveUi((s) => s.range);
  const setRange = useCompetitiveUi((s) => s.setRange);
  const openDrawer = useCompetitiveUi((s) => s.openDrawer);
  const openModal = useCompetitiveUi((s) => s.openModal);

  if (data.error) return <ErrorBanner title="Couldn't load competitors" onRetry={data.refetch} />;
  if (data.loading) {
    return (
      <>
        <SkeletonBlock h={60} />
        <SkeletonBlock h={110} />
        <SkeletonBlock h={320} />
      </>
    );
  }

  const since = rangeSince(range, data.now);
  const feed = data.events.filter((e) => e.at >= since).slice(0, 8);

  return (
    <div className="flex flex-col gap-[15px]">
      <div className="flex flex-wrap items-center gap-[9px]">
        <select aria-label="Date range" value={range} onChange={(e) => setRange(e.target.value as RangeKey)} className={selectClass}>
          {RANGE_OPTIONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => openDrawer({ type: "brief" })}
          className="ml-auto flex min-h-[44px] cursor-pointer items-center gap-[7px] rounded-[11px] border border-[#E6EAF0] bg-white px-[15px] py-[11px] text-[12.5px] font-bold text-[#0E8442] hover:border-[#12A150] hover:bg-[#F7FCF9]"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="m11 3 1.7 5L17.7 9.7 12.7 11.4 11 16.4 9.3 11.4 4.3 9.7 9.3 8Z" />
          </svg>
          This week&apos;s brief
        </button>
      </div>

      <InfoBanner>
        Everything here comes from pages anyone can visit — public Google listings, the public Meta Ad Library, public Instagram business profiles — plus prices and offers you recorded yourself. Their
        revenue, spend, customers and margins are private, and Noxtill will not guess at them.
      </InfoBanner>

      <div className="grid gap-3.5 max-[620px]:grid-cols-2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }}>
        {data.kpis.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => openDrawer({ type: "kpi", key: k.key })}
            className="min-h-[44px] cursor-pointer rounded-[14px] bg-white p-[15px] text-left transition-all hover:border-[#BFE7CF]! hover:shadow-[0_6px_18px_rgba(16,24,40,.07)]"
            style={{ border: `1px solid ${k.border}` }}
          >
            <span className="block text-[12px] font-semibold text-[#475467]">{k.label}</span>
            <span className="mt-1.5 block text-[21px] font-extrabold tracking-[-.5px]" style={{ color: k.color }}>
              {k.value}
            </span>
            <span className="mt-[5px] block text-[10.5px] text-[#98A2B3]">{k.sub}</span>
          </button>
        ))}
      </div>

      {data.competitors.length === 0 ? (
        <EmptyCard
          title="Add competitors to start tracking market changes"
          body="Once you add a competitor, Noxtill reads their public Google rating and review count on the schedule you set, and shows what moved."
          action={{ label: "Add competitor", onClick: () => openModal({ type: "add" }) }}
        />
      ) : (
        <>
          <div className="grid items-start gap-[15px] min-[1100px]:grid-cols-[minmax(0,1fr)_360px]">
            <Card overflow>
              <CardHead title="What changed" sub="Publicly visible changes, newest first" />
              <div>
                {feed.length === 0 ? (
                  <div className="border-t border-[#F2F4F7] px-[17px] py-8 text-center text-[12.5px] text-[#98A2B3]">
                    No changes seen for this period. Ratings are snapshotted on the schedule in Settings; prices, services and offers appear here once you record them.
                  </div>
                ) : (
                  feed.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => openDrawer({ type: "change", id: f.id })}
                      className="block w-full cursor-pointer border-0 border-t border-[#F2F4F7] bg-white px-[17px] py-[13px] text-left hover:bg-[#F7FCF9]"
                    >
                      <span className="flex flex-wrap items-center gap-[9px]">
                        <Chip tone={f.category} radius={5} className="px-[7px] py-0.5 text-[9.5px] uppercase tracking-[.4px]">
                          {f.category}
                        </Chip>
                        <span className="text-[12.5px] font-extrabold text-[#101828]">{f.competitorName}</span>
                        <span className="ml-auto text-[10.5px] text-[#98A2B3]">{relTime(f.at, data.now)}</span>
                      </span>
                      <span className="mt-1.5 block text-[12.5px] leading-[1.55] text-[#344054]">{f.what}</span>
                      <span className="mt-1 block text-[11px] text-[#98A2B3]">
                        Seen on {f.source} · {f.provenance}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </Card>

            <div className="flex flex-col gap-3.5">
              <Card border="#FDD9D6" thick pad={16}>
                <div className="mb-[9px] text-[10.5px] font-extrabold uppercase tracking-[.4px] text-[#912018]">Worth watching</div>
                {data.topThreat ? (
                  <>
                    <div className="text-[13px] font-extrabold leading-[1.5] text-[#101828]">{data.topThreat.title}</div>
                    <div className="mt-[7px] text-[12px] leading-[1.6] text-[#475467]">{data.topThreat.why}</div>
                    <div className="mt-[7px] text-[11px] text-[#98A2B3]">{data.topThreat.evidence}</div>
                    <GhostButton className="mt-[11px]" onClick={() => openDrawer({ type: "threat" })}>
                      See the full picture
                    </GhostButton>
                  </>
                ) : (
                  <div className="text-[12.5px] leading-[1.6] text-[#475467]">
                    Nothing needs a decision right now. This card fills when a competitor undercuts a price you have recorded, out-rates you, or Noxtill finds an open gap.
                  </div>
                )}
              </Card>
              <Card border="#BFE7CF" thick pad={16}>
                <div className="mb-[9px] text-[10.5px] font-extrabold uppercase tracking-[.4px] text-[#0E8442]">Where you are ahead</div>
                {data.topAhead ? (
                  <>
                    <div className="text-[13px] font-extrabold leading-[1.5] text-[#101828]">{data.topAhead.title}</div>
                    <div className="mt-[7px] text-[12px] leading-[1.6] text-[#475467]">{data.topAhead.why}</div>
                    <div className="mt-[7px] text-[11px] text-[#98A2B3]">{data.topAhead.evidence}</div>
                  </>
                ) : (
                  <div className="text-[12.5px] leading-[1.6] text-[#475467]">
                    No measured lead yet. This fills once your rating or review count beats the competitors Noxtill can see.
                  </div>
                )}
              </Card>
            </div>
          </div>

          <Card pad>
            <h3 className="m-0 mb-1 text-[14.5px] font-extrabold text-[#101828]">You against the market</h3>
            <p className="m-0 mb-3.5 text-[11.5px] text-[#98A2B3]">Only things that can be counted from the outside. Anything private is marked as such.</p>
            <TableCard
              minWidth={640}
              head={
                <>
                  <th className="px-3.5 py-2.5 text-left text-[11px] font-bold text-[#98A2B3]">Measure</th>
                  <Th align="right">You</Th>
                  <Th align="right">Market average</Th>
                  <th className="px-3.5 py-2.5 text-left text-[11px] font-bold text-[#98A2B3]">Where that puts you</th>
                </>
              }
            >
              {data.bench.map((b) => {
                const c = chip(b.pos);
                return (
                  <tr key={b.key} className="border-t border-[#F2F4F7]">
                    <td className="px-3.5 py-[11px] text-[12.5px] font-semibold text-[#344054]">{b.label}</td>
                    <td className="p-[11px] text-right text-[12.5px] font-extrabold text-[#101828]">{b.you}</td>
                    <td
                      className="p-[11px] text-right text-[12.5px] text-[#475467]"
                      style={b.them.startsWith("Not ") ? { color: "#98A2B3", fontStyle: "italic" } : undefined}
                    >
                      {b.them}
                    </td>
                    <td className="px-3.5 py-[11px]">
                      <span className="rounded-[20px] px-[9px] py-[3px] text-[11px] font-extrabold" style={{ background: c.bg, color: c.fg }}>
                        {b.pos}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </TableCard>
          </Card>
        </>
      )}
    </div>
  );
}

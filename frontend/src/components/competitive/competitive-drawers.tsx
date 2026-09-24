"use client";

import { useEffect, type ReactNode } from "react";
import { chip, longDate, rangePhrase, rangeSince, relTime, shortDate } from "@/lib/competitive-insights";
import { useCompetitiveData } from "./competitive-data";
import { useCompetitiveUi } from "./competitive-store";

export function CompetitiveDrawers() {
  const drawer = useCompetitiveUi((s) => s.drawer);
  const closeAll = useCompetitiveUi((s) => s.closeAll);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAll();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer, closeAll]);

  if (!drawer) return null;
  const title = { brief: "This week in your market", kpi: "Where this comes from", change: "What changed", threat: "Worth watching" }[drawer.type];

  return (
    <>
      <style>{`@keyframes nxslide{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}`}</style>
      <div onClick={closeAll} className="fixed inset-0 z-[80]" style={{ background: "rgba(10,27,42,.36)" }} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed bottom-0 right-0 top-0 z-[85] flex w-[520px] max-w-full flex-col bg-white max-[900px]:top-auto max-[900px]:h-[88%] max-[900px]:w-full max-[900px]:rounded-t-[18px]"
        style={{ boxShadow: "-18px 0 46px rgba(10,27,42,.18)", animation: "nxslide .22s ease" }}
      >
        <div className="flex items-center gap-3 border-b border-[#F0F2F5] p-[17px]">
          <h3 className="m-0 flex-1 text-[16px] font-extrabold text-[#0F172A]">{title}</h3>
          <button
            type="button"
            onClick={closeAll}
            aria-label="Close"
            className="flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-[9px] border border-[#E6EAF0] bg-white text-[#475467] hover:bg-[#F9FAFB]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-[17px]">
          {drawer.type === "brief" && <Brief />}
          {drawer.type === "kpi" && <KpiSource kpiKey={drawer.key} />}
          {drawer.type === "change" && <ChangeDetail id={drawer.id} />}
          {drawer.type === "threat" && <ThreatDetail />}
        </div>
      </aside>
    </>
  );
}

function CloseButton() {
  const closeAll = useCompetitiveUi((s) => s.closeAll);
  return (
    <button
      type="button"
      onClick={closeAll}
      className="min-h-[46px] cursor-pointer rounded-[11px] border border-[#E6EAF0] bg-white p-3 text-[12.5px] font-bold text-[#344054]"
    >
      Close
    </button>
  );
}

const Stack = ({ children }: { children: ReactNode }) => <div className="flex flex-col gap-3.5">{children}</div>;

function Label({ children, color = "#98A2B3" }: { children: ReactNode; color?: string }) {
  return (
    <div className="text-[10.5px] font-extrabold uppercase tracking-[.4px]" style={{ color }}>
      {children}
    </div>
  );
}

function Brief() {
  const { events, topThreat, topAhead, recommendations, now, competitors } = useCompetitiveData();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const week = events.filter((e) => e.at >= weekAgo);
  const byWho = new Map<string, number>();
  for (const e of week) byWho.set(e.competitorName, (byWho.get(e.competitorName) ?? 0) + 1);
  const mover = [...byWho.entries()].sort((a, b) => b[1] - a[1])[0];

  if (competitors.length === 0) {
    return (
      <Stack>
        <div className="text-[12.5px] leading-[1.65] text-[#344054]">Add a competitor and Noxtill will start building a weekly brief from what changes on their public pages.</div>
        <CloseButton />
      </Stack>
    );
  }

  return (
    <Stack>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-[12px] border border-[#E6EAF0] p-3">
          <div className="text-[11px] font-bold text-[#667085]">Changes seen</div>
          <div className="mt-1 text-[19px] font-extrabold text-[#0F172A]">{week.length}</div>
        </div>
        <div className="rounded-[12px] border border-[#E6EAF0] p-3">
          <div className="text-[11px] font-bold text-[#667085]">Most active</div>
          <div className="mt-[7px] text-[12.5px] font-extrabold text-[#0F172A]">
            {mover ? `${mover[0]} made ${mover[1]} of them` : "Nothing changed this week"}
          </div>
        </div>
      </div>
      <div>
        <div className="text-[14px] font-extrabold text-[#101828]">
          {week.length ? `${week.length} public change${week.length === 1 ? "" : "s"} in the last 7 days` : "A quiet week in your market"}
        </div>
        <div className="mt-[7px] text-[12.5px] leading-[1.65] text-[#344054]">
          {week.length
            ? week
                .slice(0, 3)
                .map((e) => e.what)
                .join(" ")
            : "No public rating or review-count movement and no recorded price, service or offer changes were seen in the last 7 days."}
        </div>
      </div>
      {topThreat ? (
        <div className="rounded-[12px] border border-[#FDE3B3] bg-[#FFFBF2] p-[13px]">
          <Label color="#93370D">Watch for</Label>
          <div className="mt-1.5 text-[12.5px] leading-[1.6] text-[#344054]">{topThreat.title}</div>
        </div>
      ) : null}
      {topAhead ? (
        <div className="rounded-[12px] border border-[#D5EFE0] bg-[#F7FCF9] p-[13px]">
          <Label color="#0E8442">Still your lead</Label>
          <div className="mt-1.5 text-[12.5px] leading-[1.6] text-[#344054]">{topAhead.title}</div>
        </div>
      ) : null}
      {recommendations[0] ? (
        <div className="rounded-[12px] border border-[#E6EAF0] p-[13px]">
          <Label>If you do one thing</Label>
          <div className="mt-1.5 text-[13px] font-bold leading-[1.55] text-[#101828]">{recommendations[0].recommendation}</div>
        </div>
      ) : null}
      <CloseButton />
    </Stack>
  );
}

function KpiSource({ kpiKey }: { kpiKey: string }) {
  const { kpis, competitors, lastChecked, now, input, settings } = useCompetitiveData();
  const range = useCompetitiveUi((s) => s.range);
  const k = kpis.find((x) => x.key === kpiKey);
  if (!k) return null;
  const since = rangeSince(range, input.now);
  const rows: [string, string][] = [
    ["Where it comes from", k.source],
    [
      "How often checked",
      `Google ratings every ${settings?.scanFrequencyDays ?? 7} day${(settings?.scanFrequencyDays ?? 7) === 1 ? "" : "s"} · ads and Instagram whenever this module opens · your own records live`,
    ],
    ["Last checked", lastChecked ? relTime(lastChecked, now) : "Not checked yet"],
    ["Period shown", `${longDate(since)} – ${longDate(now)} (${rangePhrase(range)})`],
    ["Competitors included", String(competitors.length)],
    ["What is not included", "Anything behind a login, and anything a competitor has not published"],
  ];
  return (
    <Stack>
      <div className="text-[16px] font-extrabold text-[#0F172A]">{k.label}</div>
      <div>
        {rows.map(([l, v]) => (
          <div key={l} className="flex justify-between gap-3.5 border-b border-[#F2F4F7] py-[9px]">
            <span className="flex-none basis-[42%] text-[12.5px] text-[#667085]">{l}</span>
            <span className="text-right text-[12.5px] font-bold text-[#344054]">{v}</span>
          </div>
        ))}
      </div>
      <CloseButton />
    </Stack>
  );
}

function ChangeDetail({ id }: { id: string }) {
  const { events, now } = useCompetitiveData();
  const e = events.find((x) => x.id === id);
  if (!e) return <div className="text-[12.5px] text-[#667085]">That change is no longer available.</div>;
  return (
    <Stack>
      <div className="text-[15.5px] font-extrabold leading-[1.45] text-[#0F172A]">{e.what}</div>
      <div>
        <div className="flex justify-between border-b border-[#F2F4F7] py-[9px]">
          <span className="text-[12.5px] text-[#667085]">Was</span>
          <span className="text-[12.5px] font-bold text-[#344054]">{e.was}</span>
        </div>
        <div className="flex justify-between border-b border-[#F2F4F7] py-[9px]">
          <span className="text-[12.5px] text-[#667085]">Now</span>
          <span className="text-[12.5px] font-extrabold text-[#101828]">{e.now}</span>
        </div>
        <div className="flex justify-between border-b border-[#F2F4F7] py-[9px]">
          <span className="text-[12.5px] text-[#667085]">Seen on</span>
          <span className="text-[12.5px] font-bold text-[#344054]">{e.source}</span>
        </div>
        <div className="flex justify-between py-[9px]">
          <span className="text-[12.5px] text-[#667085]">When</span>
          <span className="text-[12.5px] font-bold text-[#344054]">
            {relTime(e.at, now)} · {shortDate(e.at)}
          </span>
        </div>
      </div>
      <div>
        <Label>What it means for you</Label>
        <div className="mt-1.5 text-[12.5px] leading-[1.65] text-[#344054]">{e.meaning}</div>
      </div>
      <div className="rounded-[11px] border border-[#F0F2F5] bg-[#FAFBFC] p-3 text-[11.5px] leading-[1.55] text-[#667085]">{e.confidence}</div>
      <CloseButton />
    </Stack>
  );
}

const PROVENANCE_CHIP: Record<string, string> = { Observed: "Observed", "Your records": "Observed", Calculated: "Observed", Unavailable: "Unknown" };

function ThreatDetail() {
  const { topThreat } = useCompetitiveData();
  if (!topThreat) return <div className="text-[12.5px] text-[#667085]">Nothing needs a decision right now.</div>;
  return (
    <Stack>
      <div className="text-[15.5px] font-extrabold leading-[1.45] text-[#0F172A]">{topThreat.title}</div>
      <div>
        {topThreat.rows.map((o) => {
          const c = chip(PROVENANCE_CHIP[o.provenance]);
          return (
            <div key={o.label} className="flex items-center gap-[11px] border-b border-[#F2F4F7] py-[9px]">
              <span className="flex-1 text-[12.5px] text-[#667085]">{o.label}</span>
              <span className="text-right text-[12.5px] font-extrabold text-[#101828]">{o.value}</span>
              <span className="whitespace-nowrap rounded-[20px] px-2 py-0.5 text-[9.5px] font-extrabold" style={{ background: c.bg, color: c.fg }}>
                {o.provenance}
              </span>
            </div>
          );
        })}
      </div>
      <div className="rounded-[12px] border border-[#FDD9D6] bg-[#FEF3F2] p-[13px]">
        <div className="text-[12.5px] leading-[1.65] text-[#344054]">{topThreat.verdict}</div>
      </div>
      {topThreat.kind === "price" ? (
        <div>
          <div className="mb-[9px] text-[10.5px] font-extrabold uppercase tracking-[.4px] text-[#98A2B3]">Instead of matching the price</div>
          <div className="flex flex-col gap-2">
            {[
              "Leave the price and say more about what makes the service different",
              "Add something to the service rather than take money off it",
              "Test a bundle instead of a discount",
              "Wait and watch — their price may be introductory",
            ].map((a) => (
              <div key={a} className="flex items-start gap-[9px]">
                <span className="mt-[7px] h-1 w-1 flex-none rounded-full bg-[#12A150]" />
                <span className="text-[12.5px] leading-[1.55] text-[#344054]">{a}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="text-[11.5px] leading-[1.55] text-[#98A2B3]">
        {topThreat.evidence}. Their costs and volumes are not visible, so what this means for them is inferred, not known.
      </div>
      <CloseButton />
    </Stack>
  );
}

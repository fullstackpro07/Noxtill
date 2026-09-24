"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PRIORITY_KEYS, PRIORITY_LABEL, chip, initials, shortDate } from "@/lib/competitive-insights";
import { ErrorBanner } from "@/components/shared/error-states";
import { useCompetitiveData } from "../competitive-data";
import { useCompetitiveUi } from "../competitive-store";
import { EmptyCard, SkeletonBlock, selectClass } from "../competitive-ui";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function CompetitorsScreen() {
  const router = useRouter();
  const data = useCompetitiveData();
  const openModal = useCompetitiveUi((s) => s.openModal);
  const setActive = useCompetitiveUi((s) => s.setActiveCompetitor);
  const setProfileTab = useCompetitiveUi((s) => s.setProfileTab);
  const [q, setQ] = useState("");
  const [pri, setPri] = useState<"all" | (typeof PRIORITY_KEYS)[number]>("all");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.stats.filter((s) => (pri === "all" || s.competitor.priority === pri) && (!needle || s.competitor.name.toLowerCase().includes(needle)));
  }, [data.stats, q, pri]);

  if (data.error) return <ErrorBanner title="Couldn't load competitors" onRetry={data.refetch} />;
  if (data.loading) {
    return (
      <>
        <SkeletonBlock h={48} />
        <SkeletonBlock h={200} />
      </>
    );
  }

  const open = (id: string, to: string) => {
    setActive(id);
    setProfileTab("Overview");
    router.push(to);
  };

  return (
    <div className="flex flex-col gap-[15px]">
      <div className="flex flex-wrap items-center gap-[9px]">
        <span className="relative min-w-[200px] max-w-[300px] flex-1">
          <svg className="absolute left-3 top-3 text-[#98A2B3]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search competitors…"
            aria-label="Search competitors"
            className="min-h-[44px] w-full rounded-[10px] border border-[#E6EAF0] bg-[#F9FAFB] py-[11px] pl-9 pr-3 text-[12.5px] focus:border-[#12A150] focus:bg-white focus:outline-none focus:ring-[3px] focus:ring-[rgba(18,161,80,.12)]"
          />
        </span>
        <select aria-label="Priority" value={pri} onChange={(e) => setPri(e.target.value as typeof pri)} className={selectClass}>
          <option value="all">All priorities</option>
          {PRIORITY_KEYS.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))" }}>
        {rows.map((s) => {
          const c = s.competitor;
          const pc = chip(PRIORITY_LABEL[c.priority]);
          return (
            <div key={c.id} className="rounded-[16px] border border-[#E6EAF0] bg-white p-4 transition-all hover:border-[#BFE7CF] hover:shadow-[0_6px_18px_rgba(16,24,40,.07)]">
              <div className="flex items-start gap-[11px]">
                <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] bg-[#0A1B2A] text-[13px] font-extrabold text-white">
                  {initials(c.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-extrabold text-[#101828]">{c.name}</span>
                  <span className="mt-[3px] block truncate text-[11px] text-[#98A2B3]">
                    {[
                      data.details[c.id]?.profile?.address?.split(",").slice(0, 2).join(",").trim(),
                      data.details[c.id]?.profile?.categories[0],
                    ]
                      .filter(Boolean)
                      .join(" · ") || `Watching since ${MONTHS[s.since.getMonth()]} ${s.since.getFullYear()}`}
                  </span>
                </span>
                <span className="whitespace-nowrap rounded-[20px] px-[9px] py-[3px] text-[10px] font-extrabold" style={{ background: pc.bg, color: pc.fg }}>
                  {PRIORITY_LABEL[c.priority]}
                </span>
              </div>
              <div className="mt-[13px] flex flex-wrap gap-3.5">
                <span className="text-[11.5px] text-[#667085]">
                  Rating <strong className="text-[#101828]">{s.rating != null ? s.rating.toFixed(1) : "—"}</strong>
                </span>
                <span className="text-[11.5px] text-[#667085]">
                  Reviews <strong className="text-[#101828]">{s.reviews ?? "—"}</strong>
                </span>
                <span className="text-[11.5px] text-[#667085]">
                  Changes <strong className="text-[#101828]">{s.changesInRange}</strong>
                </span>
              </div>
              <div className="mt-[11px] text-[12px] leading-[1.55] text-[#475467]">{s.recent}</div>
              <div className="mt-[13px] flex gap-2">
                <button
                  type="button"
                  onClick={() => open(c.id, "/competitive/profile")}
                  className="min-h-[44px] flex-1 cursor-pointer rounded-[10px] border-0 bg-[#12A150] p-2.5 text-[12px] font-extrabold text-white hover:bg-[#0E8442]"
                >
                  Open profile
                </button>
                <button
                  type="button"
                  onClick={() => open(c.id, "/competitive/compare")}
                  className="min-h-[44px] flex-1 cursor-pointer rounded-[10px] border border-[#E6EAF0] bg-white p-2.5 text-[12px] font-bold text-[#344054] hover:border-[#12A150] hover:text-[#0E8442]"
                >
                  Compare
                </button>
              </div>
              {s.rating == null ? (
                <div className="mt-2.5 text-[10.5px] text-[#98A2B3]">
                  No rating read yet{c.createdAt ? ` since ${shortDate(new Date(c.createdAt))}` : ""} — the next snapshot, or “Refresh ratings now”, fills this in.
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <EmptyCard
          title="Add competitors to start tracking market changes"
          body={data.competitors.length === 0 ? "You aren't watching anyone yet." : "Nothing matches this search."}
          action={{ label: "Add competitor", onClick: () => openModal({ type: "add" }) }}
        />
      ) : null}
    </div>
  );
}

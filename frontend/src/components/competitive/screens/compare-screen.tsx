"use client";

import { ErrorBanner } from "@/components/shared/error-states";
import { buildCompareRows, buildGapCards, chip, relTime, serviceRowsFor } from "@/lib/competitive-insights";
import { useCompetitiveData } from "../competitive-data";
import { useCompetitiveUi, type CompareTab } from "../competitive-store";
import { Card, EmptyCard, Footnote, GhostButton, SkeletonBlock, TableCard, Th, selectClass } from "../competitive-ui";
import { useActiveCompetitor } from "../use-active-competitor";

export function CompareScreen() {
  const data = useCompetitiveData();
  const { active, setActive } = useActiveCompetitor();
  const tab = useCompetitiveUi((s) => s.compareTab);
  const setTab = useCompetitiveUi((s) => s.setCompareTab);
  const openModal = useCompetitiveUi((s) => s.openModal);

  if (data.error) return <ErrorBanner title="Couldn't load competitors" onRetry={data.refetch} />;
  if (data.loading) return <SkeletonBlock h={320} />;
  if (!active) {
    return (
      <EmptyCard
        title="Add competitors to start tracking market changes"
        body="The comparison lines up your products and services against what a competitor publishes."
        action={{ label: "Add competitor", onClick: () => openModal({ type: "add" }) }}
      />
    );
  }

  const c = active.competitor;
  const all = buildCompareRows(c.id, data.input);
  const theirLines = serviceRowsFor(c.id, data.observations, data.now).length;
  const rows = all.filter((r) => (tab === "Products" ? r.yourKind === "product" : r.yourKind === "service" || r.yourKind === null));
  const gaps = buildGapCards(all, theirLines, data.money);

  return (
    <div className="flex flex-col gap-[15px]">
      <div className="flex flex-wrap items-center gap-[9px]">
        <span className="text-[12.5px] font-bold text-[#344054]">You against {c.name}</span>
        {data.competitors.length > 1 ? (
          <select aria-label="Competitor" value={c.id} onChange={(e) => setActive(e.target.value)} className={`${selectClass} min-h-[36px] py-1.5 text-[12px]`}>
            {data.competitors.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        ) : null}
        <span className="ml-auto flex flex-wrap gap-[7px]">
          <GhostButton onClick={() => openModal({ type: "observe", competitorId: c.id, kind: "price" })}>Record what you saw</GhostButton>
          {(["Products", "Services"] as CompareTab[]).map((k) => {
            const on = tab === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className="min-h-[42px] cursor-pointer rounded-[20px] border px-3.5 py-[9px] text-[12px] font-bold"
                style={{ borderColor: on ? "#12A150" : "#E6EAF0", background: on ? "#F7FCF9" : "#fff", color: on ? "#0E8442" : "#475467" }}
              >
                {k}
              </button>
            );
          })}
        </span>
      </div>

      <Card overflow>
        {rows.length === 0 ? (
          <div className="px-[17px] py-10 text-center text-[12.5px] leading-[1.6] text-[#98A2B3]">
            {tab === "Products" ? "You have no active products to compare." : "You have no active services to compare, and nothing is recorded for them yet."}
            {theirLines === 0 ? ` Nothing is recorded for ${c.name} — use “Record what you saw” to add what they publish.` : ""}
          </div>
        ) : (
          <TableCard
            minWidth={820}
            head={
              <>
                <Th edge>Yours</Th>
                <Th align="right">Your price</Th>
                <Th>Theirs</Th>
                <Th align="right">Their price</Th>
                <Th align="right">Difference</Th>
                <Th edge>Seen</Th>
              </>
            }
          >
            {rows.map((r, i) => {
              const both = r.diff != null;
              const color = !both ? "#98A2B3" : r.diff! > 0 ? "#B54708" : r.diff! < 0 ? "#0E8442" : "#475467";
              return (
                <tr key={`${r.yourName}-${r.theirName}-${i}`} className="border-t border-[#F2F4F7]">
                  <td className="px-[17px] py-3 text-[12.5px] font-bold text-[#101828]">{r.yourName ?? "Not offered"}</td>
                  <td className="p-3 text-right text-[12.5px] text-[#475467]">{r.yourPrice != null ? data.money(r.yourPrice) : "—"}</td>
                  <td className="p-3 text-[12.5px] text-[#475467]">{r.theirName ?? "Not recorded"}</td>
                  <td className="p-3 text-right text-[12.5px] text-[#475467]">{r.theirName ? (r.theirPrice != null ? data.money(r.theirPrice) : "Not published") : "—"}</td>
                  <td className="p-3 text-right text-[12.5px] font-extrabold" style={{ color }}>
                    {both ? `${r.diff! > 0 ? "+" : r.diff! < 0 ? "−" : ""}${data.money(Math.abs(r.diff!))} (${Math.round(r.diffPct!)}%)` : "—"}
                  </td>
                  <td className="px-[17px] py-3 text-[11.5px] text-[#98A2B3]">{r.seen ? relTime(r.seen, data.now) : "—"}</td>
                </tr>
              );
            })}
          </TableCard>
        )}
        <Footnote>A lower price is not automatically better. What it costs you and how much demand you have matter more.</Footnote>
      </Card>

      {gaps.length > 0 ? (
        <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))" }}>
          {gaps.map((g) => {
            const tone = g.kind === "They lead" ? "Price" : g.kind === "Theirs alone" ? "Price" : "Ahead";
            const cc = chip(tone);
            return (
              <div key={g.title} className="rounded-[16px] border border-[#E6EAF0] bg-white p-4">
                <span className="rounded-[5px] px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[.4px]" style={{ background: cc.bg, color: cc.fg }}>
                  {g.kind}
                </span>
                <div className="mt-2.5 text-[13px] font-extrabold leading-[1.5] text-[#101828]">{g.title}</div>
                <div className="mt-[7px] text-[12px] leading-[1.6] text-[#475467]">{g.detail}</div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { ErrorBanner } from "@/components/shared/error-states";
import { buildOffers, rangePhrase, rangeSince, serviceRowsFor, shortDate } from "@/lib/competitive-insights";
import { useCompetitiveData } from "../competitive-data";
import { useCompetitiveUi } from "../competitive-store";
import { AmberNote, Card, CardHead, EmptyCard, GhostButton, SkeletonBlock, selectClass } from "../competitive-ui";

export function PricingScreen() {
  const data = useCompetitiveData();
  const range = useCompetitiveUi((s) => s.range);
  const openModal = useCompetitiveUi((s) => s.openModal);

  const since = rangeSince(range, data.now);
  const priced = useMemo(() => {
    let tracked = 0;
    const withPrices = new Set<string>();
    let cheaper = 0;
    let comparable = 0;
    for (const c of data.competitors) {
      for (const row of serviceRowsFor(c.id, data.observations, data.now)) {
        if (row.amount == null) continue;
        tracked += 1;
        withPrices.add(c.id);
        const mine = data.input.products.find((p) => p.active && p.name.toLowerCase().trim() === row.label.toLowerCase().trim());
        if (mine) {
          comparable += 1;
          if (mine.price < row.amount) cheaper += 1;
        }
      }
    }
    return { tracked, competitors: withPrices.size, cheaper, comparable };
  }, [data.competitors, data.observations, data.now, data.input.products]);

  if (data.error) return <ErrorBanner title="Couldn't load competitors" onRetry={data.refetch} />;
  if (data.loading) return <SkeletonBlock h={320} />;

  const changes = data.events.filter((e) => e.price);
  const changesInRange = changes.filter((e) => e.at >= since && e.price!.dir !== "new");
  const up = changesInRange.filter((e) => e.price!.dir === "up").length;
  const offers = buildOffers(data.input);
  const live = offers.filter((o) => o.live);

  const kpis = [
    { l: "Prices tracked", v: String(priced.tracked), sub: priced.tracked ? `across ${priced.competitors} competitor${priced.competitors === 1 ? "" : "s"}` : "none recorded yet", color: "#0F172A" },
    { l: "Price changes", v: String(changesInRange.length), sub: changesInRange.length ? `${changesInRange.length - up} down, ${up} up · ${rangePhrase(range)}` : rangePhrase(range), color: changesInRange.length ? "#B54708" : "#0F172A" },
    { l: "You are cheaper on", v: String(priced.cheaper), sub: priced.comparable ? `of ${priced.comparable} comparable line${priced.comparable === 1 ? "" : "s"}` : "no comparable lines yet", color: priced.cheaper ? "#12A150" : "#0F172A" },
    { l: "Live public offers", v: String(live.length), sub: live[0] ? `${live[0].who}${live.length > 1 ? ` and ${live.length - 1} more` : ""}` : "none running", color: "#0F172A" },
  ];

  return (
    <div className="flex flex-col gap-[15px]">
      <div className="grid gap-3.5 max-[620px]:grid-cols-2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
        {kpis.map((k) => (
          <div key={k.l} className="rounded-[14px] border border-[#E6EAF0] bg-white p-[15px]">
            <div className="text-[12px] font-semibold text-[#667085]">{k.l}</div>
            <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: k.color }}>
              {k.v}
            </div>
            <div className="mt-1 text-[10.5px] text-[#98A2B3]">{k.sub}</div>
          </div>
        ))}
      </div>

      {data.competitors.length === 0 ? (
        <EmptyCard
          title="Add competitors to start tracking prices"
          body="Prices and offers are recorded by you from a competitor's own public pages — add one to begin."
          action={{ label: "Add competitor", onClick: () => openModal({ type: "add" }) }}
        />
      ) : (
        <div className="grid gap-[15px] min-[1100px]:grid-cols-2">
          <Card overflow>
            <CardHead title="Price changes seen" right={<GhostButton onClick={() => openModal({ type: "observe", kind: "price" })}>Record what you saw</GhostButton>} />
            {changes.length === 0 ? (
              <div className="border-t border-[#F2F4F7] px-[17px] py-8 text-center text-[12.5px] leading-[1.6] text-[#98A2B3]">
                No price changes yet. Record a competitor&apos;s price today, and record it again when it changes — the difference shows up here.
              </div>
            ) : (
              changes.slice(0, 8).map((e) => {
                const p = e.price!;
                const color = p.dir === "up" ? "#B54708" : p.dir === "down" ? "#0E8442" : "#3538CD";
                const arrow = p.dir === "up" ? "▲" : p.dir === "down" ? "▼" : "●";
                return (
                  <div key={e.id} className="border-t border-[#F2F4F7] px-[17px] py-3">
                    <div className="flex flex-wrap items-center gap-[9px]">
                      <span className="text-[13px] font-extrabold" style={{ color }}>
                        {arrow}
                      </span>
                      <span className="text-[12.5px] font-bold text-[#101828]">{e.competitorName}</span>
                      <span className="text-[12px] text-[#667085]">{p.label}</span>
                      <span className="ml-auto text-[11px] text-[#98A2B3]">{shortDate(e.at)}</span>
                    </div>
                    <div className="mt-[5px] text-[12px] text-[#475467]">
                      {p.from != null ? data.money(p.from) : "Newly listed"} → <strong className="text-[#101828]">{p.to != null ? data.money(p.to) : "no price published"}</strong>
                    </div>
                  </div>
                );
              })
            )}
          </Card>

          <Card overflow>
            <CardHead title="Public offers" right={<GhostButton onClick={() => openModal({ type: "observe", kind: "offer" })}>Record an offer</GhostButton>} />
            {offers.length === 0 ? (
              <div className="border-t border-[#F2F4F7] px-[17px] py-8 text-center text-[12.5px] leading-[1.6] text-[#98A2B3]">No public offers recorded yet.</div>
            ) : (
              offers.slice(0, 8).map((o) => (
                <div key={o.id} className="flex flex-wrap items-center gap-[11px] border-t border-[#F2F4F7] px-[17px] py-3">
                  <span className="min-w-[160px] flex-1">
                    <span className="block text-[12.5px] font-bold text-[#101828]">{o.offer}</span>
                    <span className="mt-[3px] block text-[11px] text-[#98A2B3]">
                      {o.who} · {o.ends}
                    </span>
                  </span>
                  {o.live ? <span className="rounded-[20px] bg-[#E8F7EE] px-[9px] py-[3px] text-[10px] font-extrabold text-[#0E8442]">Running</span> : null}
                </div>
              ))
            )}
          </Card>
        </div>
      )}

      <Simulator />
    </div>
  );
}

function Simulator() {
  const data = useCompetitiveData();
  const units = useMemo(() => new Map(data.input.profitRows.map((r) => [r.productId, r.units])), [data.input.profitRows]);
  const options = useMemo(
    () => data.input.products.filter((p) => p.active && p.price > 0).sort((a, b) => (units.get(b.id) ?? 0) - (units.get(a.id) ?? 0)),
    [data.input.products, units],
  );
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [override, setOverride] = useState<{ id: string; price: number } | null>(null);

  const product = options.find((p) => p.id === pickedId) ?? options[0];
  if (!product) {
    return (
      <Card border="#BFE7CF" thick pad>
        <h3 className="m-0 mb-1 text-[14.5px] font-extrabold text-[#101828]">Try a price before you change one</h3>
        <p className="m-0 text-[12px] text-[#667085]">Add a product or service with a selling price and the simulator will use its real cost and sales.</p>
      </Card>
    );
  }

  const base = product.price;
  const cost = product.costPrice;
  const sold = units.get(product.id) ?? 0;
  const sim = override && override.id === product.id ? override.price : base;
  const min = Math.max(1, Math.round(base * 0.5));
  const max = Math.round(base * 1.5);
  const step = Math.max(1, Math.round(base / 100));
  const margin = sim > 0 ? ((sim - cost) / sim) * 100 : 0;
  const marginColor = margin < 35 ? "#B42318" : margin < 45 ? "#B54708" : "#0E8442";
  const delta = sim === base ? "This is your current price." : sim < base ? `That is ${data.money(base - sim)} less per sale than today.` : `That is ${data.money(sim - base)} more per sale than today.`;

  return (
    <Card border="#BFE7CF" thick pad>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-[220px] flex-1">
          <h3 className="m-0 mb-1 text-[14.5px] font-extrabold text-[#101828]">Try a price before you change one</h3>
          <p className="m-0 mb-3.5 text-[12px] text-[#667085]">
            {product.name} · your cost is {data.money(cost)} · {sold} {sold === 1 ? "sale" : "sales"} in the last 30 days
          </p>
        </div>
        {options.length > 1 ? (
          <select
            aria-label="Product to simulate"
            value={product.id}
            onChange={(e) => {
              setPickedId(e.target.value);
              setOverride(null);
            }}
            className={`${selectClass} min-h-[36px] py-1.5 text-[12px]`}
          >
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <div className="mb-[9px] flex justify-between">
        <span className="text-[12.5px] font-bold text-[#344054]">Price</span>
        <span className="text-[16px] font-extrabold text-[#0F172A]">{data.money(sim)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={sim}
        onChange={(e) => setOverride({ id: product.id, price: Number(e.target.value) })}
        aria-label="Simulated price"
        className="w-full accent-[#12A150]"
      />
      <div className="mt-1.5 text-[11.5px] text-[#667085]">{delta}</div>
      <div className="mt-3.5 grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))" }}>
        <div className="rounded-[12px] border border-[#E6EAF0] p-3">
          <div className="text-[11px] font-bold text-[#667085]">Margin</div>
          <div className="mt-1 text-[18px] font-extrabold" style={{ color: marginColor }}>
            {margin.toFixed(1)}%
          </div>
        </div>
        <div className="rounded-[12px] border border-[#E6EAF0] p-3">
          <div className="text-[11px] font-bold text-[#667085]">Monthly revenue</div>
          <div className="mt-1 text-[18px] font-extrabold text-[#0F172A]">{data.money(sim * sold)}</div>
        </div>
        <div className="rounded-[12px] border border-[#E6EAF0] p-3">
          <div className="text-[11px] font-bold text-[#667085]">Monthly profit</div>
          <div className="mt-1 text-[18px] font-extrabold text-[#0F172A]">{data.money((sim - cost) * sold)}</div>
        </div>
      </div>
      <AmberNote className="mt-[13px]">
        {sold > 0
          ? `Assumes the same ${sold} sale${sold === 1 ? "" : "s"} a month and your recorded cost of ${data.money(cost)}. Whether volume actually holds at a different price is unknown — this is a simulation, not a forecast.`
          : `There were no sales of ${product.name} in the last 30 days, so monthly revenue and profit are zero here. Margin per sale is still real, using your recorded cost of ${data.money(cost)}.`}
      </AmberNote>
    </Card>
  );
}

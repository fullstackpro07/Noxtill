"use client";

import { useState } from "react";
import Link from "next/link";
import { Percent } from "lucide-react";

const inputClass =
  "h-11 w-full rounded-[10px] border border-border-strong bg-surface-2 px-3.5 text-sm text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none";

function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export function ProfitMarginCalculatorTool() {
  const [price, setPrice] = useState(50);
  const [materials, setMaterials] = useState(12);
  const [minutes, setMinutes] = useState(30);
  const [hourlyRate, setHourlyRate] = useState(20);
  const [overheadPct, setOverheadPct] = useState(10);

  const laborCost = (minutes / 60) * hourlyRate;
  const overheadCost = price * (overheadPct / 100);
  const trueCost = materials + laborCost + overheadCost;
  const marginDollar = price - trueCost;
  const marginPct = price > 0 ? (marginDollar / price) * 100 : 0;
  const naiveMarginPct = price > 0 ? ((price - materials) / price) * 100 : 0;

  return (
    <div className="rounded-2xl border border-border bg-white p-6 sm:p-8">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-[#e3fbf1]">
          <Percent className="h-4.5 w-4.5 text-accent" aria-hidden />
        </span>
        <span className="font-display text-lg font-semibold text-fg">Calculate your real margin</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-fg">Selling price ($)</span>
          <input type="number" min={0} className={inputClass} value={price} onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-fg">Materials / ingredients cost ($)</span>
          <input type="number" min={0} className={inputClass} value={materials} onChange={(e) => setMaterials(Math.max(0, Number(e.target.value) || 0))} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-fg">Time spent (minutes)</span>
          <input type="number" min={0} className={inputClass} value={minutes} onChange={(e) => setMinutes(Math.max(0, Number(e.target.value) || 0))} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-fg">Your hourly rate ($/hr)</span>
          <input type="number" min={0} className={inputClass} value={hourlyRate} onChange={(e) => setHourlyRate(Math.max(0, Number(e.target.value) || 0))} />
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[12.5px] font-medium text-fg">Overhead share (% of price)</span>
          <input
            type="number"
            min={0}
            max={100}
            className={inputClass}
            value={overheadPct}
            onChange={(e) => setOverheadPct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
          />
        </label>
      </div>

      <div className="mt-6 grid grid-cols-1 divide-y divide-border rounded-xl border border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="p-4 text-center">
          <div className="font-display text-2xl font-bold text-fg">{money(trueCost)}</div>
          <div className="mt-1 text-[11.5px] text-fg-faint">true cost (materials + time + overhead)</div>
        </div>
        <div className="p-4 text-center">
          <div className="font-display text-2xl font-bold text-primary">{money(marginDollar)}</div>
          <div className="mt-1 text-[11.5px] text-fg-faint">real profit per sale</div>
        </div>
        <div className="p-4 text-center">
          <div className="font-display text-2xl font-bold text-accent">{marginPct.toFixed(0)}%</div>
          <div className="mt-1 text-[11.5px] text-fg-faint">real margin</div>
        </div>
      </div>

      <p className="mt-4 text-[12.5px] leading-relaxed text-fg-faint">
        Materials-cost-only, this would look like a {naiveMarginPct.toFixed(0)}% margin — counting your time and a fair share of
        overhead brings it to the real {marginPct.toFixed(0)}%. See{" "}
        <Link href="/product/pnl" className="text-primary hover:underline">
          Profit &amp; Loss
        </Link>{" "}
        for how Noxtill tracks this automatically, per item.
      </p>
    </div>
  );
}

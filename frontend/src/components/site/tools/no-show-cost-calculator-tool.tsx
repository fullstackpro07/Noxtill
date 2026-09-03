"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarX } from "lucide-react";

const inputClass =
  "h-11 w-full rounded-[10px] border border-border-strong bg-surface-2 px-3.5 text-sm text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none";

function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function NoShowCostCalculatorTool() {
  const [noShowsPerWeek, setNoShowsPerWeek] = useState(4);
  const [avgValue, setAvgValue] = useState(30);

  const weeklyCost = noShowsPerWeek * avgValue;
  const annualCost = weeklyCost * 52;
  const recoverable = annualCost * 0.7;

  return (
    <div className="rounded-2xl border border-border bg-white p-6 sm:p-8">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-[#e3fbf1]">
          <CalendarX className="h-4.5 w-4.5 text-accent" aria-hidden />
        </span>
        <span className="font-display text-lg font-semibold text-fg">Calculate your no-show cost</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-fg">No-shows per week</span>
          <input
            type="number"
            min={0}
            className={inputClass}
            value={noShowsPerWeek}
            onChange={(e) => setNoShowsPerWeek(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-fg">Average service value ($)</span>
          <input
            type="number"
            min={0}
            className={inputClass}
            value={avgValue}
            onChange={(e) => setAvgValue(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
      </div>

      <div className="mt-6 grid grid-cols-1 divide-y divide-border rounded-xl border border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="p-4 text-center">
          <div className="font-display text-2xl font-bold text-fg">{money(weeklyCost)}</div>
          <div className="mt-1 text-[11.5px] text-fg-faint">lost per week</div>
        </div>
        <div className="p-4 text-center">
          <div className="font-display text-2xl font-bold text-primary">{money(annualCost)}</div>
          <div className="mt-1 text-[11.5px] text-fg-faint">lost per year</div>
        </div>
        <div className="p-4 text-center">
          <div className="font-display text-2xl font-bold text-accent">{money(recoverable)}</div>
          <div className="mt-1 text-[11.5px] text-fg-faint">typically recoverable with reminders</div>
        </div>
      </div>

      <p className="mt-4 text-[12.5px] leading-relaxed text-fg-faint">
        Based on {noShowsPerWeek} no-show{noShowsPerWeek === 1 ? "" : "s"}/week × {money(avgValue)}/service × 52 weeks. The recoverable
        estimate reflects the typical reduction businesses see from two automatic reminders plus waitlist fills — see{" "}
        <Link href="/product/bookings" className="text-primary hover:underline">
          Bookings
        </Link>
        .
      </p>
    </div>
  );
}

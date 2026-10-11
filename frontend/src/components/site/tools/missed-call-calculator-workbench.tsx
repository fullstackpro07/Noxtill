"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  calculateMissedCallApi,
  type MissedCallInput,
  type MissedCallResult,
  type MissedCallScenario,
} from "@/lib/tools-api";
import {
  PhoneMissed,
  TrendingDown,
  Users,
  Copy,
  Check,
  Sparkles,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";

export function MissedCallCalculatorWorkbench() {
  const [missedCalls, setMissedCalls] = useState<number>(120);
  const [averageSaleValue, setAverageSaleValue] = useState<number>(250);
  const [grossMarginPct, setGrossMarginPct] = useState<number>(45);
  const [eligibleSharePct, setEligibleSharePct] = useState<number>(80);
  const [contactRatePct, setContactRatePct] = useState<number>(50);
  const [bookingRatePct, setBookingRatePct] = useState<number>(40);
  const [saleClosePct, setSaleClosePct] = useState<number>(60);
  const [currency, setCurrency] = useState<string>("USD");

  const [activeScenario, setActiveScenario] = useState<"base" | "conservative" | "optimistic">("base");
  const [showAdvancedFunnel, setShowAdvancedFunnel] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [result, setResult] = useState<MissedCallResult | null>(null);

  useEffect(() => {
    const input: MissedCallInput = {
      missedCalls: Math.max(0, missedCalls || 0),
      averageSaleValue: Math.max(0, averageSaleValue || 0),
      grossMarginPct: Math.min(100, Math.max(0, grossMarginPct || 0)),
      eligibleSharePct: Math.min(100, Math.max(0, eligibleSharePct || 0)),
      contactRatePct: Math.min(100, Math.max(0, contactRatePct || 0)),
      bookingRatePct: Math.min(100, Math.max(0, bookingRatePct || 0)),
      saleClosePct: Math.min(100, Math.max(0, saleClosePct || 0)),
      currency,
    };

    calculateMissedCallApi(input).then(setResult);
  }, [
    missedCalls,
    averageSaleValue,
    grossMarginPct,
    eligibleSharePct,
    contactRatePct,
    bookingRatePct,
    saleClosePct,
    currency,
  ]);

  const activeData: MissedCallScenario | undefined = result ? result[activeScenario] : undefined;

  const copySummary = () => {
    if (!result || !activeData) return;
    const text = `Noxtill Missed Call Revenue Leakage Analysis (${activeScenario.toUpperCase()} model):
Missed Calls/Mo: ${result.missedCalls}
Avg Ticket Value: ${currency} ${result.averageSaleValue.toFixed(2)}
Estimated Closed Clients Lost: ${activeData.closedSales.toFixed(1)} / month
---
Monthly Revenue Leaked: ${currency} ${activeData.lostRevenueMonthly.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Monthly Gross Profit Leaked: ${currency} ${activeData.lostProfitMonthly.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Annual Revenue Leaked: ${currency} ${activeData.lostRevenueAnnual.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Annual Gross Profit Leaked: ${currency} ${activeData.lostProfitAnnual.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Form Left */}
      <div className="lg:col-span-7 space-y-6">
        <div className="rounded-2xl border border-[#2FE3A6]/20 bg-[#032019]/70 p-6 backdrop-blur-sm shadow-xl space-y-6">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <PhoneMissed className="w-4 h-4 text-[#2FE3A6]" /> Call Volume & Ticket Economics
            </h3>
            <span className="text-xs text-[#9DBBB0]">Interactive Business Modeler</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0]">
                  Missed Calls / Month
                </label>
                <span className="text-xs font-mono font-bold text-[#2FE3A6]">{missedCalls}</span>
              </div>
              <input
                type="number"
                min="0"
                step="5"
                value={missedCalls}
                onChange={(e) => setMissedCalls(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#2FE3A6]"
              />
              <input
                type="range"
                min="0"
                max="500"
                step="5"
                value={missedCalls}
                onChange={(e) => setMissedCalls(parseInt(e.target.value) || 0)}
                className="w-full accent-[#2FE3A6] mt-2 cursor-pointer"
              />
              <span className="text-[11px] text-[#7E9F91] mt-1 block">Unanswered or after-hours inbound inquiries</span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0]">
                  Average Ticket Value
                </label>
                <span className="text-xs font-mono font-bold text-[#2FE3A6]">
                  {currency} {averageSaleValue}
                </span>
              </div>
              <input
                type="number"
                min="0"
                step="10"
                value={averageSaleValue}
                onChange={(e) => setAverageSaleValue(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#2FE3A6]"
              />
              <input
                type="range"
                min="10"
                max="2500"
                step="25"
                value={averageSaleValue}
                onChange={(e) => setAverageSaleValue(parseFloat(e.target.value) || 0)}
                className="w-full accent-[#2FE3A6] mt-2 cursor-pointer"
              />
              <span className="text-[11px] text-[#7E9F91] mt-1 block">Average order / job / service booking value</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-white/5">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0]">
                  Gross Profit Margin %
                </label>
                <span className="text-xs font-mono font-bold text-[#2FE3A6]">{grossMarginPct}%</span>
              </div>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={grossMarginPct}
                onChange={(e) => setGrossMarginPct(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#2FE3A6]"
              />
              <span className="text-[11px] text-[#7E9F91] mt-1 block">Gross margin after direct costs / COGS</span>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#2FE3A6]"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="CAD">CAD ($)</option>
                <option value="AUD">AUD ($)</option>
                <option value="AED">AED (د.إ)</option>
                <option value="PKR">PKR (₨)</option>
              </select>
            </div>
          </div>

          {/* Collapsible Funnel Rates Tuning */}
          <div className="pt-2 border-t border-white/5">
            <button
              type="button"
              onClick={() => setShowAdvancedFunnel(!showAdvancedFunnel)}
              className="text-xs text-[#2FE3A6] hover:underline flex items-center gap-1 font-semibold"
            >
              <span>{showAdvancedFunnel ? "Hide Conversion Funnel Ratios" : "Customize Conversion Funnel Ratios"}</span>
              <ArrowRight className={`w-3 h-3 transition-transform ${showAdvancedFunnel ? "rotate-90" : ""}`} />
            </button>

            {showAdvancedFunnel && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-[#021A14]/80 border border-[#2FE3A6]/15">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#9DBBB0]">Qualified / Intent Callers</span>
                    <span className="text-[#2FE3A6] font-mono">{eligibleSharePct}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={eligibleSharePct}
                    onChange={(e) => setEligibleSharePct(parseInt(e.target.value) || 0)}
                    className="w-full accent-[#2FE3A6]"
                  />
                  <span className="text-[10px] text-[#7E9F91]">Excludes spam or wrong numbers</span>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#9DBBB0]">Contact / Callback Rate</span>
                    <span className="text-[#2FE3A6] font-mono">{contactRatePct}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={contactRatePct}
                    onChange={(e) => setContactRatePct(parseInt(e.target.value) || 0)}
                    className="w-full accent-[#2FE3A6]"
                  />
                  <span className="text-[10px] text-[#7E9F91]">Callers successfully reached on follow-up</span>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#9DBBB0]">Booking / Consultation Rate</span>
                    <span className="text-[#2FE3A6] font-mono">{bookingRatePct}%</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    value={bookingRatePct}
                    onChange={(e) => setBookingRatePct(parseInt(e.target.value) || 0)}
                    className="w-full accent-[#2FE3A6]"
                  />
                  <span className="text-[10px] text-[#7E9F91]">Callers who schedule an appointment</span>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#9DBBB0]">Close / Purchase Rate</span>
                    <span className="text-[#2FE3A6] font-mono">{saleClosePct}%</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    value={saleClosePct}
                    onChange={(e) => setSaleClosePct(parseInt(e.target.value) || 0)}
                    className="w-full accent-[#2FE3A6]"
                  />
                  <span className="text-[10px] text-[#7E9F91]">Bookings converted into paid revenue</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick Funnel Visualizer */}
        {activeData && (
          <div className="rounded-2xl border border-[#2FE3A6]/20 bg-[#032019]/70 p-6 backdrop-blur-sm shadow-xl">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#2FE3A6] mb-4 flex items-center gap-2">
              <Users className="w-4 h-4" /> Funnel Attrition Visualizer ({activeScenario.toUpperCase()} model)
            </h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-[#9DBBB0]">
                <span>1. Total Inbound Missed</span>
                <span className="font-mono text-white font-semibold">{missedCalls} callers</span>
              </div>
              <div className="w-full bg-[#021A14] h-2 rounded-full overflow-hidden">
                <div className="bg-red-400 h-full rounded-full w-full" />
              </div>

              <div className="flex items-center justify-between text-xs text-[#9DBBB0]">
                <span>2. Commercial Intent Callers</span>
                <span className="font-mono text-white font-semibold">{activeData.eligibleCallers} callers</span>
              </div>
              <div className="w-full bg-[#021A14] h-2 rounded-full overflow-hidden">
                <div
                  className="bg-amber-400 h-full rounded-full transition-all"
                  style={{ width: `${Math.min(100, (activeData.eligibleCallers / Math.max(1, missedCalls)) * 100)}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-[#9DBBB0]">
                <span>3. Contacted via Callback</span>
                <span className="font-mono text-white font-semibold">{activeData.reachedCallers} callers</span>
              </div>
              <div className="w-full bg-[#021A14] h-2 rounded-full overflow-hidden">
                <div
                  className="bg-yellow-300 h-full rounded-full transition-all"
                  style={{ width: `${Math.min(100, (activeData.reachedCallers / Math.max(1, missedCalls)) * 100)}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-[#9DBBB0]">
                <span>4. Booked Appointments</span>
                <span className="font-mono text-white font-semibold">{activeData.bookedAppointments} booked</span>
              </div>
              <div className="w-full bg-[#021A14] h-2 rounded-full overflow-hidden">
                <div
                  className="bg-[#2FE3A6]/80 h-full rounded-full transition-all"
                  style={{ width: `${Math.min(100, (activeData.bookedAppointments / Math.max(1, missedCalls)) * 100)}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-[#9DBBB0]">
                <span>5. Closed Paying Customers</span>
                <span className="font-mono text-[#2FE3A6] font-bold">{activeData.closedSales} clients</span>
              </div>
              <div className="w-full bg-[#021A14] h-2 rounded-full overflow-hidden">
                <div
                  className="bg-[#2FE3A6] h-full rounded-full transition-all"
                  style={{ width: `${Math.min(100, (activeData.closedSales / Math.max(1, missedCalls)) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Output Right */}
      <div className="lg:col-span-5 space-y-6">
        <div className="rounded-2xl border border-red-500/30 bg-[#032019]/90 p-6 backdrop-blur-md shadow-2xl relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-red-400" /> Revenue Leakage Estimate
            </span>
            <button
              type="button"
              onClick={copySummary}
              className="p-1.5 rounded-lg border border-[#2FE3A6]/25 text-[#2FE3A6] hover:bg-[#2FE3A6]/15 transition-colors text-xs inline-flex items-center gap-1"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>

          {/* Scenario Selector Pills */}
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#021A14] border border-white/5 mb-5">
            <button
              type="button"
              onClick={() => setActiveScenario("conservative")}
              className={`py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeScenario === "conservative"
                  ? "bg-[#042D22] text-[#2FE3A6] border border-[#2FE3A6]/40"
                  : "text-[#8EAEA0] hover:text-white"
              }`}
            >
              Conservative
            </button>
            <button
              type="button"
              onClick={() => setActiveScenario("base")}
              className={`py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeScenario === "base"
                  ? "bg-[#042D22] text-[#2FE3A6] border border-[#2FE3A6]/40"
                  : "text-[#8EAEA0] hover:text-white"
              }`}
            >
              Base Case
            </button>
            <button
              type="button"
              onClick={() => setActiveScenario("optimistic")}
              className={`py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeScenario === "optimistic"
                  ? "bg-[#042D22] text-[#2FE3A6] border border-[#2FE3A6]/40"
                  : "text-[#8EAEA0] hover:text-white"
              }`}
            >
              Optimistic
            </button>
          </div>

          {activeData && (
            <>
              {/* Annualized Big Highlight */}
              <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/30 mb-5">
                <span className="text-xs text-red-300 uppercase font-semibold flex items-center gap-1.5">
                  <TrendingDown className="w-3.5 h-3.5 text-red-400" /> Annual Lost Revenue
                </span>
                <div className="text-3xl sm:text-4xl font-extrabold text-white mt-1">
                  {currency} {activeData.lostRevenueAnnual.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
                <div className="text-xs text-red-200/80 mt-1">
                  Equals {currency} {activeData.lostProfitAnnual.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} in lost bottom-line profit/year
                </div>
              </div>

              {/* Monthly Breakdown Grid */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="p-4 rounded-xl bg-[#021A14] border border-[#2FE3A6]/20">
                  <div className="text-xs text-[#8EAEA0] uppercase font-semibold">Monthly Lost Rev</div>
                  <div className="text-xl sm:text-2xl font-extrabold text-white mt-0.5">
                    {currency} {activeData.lostRevenueMonthly.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-[11px] text-[#A3C6B8] mt-1">Direct sales missed</div>
                </div>

                <div className="p-4 rounded-xl bg-[#021A14] border border-[#2FE3A6]/20">
                  <div className="text-xs text-[#8EAEA0] uppercase font-semibold">Monthly Lost Profit</div>
                  <div className="text-xl sm:text-2xl font-extrabold text-[#2FE3A6] mt-0.5">
                    {currency} {activeData.lostProfitMonthly.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-[11px] text-[#A3C6B8] mt-1">At {grossMarginPct}% margin</div>
                </div>
              </div>

              {/* Closed Clients Lost Card */}
              <div className="p-3.5 rounded-xl bg-[#042D22] border border-[#2FE3A6]/25 flex items-center justify-between mb-5">
                <div>
                  <span className="text-xs text-[#8EAEA0] block">Recoverable Paying Clients:</span>
                  <span className="text-sm font-bold text-white">
                    ~{activeData.closedSales.toFixed(1)} customers / month ({Math.round(activeData.closedSales * 12)} per year)
                  </span>
                </div>
                <Users className="w-5 h-5 text-[#2FE3A6]" />
              </div>

              {/* Noxtill AI Attendant CTA */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-[#063B2C] to-[#021A14] border border-[#2FE3A6]/40 text-center space-y-2.5">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#2FE3A6]/20 text-[#2FE3A6] text-xs font-semibold">
                  <Sparkles className="w-3.5 h-3.5" /> Noxtill AI Receptionist
                </div>
                <p className="text-xs text-[#B8CFC5]">
                  Never lose a caller to voicemail again. Noxtill answers 24/7, qualifies leads, and books them directly into your calendar.
                </p>
                <Link
                  href="/receptionist"
                  className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-[#2FE3A6] text-[#021A14] text-xs font-bold hover:bg-[#28CF96] transition-colors shadow-lg"
                >
                  <span>Explore AI Phone Receptionist</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

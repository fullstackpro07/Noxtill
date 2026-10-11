"use client";

import { useEffect, useState } from "react";
import { calculateBreakEvenApi, type BreakEvenInput, type BreakEvenResult } from "@/lib/tools-api";
import { Copy, Check, AlertCircle, BarChart3, TrendingUp } from "lucide-react";

export function BreakEvenCalculatorWorkbench() {
  const [fixedCosts, setFixedCosts] = useState<number>(3500);
  const [unitPrice, setUnitPrice] = useState<number>(65);
  const [variableCost, setVariableCost] = useState<number>(25);
  const [targetProfit, setTargetProfit] = useState<number>(1500);
  const [period, setPeriod] = useState<"month" | "year" | "quarter">("month");
  const [currency, setCurrency] = useState<string>("USD");
  const [copied, setCopied] = useState<boolean>(false);

  const [result, setResult] = useState<BreakEvenResult | null>(null);

  useEffect(() => {
    const input: BreakEvenInput = {
      fixedCosts: Math.max(0, fixedCosts || 0),
      sellingPricePerUnit: Math.max(0.01, unitPrice || 0.01),
      variableCostPerUnit: Math.max(0, variableCost || 0),
      targetProfit: Math.max(0, targetProfit || 0),
      period,
      currency,
    };

    calculateBreakEvenApi(input).then(setResult);
  }, [fixedCosts, unitPrice, variableCost, targetProfit, period, currency]);

  const copySummary = () => {
    if (!result || !result.possible) return;
    const summary = `Break-Even Analysis (${period}ly):
Fixed Costs: ${currency} ${result.fixedCosts.toFixed(2)}
Selling Price: ${currency} ${result.sellingPricePerUnit.toFixed(2)}
Variable Cost: ${currency} ${result.variableCostPerUnit.toFixed(2)}
Contribution Margin: ${currency} ${result.contributionMargin.toFixed(2)} (${(result.contributionMarginRatio * 100).toFixed(1)}%)
Break-Even Volume: ${result.breakEvenUnits} units
Break-Even Revenue: ${currency} ${result.breakEvenRevenue?.toFixed(2)}
${result.targetProfitUnits ? `Target Profit Goal (${currency} ${targetProfit}): ${result.targetProfitUnits} units (${currency} ${result.targetProfitRevenue?.toFixed(2)})` : ""}`;

    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Form Left */}
      <div className="lg:col-span-7 space-y-6">
        <div className="rounded-2xl border border-[#2FE3A6]/20 bg-[#032019]/70 p-6 backdrop-blur-sm shadow-xl space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                Total Fixed Costs ({period}ly)
              </label>
              <input
                type="number"
                min="0"
                step="10"
                value={fixedCosts}
                onChange={(e) => setFixedCosts(parseFloat(e.target.value) || 0)}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#2FE3A6]"
              />
              <span className="text-[11px] text-[#7E9F91] mt-1 block">Rent, salaries, software, insurance</span>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                Time Horizon
              </label>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as "month" | "year" | "quarter")}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#2FE3A6]"
              >
                <option value="month">Monthly</option>
                <option value="quarter">Quarterly</option>
                <option value="year">Annual</option>
              </select>
            </div>
          </div>

          <div className="pt-2 border-t border-white/5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                Unit Selling Price
              </label>
              <input
                type="number"
                min="0.01"
                step="0.5"
                value={unitPrice}
                onChange={(e) => setUnitPrice(parseFloat(e.target.value) || 0.01)}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#2FE3A6]"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                Variable Cost Per Unit
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={variableCost}
                onChange={(e) => setVariableCost(parseFloat(e.target.value) || 0)}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#2FE3A6]"
              />
              <span className="text-[11px] text-[#7E9F91] mt-1 block">Materials, shipping, unit labor</span>
            </div>
          </div>

          <div className="pt-2 border-t border-white/5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                Target Profit Goal ({period}ly)
              </label>
              <input
                type="number"
                min="0"
                step="50"
                value={targetProfit}
                onChange={(e) => setTargetProfit(parseFloat(e.target.value) || 0)}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#2FE3A6]"
              />
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
        </div>
      </div>

      {/* Output Right */}
      <div className="lg:col-span-5 space-y-5">
        <div className="rounded-2xl border border-[#2FE3A6]/30 bg-[#032019]/90 p-6 backdrop-blur-md shadow-2xl relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-[#2EE6B0]">
              Break-Even Targets
            </span>
            {result?.possible && (
              <button
                type="button"
                onClick={copySummary}
                className="p-1.5 rounded-lg border border-[#2FE3A6]/25 text-[#2FE3A6] hover:bg-[#2FE3A6]/15 transition-colors text-xs inline-flex items-center gap-1"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            )}
          </div>

          {result && !result.possible && (
            <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/30 text-red-200 text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold mb-1">Break-Even Impossible</strong>
                {result.message}
              </div>
            </div>
          )}

          {result && result.possible && (
            <>
              {/* Primary Dual Stats */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="p-4 rounded-xl bg-[#021A14] border border-[#2FE3A6]/30">
                  <div className="text-xs text-[#8EAEA0] uppercase font-semibold">Break-Even Volume</div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-[#2FE3A6] mt-0.5">
                    {result.breakEvenUnits} <span className="text-sm font-normal text-white">units</span>
                  </div>
                  <div className="text-[11px] text-[#A3C6B8] mt-1">To cover fixed costs</div>
                </div>

                <div className="p-4 rounded-xl bg-[#021A14] border border-[#2FE3A6]/30">
                  <div className="text-xs text-[#8EAEA0] uppercase font-semibold">Threshold Revenue</div>
                  <div className="text-xl sm:text-2xl font-extrabold text-white mt-0.5">
                    {currency} {result.breakEvenRevenue?.toFixed(2)}
                  </div>
                  <div className="text-[11px] text-[#A3C6B8] mt-1">Gross sales required</div>
                </div>
              </div>

              {/* Target Profit Volume */}
              {result.targetProfitUnits != null && targetProfit > 0 && (
                <div className="p-3.5 rounded-xl bg-[#042D22] border border-[#2FE3A6]/20 flex items-center justify-between mb-4">
                  <div>
                    <span className="text-xs text-[#8EAEA0] block">To Earn {currency} {targetProfit} Profit:</span>
                    <span className="text-sm font-bold text-white">
                      {result.targetProfitUnits} units ({currency} {result.targetProfitRevenue?.toFixed(2)})
                    </span>
                  </div>
                  <TrendingUp className="w-5 h-5 text-[#2FE3A6]" />
                </div>
              )}

              {/* Unit Contribution Details */}
              <div className="space-y-2 text-sm text-[#B8CFC5] border-t border-white/5 pt-3">
                <div className="flex justify-between py-1">
                  <span>Unit Contribution Margin</span>
                  <span className="text-white font-medium">
                    {currency} {result.contributionMargin.toFixed(2)} / unit
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span>Contribution Margin Ratio</span>
                  <span className="text-[#2FE3A6] font-medium">
                    {(result.contributionMarginRatio * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Small scenario progress table */}
              {result.chartSeries.length > 0 && (
                <div className="mt-5 pt-4 border-t border-white/10">
                  <div className="text-xs font-semibold text-[#8EAEA0] uppercase mb-2 flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5 text-[#2FE3A6]" /> Scale Sensitivity Points
                  </div>
                  <div className="space-y-1 text-xs text-[#C9DCD2] max-h-40 overflow-y-auto pr-1">
                    {result.chartSeries.slice(0, 5).map((pt, idx) => (
                      <div
                        key={idx}
                        className={`flex justify-between py-1 px-2 rounded ${
                          pt.units === result.breakEvenUnits
                            ? "bg-[#2FE3A6]/20 border border-[#2FE3A6]/40 text-white font-semibold"
                            : "bg-[#021A14]"
                        }`}
                      >
                        <span>{pt.units} units</span>
                        <span>Rev: {currency} {pt.revenue.toFixed(0)}</span>
                        <span className={pt.profit >= 0 ? "text-[#2FE3A6]" : "text-red-300"}>
                          {pt.profit >= 0 ? "+" : ""}{currency} {pt.profit.toFixed(0)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

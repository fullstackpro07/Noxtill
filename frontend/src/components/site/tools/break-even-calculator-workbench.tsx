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

    const timer = setTimeout(() => {
      calculateBreakEvenApi(input).then(setResult);
    }, 350);
    return () => clearTimeout(timer);
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
        <div className="rounded-[16px] border border-[#E1E8E4] bg-white p-6 shadow-[0_1px_2px_rgba(16,32,26,.04),0_6px_20px_rgba(16,32,26,.05)] space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[#3E4B45] mb-1.5 block text-[13px] font-semibold">
                Total Fixed Costs ({period}ly)
              </label>
              <input
                type="number"
                min="0"
                step="10"
                value={fixedCosts}
                onChange={(e) => setFixedCosts(parseFloat(e.target.value) || 0)}
                className="w-full bg-white border border-[#D5DED9] rounded-[12px] px-3.5 py-2.5 text-sm text-[#10201A] focus:outline-none focus:border-[#0FA45B] focus:ring-[3px] focus:ring-[#0FA45B]/15 placeholder:text-[#9AA7A1]"
              />
              <span className="text-[11px] text-[#6B7A72] mt-1 block">Rent, salaries, software, insurance</span>
            </div>

            <div>
              <label className="text-[#3E4B45] mb-1.5 block text-[13px] font-semibold">
                Time Horizon
              </label>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as "month" | "year" | "quarter")}
                className="w-full bg-white border border-[#D5DED9] rounded-[12px] px-3.5 py-2.5 text-sm text-[#10201A] focus:outline-none focus:border-[#0FA45B] focus:ring-[3px] focus:ring-[#0FA45B]/15 placeholder:text-[#9AA7A1]"
              >
                <option value="month">Monthly</option>
                <option value="quarter">Quarterly</option>
                <option value="year">Annual</option>
              </select>
            </div>
          </div>

          <div className="pt-2 border-t border-[#EEF2EF] grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[#3E4B45] mb-1.5 block text-[13px] font-semibold">
                Unit Selling Price
              </label>
              <input
                type="number"
                min="0.01"
                step="0.5"
                value={unitPrice}
                onChange={(e) => setUnitPrice(parseFloat(e.target.value) || 0.01)}
                className="w-full bg-white border border-[#D5DED9] rounded-[12px] px-3.5 py-2.5 text-sm text-[#10201A] focus:outline-none focus:border-[#0FA45B] focus:ring-[3px] focus:ring-[#0FA45B]/15 placeholder:text-[#9AA7A1]"
              />
            </div>

            <div>
              <label className="text-[#3E4B45] mb-1.5 block text-[13px] font-semibold">
                Variable Cost Per Unit
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={variableCost}
                onChange={(e) => setVariableCost(parseFloat(e.target.value) || 0)}
                className="w-full bg-white border border-[#D5DED9] rounded-[12px] px-3.5 py-2.5 text-sm text-[#10201A] focus:outline-none focus:border-[#0FA45B] focus:ring-[3px] focus:ring-[#0FA45B]/15 placeholder:text-[#9AA7A1]"
              />
              <span className="text-[11px] text-[#6B7A72] mt-1 block">Materials, shipping, unit labor</span>
            </div>
          </div>

          <div className="pt-2 border-t border-[#EEF2EF] grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[#3E4B45] mb-1.5 block text-[13px] font-semibold">
                Target Profit Goal ({period}ly)
              </label>
              <input
                type="number"
                min="0"
                step="50"
                value={targetProfit}
                onChange={(e) => setTargetProfit(parseFloat(e.target.value) || 0)}
                className="w-full bg-white border border-[#D5DED9] rounded-[12px] px-3.5 py-2.5 text-sm text-[#10201A] focus:outline-none focus:border-[#0FA45B] focus:ring-[3px] focus:ring-[#0FA45B]/15 placeholder:text-[#9AA7A1]"
              />
            </div>

            <div>
              <label className="text-[#3E4B45] mb-1.5 block text-[13px] font-semibold">
                Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full bg-white border border-[#D5DED9] rounded-[12px] px-3.5 py-2.5 text-sm text-[#10201A] focus:outline-none focus:border-[#0FA45B] focus:ring-[3px] focus:ring-[#0FA45B]/15 placeholder:text-[#9AA7A1]"
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
        <div className="rounded-[16px] border border-[#CFE3D7] bg-white p-6 shadow-[0_1px_2px_rgba(16,32,26,.04),0_10px_30px_rgba(16,32,26,.07)] relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[14px] font-bold text-[#10201A]">
              Break-Even Targets
            </span>
            {result?.possible && (
              <button
                type="button"
                onClick={copySummary}
                className="p-1.5 rounded-[10px] border border-[#D5DED9] text-[#0B8A4C] hover:bg-[#EAF6EF] transition-colors text-xs inline-flex items-center gap-1"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            )}
          </div>

          {result && !result.possible && (
            <div className="p-4 rounded-[12px] bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
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
                <div className="p-4 rounded-[12px] bg-white border border-[#CFE3D7]">
                  <div className="text-xs text-[#6B7A72] uppercase font-semibold">Break-Even Volume</div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-[#0B8A4C] mt-0.5">
                    {result.breakEvenUnits} <span className="text-sm font-normal text-[#10201A]">units</span>
                  </div>
                  <div className="text-[11px] text-[#5B6B63] mt-1">To cover fixed costs</div>
                </div>

                <div className="p-4 rounded-[12px] bg-white border border-[#CFE3D7]">
                  <div className="text-xs text-[#6B7A72] uppercase font-semibold">Threshold Revenue</div>
                  <div className="text-xl sm:text-2xl font-extrabold text-[#10201A] mt-0.5">
                    {currency} {result.breakEvenRevenue?.toFixed(2)}
                  </div>
                  <div className="text-[11px] text-[#5B6B63] mt-1">Gross sales required</div>
                </div>
              </div>

              {/* Target Profit Volume */}
              {result.targetProfitUnits != null && targetProfit > 0 && (
                <div className="p-3.5 rounded-[12px] bg-[#F1F9F5] border border-[#E1E8E4] flex items-center justify-between mb-4">
                  <div>
                    <span className="text-xs text-[#6B7A72] block">To Earn {currency} {targetProfit} Profit:</span>
                    <span className="text-sm font-bold text-[#10201A]">
                      {result.targetProfitUnits} units ({currency} {result.targetProfitRevenue?.toFixed(2)})
                    </span>
                  </div>
                  <TrendingUp className="w-5 h-5 text-[#0B8A4C]" />
                </div>
              )}

              {/* Unit Contribution Details */}
              <div className="space-y-2 text-sm text-[#3E4B45] border-t border-[#EEF2EF] pt-3">
                <div className="flex justify-between py-1">
                  <span>Unit Contribution Margin</span>
                  <span className="text-[#10201A] font-medium">
                    {currency} {result.contributionMargin.toFixed(2)} / unit
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span>Contribution Margin Ratio</span>
                  <span className="text-[#0B8A4C] font-medium">
                    {(result.contributionMarginRatio * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Small scenario progress table */}
              {result.chartSeries.length > 0 && (
                <div className="mt-5 pt-4 border-t border-[#E6ECE8]">
                  <div className="text-xs font-semibold text-[#6B7A72] uppercase mb-2 flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5 text-[#0B8A4C]" /> Scale Sensitivity Points
                  </div>
                  <div className="space-y-1 text-xs text-[#3E4B45] max-h-40 overflow-y-auto pr-1">
                    {result.chartSeries.slice(0, 5).map((pt, idx) => (
                      <div
                        key={idx}
                        className={`flex justify-between py-1 px-2 rounded ${
                          pt.units === result.breakEvenUnits
                            ? "bg-[#E3F4EA] border border-[#BFE3CE] text-[#10201A] font-semibold"
                            : "bg-white"
                        }`}
                      >
                        <span>{pt.units} units</span>
                        <span>Rev: {currency} {pt.revenue.toFixed(0)}</span>
                        <span className={pt.profit >= 0 ? "text-[#0B8A4C]" : "text-red-300"}>
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

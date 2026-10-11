"use client";

import { useEffect, useState } from "react";
import { calculateMarginApi, type MarginInput, type MarginResult } from "@/lib/tools-api";
import { Copy, Check, DollarSign } from "lucide-react";

export function ProfitMarginCalculatorWorkbench() {
  const [salePrice, setSalePrice] = useState<number>(100);
  const [cogs, setCogs] = useState<number>(45);
  const [labor, setLabor] = useState<number>(12);
  const [overhead, setOverhead] = useState<number>(8);
  const [feePercent, setFeePercent] = useState<number>(2.9);
  const [targetMargin, setTargetMargin] = useState<number>(40);
  const [currency, setCurrency] = useState<string>("USD");
  const [copied, setCopied] = useState<boolean>(false);

  const [result, setResult] = useState<MarginResult | null>(null);

  useEffect(() => {
    const input: MarginInput = {
      salePrice: Math.max(0, salePrice || 0),
      costOfGoods: Math.max(0, cogs || 0),
      laborCost: Math.max(0, labor || 0),
      overheadCost: Math.max(0, overhead || 0),
      paymentFeePercent: feePercent,
      targetGrossMargin: targetMargin,
      currency,
    };

    calculateMarginApi(input).then(setResult);
  }, [salePrice, cogs, labor, overhead, feePercent, targetMargin, currency]);

  const copySummary = () => {
    if (!result) return;
    const summary = `Unit Profit & Margin Analysis:
Sale Price: ${result.currency} ${result.salePrice.toFixed(2)}
Total Direct Cost: ${result.currency} ${result.directCost.toFixed(2)} (COGS: ${result.costOfGoods.toFixed(2)}, Labor: ${result.laborCost.toFixed(2)}, Overhead: ${result.overheadCost.toFixed(2)})
Processing Fee: ${result.currency} ${result.processingFee.toFixed(2)}
Net Profit Per Sale: ${result.currency} ${result.profitDollar.toFixed(2)}
Gross Profit Margin: ${result.grossMarginPct}%
Markup on Cost: ${result.markupPct}%
${result.targetPrice ? `Target Price for ${targetMargin}% Margin: ${result.currency} ${result.targetPrice.toFixed(2)}\n` : ""}Break-Even Price: ${result.currency} ${result.breakEvenPrice.toFixed(2)}`;

    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const applyPreset = (preset: { price: number; cogs: number; labor: number; overhead: number; target: number }) => {
    setSalePrice(preset.price);
    setCogs(preset.cogs);
    setLabor(preset.labor);
    setOverhead(preset.overhead);
    setTargetMargin(preset.target);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Left Column: Form */}
      <div className="lg:col-span-7 space-y-6">
        {/* Presets */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[#8EAEA0] font-medium mr-1">Presets:</span>
          <button
            type="button"
            onClick={() => applyPreset({ price: 45, cogs: 12, labor: 10, overhead: 5, target: 45 })}
            className="text-xs px-2.5 py-1 rounded-lg bg-[#042A20] border border-[#2FE3A6]/20 text-[#C9DCD2] hover:border-[#2FE3A6] transition-colors"
          >
            Salon & Grooming Service
          </button>
          <button
            type="button"
            onClick={() => applyPreset({ price: 85, cogs: 32, labor: 8, overhead: 7, target: 50 })}
            className="text-xs px-2.5 py-1 rounded-lg bg-[#042A20] border border-[#2FE3A6]/20 text-[#C9DCD2] hover:border-[#2FE3A6] transition-colors"
          >
            Retail Boutique Item
          </button>
          <button
            type="button"
            onClick={() => applyPreset({ price: 180, cogs: 45, labor: 55, overhead: 20, target: 35 })}
            className="text-xs px-2.5 py-1 rounded-lg bg-[#042A20] border border-[#2FE3A6]/20 text-[#C9DCD2] hover:border-[#2FE3A6] transition-colors"
          >
            Trade / Field Job
          </button>
        </div>

        {/* Form Container */}
        <div className="rounded-2xl border border-[#2FE3A6]/20 bg-[#032019]/70 p-6 backdrop-blur-sm shadow-xl space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                Current Selling Price
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={salePrice}
                onChange={(e) => setSalePrice(parseFloat(e.target.value) || 0)}
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

          <div className="pt-2 border-t border-white/5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                COGS / Materials
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={cogs}
                onChange={(e) => setCogs(parseFloat(e.target.value) || 0)}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#2FE3A6]"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                Direct Labor Cost
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={labor}
                onChange={(e) => setLabor(parseFloat(e.target.value) || 0)}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#2FE3A6]"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                Allocated Overhead
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={overhead}
                onChange={(e) => setOverhead(parseFloat(e.target.value) || 0)}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#2FE3A6]"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-white/5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                Payment Processing Fee (%)
              </label>
              <input
                type="number"
                min="0"
                max="20"
                step="0.1"
                value={feePercent}
                onChange={(e) => setFeePercent(parseFloat(e.target.value) || 0)}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#2FE3A6]"
              />
              <span className="text-[11px] text-[#7E9F91] mt-1 block">Standard card rates: 2.6% - 2.9%</span>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                Target Margin Goal (%)
              </label>
              <input
                type="number"
                min="1"
                max="95"
                step="1"
                value={targetMargin}
                onChange={(e) => setTargetMargin(parseFloat(e.target.value) || 0)}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#2FE3A6]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Live Output & Comparisons */}
      <div className="lg:col-span-5 space-y-5">
        <div className="rounded-2xl border border-[#2FE3A6]/30 bg-[#032019]/90 p-6 backdrop-blur-md shadow-2xl relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-[#2EE6B0]">
              Margin & Markup Breakdown
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

          {result && (
            <>
              {/* Primary Dual Stats */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="p-4 rounded-xl bg-[#021A14] border border-[#2FE3A6]/30">
                  <div className="text-xs text-[#8EAEA0] uppercase font-semibold">Gross Margin</div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-[#2FE3A6] mt-0.5">
                    {result.grossMarginPct}%
                  </div>
                  <div className="text-[11px] text-[#A3C6B8] mt-1">Share of revenue retained</div>
                </div>

                <div className="p-4 rounded-xl bg-[#021A14] border border-[#2FE3A6]/30">
                  <div className="text-xs text-[#8EAEA0] uppercase font-semibold">Markup Rate</div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-white mt-0.5">
                    {result.markupPct}%
                  </div>
                  <div className="text-[11px] text-[#A3C6B8] mt-1">Percentage added on cost</div>
                </div>
              </div>

              {/* Profit Dollars Highlight */}
              <div className="p-3.5 rounded-xl bg-[#042D22] border border-[#2FE3A6]/20 flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <DollarSign className="w-4 h-4 text-[#2FE3A6]" />
                  <span className="text-sm font-medium text-white">Net Profit Per Sale:</span>
                </div>
                <span className="text-lg font-bold text-[#2FE3A6]">
                  {currency} {result.profitDollar.toFixed(2)}
                </span>
              </div>

              {/* Cost Rows */}
              <div className="space-y-2 text-sm text-[#B8CFC5] border-t border-white/5 pt-3">
                <div className="flex justify-between py-1">
                  <span>Direct Costs (COGS + Labor + Overhead)</span>
                  <span className="text-white font-medium">{currency} {result.directCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>Payment Fee ({feePercent}%)</span>
                  <span className="text-white font-medium">{currency} {result.processingFee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>Break-Even Price (Zero Profit)</span>
                  <span className="text-white font-medium">{currency} {result.breakEvenPrice.toFixed(2)}</span>
                </div>
                {result.targetPrice && (
                  <div className="flex justify-between py-2 border-t border-[#2FE3A6]/20 text-[#2FE3A6] font-semibold">
                    <span>Required Price for {targetMargin}% Margin</span>
                    <span>{currency} {result.targetPrice.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

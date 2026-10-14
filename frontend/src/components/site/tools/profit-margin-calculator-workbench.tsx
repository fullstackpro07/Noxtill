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

    const timer = setTimeout(() => {
      calculateMarginApi(input).then(setResult);
    }, 350);
    return () => clearTimeout(timer);
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
          <span className="text-xs text-[#6B7A72] font-medium mr-1">Presets:</span>
          <button
            type="button"
            onClick={() => applyPreset({ price: 45, cogs: 12, labor: 10, overhead: 5, target: 45 })}
            className="text-xs px-2.5 py-1 rounded-[10px] bg-[#F7FAF8] border border-[#E1E8E4] text-[#3E4B45] hover:border-[#0FA45B] transition-colors"
          >
            Salon & Grooming Service
          </button>
          <button
            type="button"
            onClick={() => applyPreset({ price: 85, cogs: 32, labor: 8, overhead: 7, target: 50 })}
            className="text-xs px-2.5 py-1 rounded-[10px] bg-[#F7FAF8] border border-[#E1E8E4] text-[#3E4B45] hover:border-[#0FA45B] transition-colors"
          >
            Retail Boutique Item
          </button>
          <button
            type="button"
            onClick={() => applyPreset({ price: 180, cogs: 45, labor: 55, overhead: 20, target: 35 })}
            className="text-xs px-2.5 py-1 rounded-[10px] bg-[#F7FAF8] border border-[#E1E8E4] text-[#3E4B45] hover:border-[#0FA45B] transition-colors"
          >
            Trade / Field Job
          </button>
        </div>

        {/* Form Container */}
        <div className="rounded-[16px] border border-[#E1E8E4] bg-white p-6 shadow-[0_1px_2px_rgba(16,32,26,.04),0_6px_20px_rgba(16,32,26,.05)] space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[#3E4B45] mb-1.5 block text-[13px] font-semibold">
                Current Selling Price
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={salePrice}
                onChange={(e) => setSalePrice(parseFloat(e.target.value) || 0)}
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

          <div className="pt-2 border-t border-[#EEF2EF] grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-[#3E4B45] mb-1.5 block text-[13px] font-semibold">
                COGS / Materials
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={cogs}
                onChange={(e) => setCogs(parseFloat(e.target.value) || 0)}
                className="w-full bg-white border border-[#D5DED9] rounded-[12px] px-3.5 py-2.5 text-sm text-[#10201A] focus:outline-none focus:border-[#0FA45B] focus:ring-[3px] focus:ring-[#0FA45B]/15 placeholder:text-[#9AA7A1]"
              />
            </div>

            <div>
              <label className="text-[#3E4B45] mb-1.5 block text-[13px] font-semibold">
                Direct Labor Cost
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={labor}
                onChange={(e) => setLabor(parseFloat(e.target.value) || 0)}
                className="w-full bg-white border border-[#D5DED9] rounded-[12px] px-3.5 py-2.5 text-sm text-[#10201A] focus:outline-none focus:border-[#0FA45B] focus:ring-[3px] focus:ring-[#0FA45B]/15 placeholder:text-[#9AA7A1]"
              />
            </div>

            <div>
              <label className="text-[#3E4B45] mb-1.5 block text-[13px] font-semibold">
                Allocated Overhead
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={overhead}
                onChange={(e) => setOverhead(parseFloat(e.target.value) || 0)}
                className="w-full bg-white border border-[#D5DED9] rounded-[12px] px-3.5 py-2.5 text-sm text-[#10201A] focus:outline-none focus:border-[#0FA45B] focus:ring-[3px] focus:ring-[#0FA45B]/15 placeholder:text-[#9AA7A1]"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-[#EEF2EF] grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[#3E4B45] mb-1.5 block text-[13px] font-semibold">
                Payment Processing Fee (%)
              </label>
              <input
                type="number"
                min="0"
                max="20"
                step="0.1"
                value={feePercent}
                onChange={(e) => setFeePercent(parseFloat(e.target.value) || 0)}
                className="w-full bg-white border border-[#D5DED9] rounded-[12px] px-3.5 py-2.5 text-sm text-[#10201A] focus:outline-none focus:border-[#0FA45B] focus:ring-[3px] focus:ring-[#0FA45B]/15 placeholder:text-[#9AA7A1]"
              />
              <span className="text-[11px] text-[#6B7A72] mt-1 block">Standard card rates: 2.6% - 2.9%</span>
            </div>

            <div>
              <label className="text-[#3E4B45] mb-1.5 block text-[13px] font-semibold">
                Target Margin Goal (%)
              </label>
              <input
                type="number"
                min="1"
                max="95"
                step="1"
                value={targetMargin}
                onChange={(e) => setTargetMargin(parseFloat(e.target.value) || 0)}
                className="w-full bg-white border border-[#D5DED9] rounded-[12px] px-3.5 py-2.5 text-sm text-[#10201A] focus:outline-none focus:border-[#0FA45B] focus:ring-[3px] focus:ring-[#0FA45B]/15 placeholder:text-[#9AA7A1]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Live Output & Comparisons */}
      <div className="lg:col-span-5 space-y-5">
        <div className="rounded-[16px] border border-[#CFE3D7] bg-white p-6 shadow-[0_1px_2px_rgba(16,32,26,.04),0_10px_30px_rgba(16,32,26,.07)] relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[14px] font-bold text-[#10201A]">
              Margin & Markup Breakdown
            </span>
            <button
              type="button"
              onClick={copySummary}
              className="p-1.5 rounded-[10px] border border-[#D5DED9] text-[#0B8A4C] hover:bg-[#EAF6EF] transition-colors text-xs inline-flex items-center gap-1"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>

          {result && (
            <>
              {/* Primary Dual Stats */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="p-4 rounded-[12px] bg-white border border-[#CFE3D7]">
                  <div className="text-xs text-[#6B7A72] uppercase font-semibold">Gross Margin</div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-[#0B8A4C] mt-0.5">
                    {result.grossMarginPct}%
                  </div>
                  <div className="text-[11px] text-[#5B6B63] mt-1">Share of revenue retained</div>
                </div>

                <div className="p-4 rounded-[12px] bg-white border border-[#CFE3D7]">
                  <div className="text-xs text-[#6B7A72] uppercase font-semibold">Markup Rate</div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-[#10201A] mt-0.5">
                    {result.markupPct}%
                  </div>
                  <div className="text-[11px] text-[#5B6B63] mt-1">Percentage added on cost</div>
                </div>
              </div>

              {/* Profit Dollars Highlight */}
              <div className="p-3.5 rounded-[12px] bg-[#F1F9F5] border border-[#E1E8E4] flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <DollarSign className="w-4 h-4 text-[#0B8A4C]" />
                  <span className="text-sm font-medium text-[#10201A]">Net Profit Per Sale:</span>
                </div>
                <span className="text-lg font-bold text-[#0B8A4C]">
                  {currency} {result.profitDollar.toFixed(2)}
                </span>
              </div>

              {/* Cost Rows */}
              <div className="space-y-2 text-sm text-[#3E4B45] border-t border-[#EEF2EF] pt-3">
                <div className="flex justify-between py-1">
                  <span>Direct Costs (COGS + Labor + Overhead)</span>
                  <span className="text-[#10201A] font-medium">{currency} {result.directCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>Payment Fee ({feePercent}%)</span>
                  <span className="text-[#10201A] font-medium">{currency} {result.processingFee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>Break-Even Price (Zero Profit)</span>
                  <span className="text-[#10201A] font-medium">{currency} {result.breakEvenPrice.toFixed(2)}</span>
                </div>
                {result.targetPrice && (
                  <div className="flex justify-between py-2 border-t border-[#E1E8E4] text-[#0B8A4C] font-semibold">
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

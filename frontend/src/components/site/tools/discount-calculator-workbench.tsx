"use client";

import { useEffect, useState } from "react";
import { calculateDiscountApi, type DiscountInput, type DiscountResult } from "@/lib/tools-api";
import { Copy, Check, Percent, Tag, Layers } from "lucide-react";

export function DiscountCalculatorWorkbench() {
  const [unitPrice, setUnitPrice] = useState<number>(100);
  const [quantity, setQuantity] = useState<number>(1);
  const [currency, setCurrency] = useState<string>("USD");
  const [mode, setMode] = useState<"percent" | "fixed" | "stacked">("percent");
  const [percent, setPercent] = useState<number>(20);
  const [fixedAmount, setFixedAmount] = useState<number>(15);
  const [stackedText, setStackedText] = useState<string>("20, 10");
  const [taxMode, setTaxMode] = useState<"none" | "exclusive" | "inclusive">("none");
  const [taxPercent, setTaxPercent] = useState<number>(8.25);
  const [copied, setCopied] = useState<boolean>(false);

  const [result, setResult] = useState<DiscountResult | null>(null);

  useEffect(() => {
    const stackedList = stackedText
      .split(",")
      .map((s) => parseFloat(s.trim()))
      .filter((n) => !isNaN(n) && n >= 0);

    const input: DiscountInput = {
      originalUnitPrice: Math.max(0, unitPrice || 0),
      quantity: Math.max(1, quantity || 1),
      currency,
      discountMode: mode,
      discountPercent: percent,
      discountAmount: fixedAmount,
      stackedDiscounts: stackedList,
      taxMode,
      taxPercent,
    };

    const timer = setTimeout(() => {
      calculateDiscountApi(input).then(setResult);
    }, 350);
    return () => clearTimeout(timer);
  }, [unitPrice, quantity, currency, mode, percent, fixedAmount, stackedText, taxMode, taxPercent]);

  const copySummary = () => {
    if (!result) return;
    const summary = `Discount Breakdown:
Original: ${result.currency} ${result.gross.toFixed(2)} (${result.quantity} items @ ${result.unitPrice.toFixed(2)})
Discount: -${result.currency} ${result.totalDiscount.toFixed(2)} (${result.savingsPct}% saved)
Net Price: ${result.currency} ${result.net.toFixed(2)}
${result.tax > 0 ? `Tax (${taxMode}): +${result.currency} ${result.tax.toFixed(2)}\n` : ""}Final Total: ${result.currency} ${result.finalTotal.toFixed(2)}`;
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const applyPreset = (preset: {
    price: number;
    qty: number;
    mode: "percent" | "fixed" | "stacked";
    pct?: number;
    fixed?: number;
    stacked?: string;
    tax?: "none" | "exclusive" | "inclusive";
  }) => {
    setUnitPrice(preset.price);
    setQuantity(preset.qty);
    setMode(preset.mode);
    if (preset.pct != null) setPercent(preset.pct);
    if (preset.fixed != null) setFixedAmount(preset.fixed);
    if (preset.stacked != null) setStackedText(preset.stacked);
    if (preset.tax != null) setTaxMode(preset.tax);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Left Column: Form & Presets */}
      <div className="lg:col-span-7 space-y-6">
        {/* Quick Presets */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[#6B7A72] font-medium mr-1">Quick Presets:</span>
          <button
            type="button"
            onClick={() => applyPreset({ price: 79.99, qty: 1, mode: "percent", pct: 25 })}
            className="text-xs px-2.5 py-1 rounded-[10px] bg-[#F7FAF8] border border-[#E1E8E4] text-[#3E4B45] hover:border-[#0FA45B] transition-colors"
          >
            25% Off Flash Sale
          </button>
          <button
            type="button"
            onClick={() => applyPreset({ price: 120, qty: 1, mode: "stacked", stacked: "30, 10" })}
            className="text-xs px-2.5 py-1 rounded-[10px] bg-[#F7FAF8] border border-[#E1E8E4] text-[#3E4B45] hover:border-[#0FA45B] transition-colors"
          >
            Stacked 30% + 10%
          </button>
          <button
            type="button"
            onClick={() => applyPreset({ price: 50, qty: 3, mode: "fixed", fixed: 20, tax: "exclusive" })}
            className="text-xs px-2.5 py-1 rounded-[10px] bg-[#F7FAF8] border border-[#E1E8E4] text-[#3E4B45] hover:border-[#0FA45B] transition-colors"
          >
            $20 Off 3 Items + Tax
          </button>
        </div>

        {/* Input Card */}
        <div className="rounded-[16px] border border-[#E1E8E4] bg-white p-6 shadow-[0_1px_2px_rgba(16,32,26,.04),0_6px_20px_rgba(16,32,26,.05)] space-y-5">
          {/* Price & Quantity & Currency */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-[#3E4B45] mb-1.5 block text-[13px] font-semibold">
                Original Price
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white border border-[#D5DED9] rounded-[12px] px-3.5 py-2.5 text-sm text-[#10201A] focus:outline-none focus:border-[#0FA45B] focus:ring-[3px] focus:ring-[#0FA45B]/15 placeholder:text-[#9AA7A1]"
                />
              </div>
            </div>

            <div>
              <label className="text-[#3E4B45] mb-1.5 block text-[13px] font-semibold">
                Quantity
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
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

          {/* Discount Mode Tabs */}
          <div>
            <label className="text-[#3E4B45] mb-2 block text-[13px] font-semibold">
              Discount Type
            </label>
            <div className="grid grid-cols-3 gap-2 p-1 bg-white border border-[#E1E8E4] rounded-[12px]">
              <button
                type="button"
                onClick={() => setMode("percent")}
                className={`py-2 px-3 text-xs font-semibold rounded-[10px] flex items-center justify-center gap-1.5 transition-all ${
                  mode === "percent"
                    ? "bg-[#0FA45B] text-white shadow-sm"
                    : "text-[#3E4B45] hover:text-[#10201A]"
                }`}
              >
                <Percent className="w-3.5 h-3.5" /> Percentage
              </button>
              <button
                type="button"
                onClick={() => setMode("fixed")}
                className={`py-2 px-3 text-xs font-semibold rounded-[10px] flex items-center justify-center gap-1.5 transition-all ${
                  mode === "fixed"
                    ? "bg-[#0FA45B] text-white shadow-sm"
                    : "text-[#3E4B45] hover:text-[#10201A]"
                }`}
              >
                <Tag className="w-3.5 h-3.5" /> Fixed Amount
              </button>
              <button
                type="button"
                onClick={() => setMode("stacked")}
                className={`py-2 px-3 text-xs font-semibold rounded-[10px] flex items-center justify-center gap-1.5 transition-all ${
                  mode === "stacked"
                    ? "bg-[#0FA45B] text-white shadow-sm"
                    : "text-[#3E4B45] hover:text-[#10201A]"
                }`}
              >
                <Layers className="w-3.5 h-3.5" /> Stacked %
              </button>
            </div>
          </div>

          {/* Discount Mode Values */}
          {mode === "percent" && (
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-[#3E4B45] text-[13px] font-semibold">
                  Discount Percentage
                </label>
                <span className="text-sm font-bold text-[#0B8A4C]">{percent}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="99"
                step="1"
                value={percent}
                onChange={(e) => setPercent(parseFloat(e.target.value) || 0)}
                className="w-full accent-[#0FA45B] cursor-pointer"
              />
            </div>
          )}

          {mode === "fixed" && (
            <div>
              <label className="text-[#3E4B45] mb-1.5 block text-[13px] font-semibold">
                Total Fixed Discount Amount ({currency})
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={fixedAmount}
                onChange={(e) => setFixedAmount(parseFloat(e.target.value) || 0)}
                className="w-full bg-white border border-[#D5DED9] rounded-[12px] px-3.5 py-2.5 text-sm text-[#10201A] focus:outline-none focus:border-[#0FA45B] focus:ring-[3px] focus:ring-[#0FA45B]/15 placeholder:text-[#9AA7A1]"
              />
            </div>
          )}

          {mode === "stacked" && (
            <div>
              <label className="text-[#3E4B45] mb-1.5 block text-[13px] font-semibold">
                Sequential Discount Percentages (comma separated)
              </label>
              <input
                type="text"
                value={stackedText}
                onChange={(e) => setStackedText(e.target.value)}
                placeholder="e.g. 25, 10, 5"
                className="w-full bg-white border border-[#D5DED9] rounded-[12px] px-3.5 py-2.5 text-sm text-[#10201A] focus:outline-none focus:border-[#0FA45B] focus:ring-[3px] focus:ring-[#0FA45B]/15 placeholder:text-[#9AA7A1]"
              />
              <p className="text-xs text-[#6B7A72] mt-1">
                Each discount step applies sequentially to the reduced balance, avoiding erroneous additive math.
              </p>
            </div>
          )}

          {/* Tax Options */}
          <div className="pt-4 border-t border-[#E6ECE8] grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[#3E4B45] mb-1.5 block text-[13px] font-semibold">
                Tax Mode
              </label>
              <select
                value={taxMode}
                onChange={(e) => setTaxMode(e.target.value as "none" | "exclusive" | "inclusive")}
                className="w-full bg-white border border-[#D5DED9] rounded-[12px] px-3.5 py-2.5 text-sm text-[#10201A] focus:outline-none focus:border-[#0FA45B] focus:ring-[3px] focus:ring-[#0FA45B]/15 placeholder:text-[#9AA7A1]"
              >
                <option value="none">No Tax</option>
                <option value="exclusive">Tax Added (Exclusive)</option>
                <option value="inclusive">Tax Included in Net (Inclusive)</option>
              </select>
            </div>

            {taxMode !== "none" && (
              <div>
                <label className="text-[#3E4B45] mb-1.5 block text-[13px] font-semibold">
                  Tax Rate (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={taxPercent}
                  onChange={(e) => setTaxPercent(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white border border-[#D5DED9] rounded-[12px] px-3.5 py-2.5 text-sm text-[#10201A] focus:outline-none focus:border-[#0FA45B] focus:ring-[3px] focus:ring-[#0FA45B]/15 placeholder:text-[#9AA7A1]"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Live Output & Step Breakdown */}
      <div className="lg:col-span-5 space-y-5">
        <div className="rounded-[16px] border border-[#CFE3D7] bg-white p-6 shadow-[0_1px_2px_rgba(16,32,26,.04),0_10px_30px_rgba(16,32,26,.07)] relative overflow-hidden">

          <div className="flex items-center justify-between mb-4">
            <span className="text-[14px] font-bold text-[#10201A]">
              Calculated Result
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={copySummary}
                className="p-1.5 rounded-[10px] border border-[#D5DED9] text-[#0B8A4C] hover:bg-[#EAF6EF] transition-colors text-xs inline-flex items-center gap-1"
                title="Copy breakdown"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>
          </div>

          {result && (
            <>
              {/* Highlight Total Card */}
              <div className="p-4 rounded-[12px] bg-white border border-[#CFE3D7] mb-5">
                <div className="text-xs text-[#6B7A72] uppercase font-semibold">Final Customer Pays</div>
                <div className="text-3xl sm:text-4xl font-extrabold text-[#0B8A4C] mt-0.5 tracking-tight">
                  {currency} {result.finalTotal.toFixed(2)}
                </div>
                <div className="text-xs text-[#5B6B63] mt-1">
                  You save <strong className="text-[#10201A]">{currency} {result.totalDiscount.toFixed(2)}</strong> ({result.savingsPct}% reduction)
                </div>
              </div>

              {/* Metric Breakdown Table */}
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between py-1.5 border-b border-[#EEF2EF] text-[#3E4B45]">
                  <span>Original Gross</span>
                  <span className="font-semibold text-[#10201A]">
                    {currency} {result.gross.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[#EEF2EF] text-[#3E4B45]">
                  <span>Discount Total</span>
                  <span className="font-semibold text-[#0B8A4C]">
                    -{currency} {result.totalDiscount.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[#EEF2EF] text-[#3E4B45]">
                  <span>Subtotal (Net)</span>
                  <span className="font-semibold text-[#10201A]">
                    {currency} {result.net.toFixed(2)}
                  </span>
                </div>
                {result.tax > 0 && (
                  <div className="flex justify-between py-1.5 border-b border-[#EEF2EF] text-[#3E4B45]">
                    <span>
                      Tax ({taxPercent}% {taxMode})
                    </span>
                    <span className="font-semibold text-[#10201A]">
                      +{currency} {result.tax.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>

              {/* Sequential Steps if Stacked */}
              {result.steps.length > 1 && (
                <div className="mt-5 pt-4 border-t border-[#E6ECE8]">
                  <div className="text-xs font-semibold text-[#6B7A72] uppercase mb-2">
                    Sequential Deduction Path
                  </div>
                  <div className="space-y-1.5 text-xs text-[#3E4B45]">
                    {result.steps.map((s) => (
                      <div key={s.step} className="flex justify-between py-1 px-2.5 rounded bg-white">
                        <span>
                          Step {s.step} ({s.rate}% off):
                        </span>
                        <span>
                          -{currency} {s.amount.toFixed(2)} → Leaves {currency} {s.remaining.toFixed(2)}
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

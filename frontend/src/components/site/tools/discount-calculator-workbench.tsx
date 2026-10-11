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

    calculateDiscountApi(input).then(setResult);
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
          <span className="text-xs text-[#8EAEA0] font-medium mr-1">Quick Presets:</span>
          <button
            type="button"
            onClick={() => applyPreset({ price: 79.99, qty: 1, mode: "percent", pct: 25 })}
            className="text-xs px-2.5 py-1 rounded-lg bg-[#042A20] border border-[#2FE3A6]/20 text-[#C9DCD2] hover:border-[#2FE3A6] transition-colors"
          >
            25% Off Flash Sale
          </button>
          <button
            type="button"
            onClick={() => applyPreset({ price: 120, qty: 1, mode: "stacked", stacked: "30, 10" })}
            className="text-xs px-2.5 py-1 rounded-lg bg-[#042A20] border border-[#2FE3A6]/20 text-[#C9DCD2] hover:border-[#2FE3A6] transition-colors"
          >
            Stacked 30% + 10%
          </button>
          <button
            type="button"
            onClick={() => applyPreset({ price: 50, qty: 3, mode: "fixed", fixed: 20, tax: "exclusive" })}
            className="text-xs px-2.5 py-1 rounded-lg bg-[#042A20] border border-[#2FE3A6]/20 text-[#C9DCD2] hover:border-[#2FE3A6] transition-colors"
          >
            $20 Off 3 Items + Tax
          </button>
        </div>

        {/* Input Card */}
        <div className="rounded-2xl border border-[#2FE3A6]/20 bg-[#032019]/70 p-6 backdrop-blur-sm shadow-xl space-y-5">
          {/* Price & Quantity & Currency */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                Original Price
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#2FE3A6]"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                Quantity
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
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

          {/* Discount Mode Tabs */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-2 block">
              Discount Type
            </label>
            <div className="grid grid-cols-3 gap-2 p-1 bg-[#021A14] border border-[#2FE3A6]/20 rounded-xl">
              <button
                type="button"
                onClick={() => setMode("percent")}
                className={`py-2 px-3 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  mode === "percent"
                    ? "bg-[#2FE3A6] text-[#032019] shadow-sm"
                    : "text-[#B8CFC5] hover:text-white"
                }`}
              >
                <Percent className="w-3.5 h-3.5" /> Percentage
              </button>
              <button
                type="button"
                onClick={() => setMode("fixed")}
                className={`py-2 px-3 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  mode === "fixed"
                    ? "bg-[#2FE3A6] text-[#032019] shadow-sm"
                    : "text-[#B8CFC5] hover:text-white"
                }`}
              >
                <Tag className="w-3.5 h-3.5" /> Fixed Amount
              </button>
              <button
                type="button"
                onClick={() => setMode("stacked")}
                className={`py-2 px-3 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  mode === "stacked"
                    ? "bg-[#2FE3A6] text-[#032019] shadow-sm"
                    : "text-[#B8CFC5] hover:text-white"
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
                <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0]">
                  Discount Percentage
                </label>
                <span className="text-sm font-bold text-[#2FE3A6]">{percent}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="99"
                step="1"
                value={percent}
                onChange={(e) => setPercent(parseFloat(e.target.value) || 0)}
                className="w-full accent-[#2FE3A6] cursor-pointer"
              />
            </div>
          )}

          {mode === "fixed" && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                Total Fixed Discount Amount ({currency})
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={fixedAmount}
                onChange={(e) => setFixedAmount(parseFloat(e.target.value) || 0)}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#2FE3A6]"
              />
            </div>
          )}

          {mode === "stacked" && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                Sequential Discount Percentages (comma separated)
              </label>
              <input
                type="text"
                value={stackedText}
                onChange={(e) => setStackedText(e.target.value)}
                placeholder="e.g. 25, 10, 5"
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#2FE3A6]"
              />
              <p className="text-xs text-[#8EAEA0] mt-1">
                Each discount step applies sequentially to the reduced balance, avoiding erroneous additive math.
              </p>
            </div>
          )}

          {/* Tax Options */}
          <div className="pt-4 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                Tax Mode
              </label>
              <select
                value={taxMode}
                onChange={(e) => setTaxMode(e.target.value as "none" | "exclusive" | "inclusive")}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#2FE3A6]"
              >
                <option value="none">No Tax</option>
                <option value="exclusive">Tax Added (Exclusive)</option>
                <option value="inclusive">Tax Included in Net (Inclusive)</option>
              </select>
            </div>

            {taxMode !== "none" && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                  Tax Rate (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={taxPercent}
                  onChange={(e) => setTaxPercent(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#2FE3A6]"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Live Output & Step Breakdown */}
      <div className="lg:col-span-5 space-y-5">
        <div className="rounded-2xl border border-[#2FE3A6]/30 bg-[#032019]/90 p-6 backdrop-blur-md shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-[#2FE3A6]/10 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-[#2EE6B0]">
              Calculated Result
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={copySummary}
                className="p-1.5 rounded-lg border border-[#2FE3A6]/25 text-[#2FE3A6] hover:bg-[#2FE3A6]/15 transition-colors text-xs inline-flex items-center gap-1"
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
              <div className="p-4 rounded-xl bg-[#021A14] border border-[#2FE3A6]/30 mb-5">
                <div className="text-xs text-[#8EAEA0] uppercase font-semibold">Final Customer Pays</div>
                <div className="text-3xl sm:text-4xl font-extrabold text-[#2FE3A6] mt-0.5 tracking-tight">
                  {currency} {result.finalTotal.toFixed(2)}
                </div>
                <div className="text-xs text-[#A3C6B8] mt-1">
                  You save <strong className="text-white">{currency} {result.totalDiscount.toFixed(2)}</strong> ({result.savingsPct}% reduction)
                </div>
              </div>

              {/* Metric Breakdown Table */}
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between py-1.5 border-b border-white/5 text-[#B8CFC5]">
                  <span>Original Gross</span>
                  <span className="font-semibold text-white">
                    {currency} {result.gross.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-white/5 text-[#B8CFC5]">
                  <span>Discount Total</span>
                  <span className="font-semibold text-[#2FE3A6]">
                    -{currency} {result.totalDiscount.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-white/5 text-[#B8CFC5]">
                  <span>Subtotal (Net)</span>
                  <span className="font-semibold text-white">
                    {currency} {result.net.toFixed(2)}
                  </span>
                </div>
                {result.tax > 0 && (
                  <div className="flex justify-between py-1.5 border-b border-white/5 text-[#B8CFC5]">
                    <span>
                      Tax ({taxPercent}% {taxMode})
                    </span>
                    <span className="font-semibold text-white">
                      +{currency} {result.tax.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>

              {/* Sequential Steps if Stacked */}
              {result.steps.length > 1 && (
                <div className="mt-5 pt-4 border-t border-white/10">
                  <div className="text-xs font-semibold text-[#8EAEA0] uppercase mb-2">
                    Sequential Deduction Path
                  </div>
                  <div className="space-y-1.5 text-xs text-[#C9DCD2]">
                    {result.steps.map((s) => (
                      <div key={s.step} className="flex justify-between py-1 px-2.5 rounded bg-[#021A14]">
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

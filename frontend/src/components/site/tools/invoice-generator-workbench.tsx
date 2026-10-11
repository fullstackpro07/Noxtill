"use client";

import { useEffect, useState } from "react";
import { calculateInvoiceApi, type InvoiceInput, type InvoiceLineItem, type InvoiceParty, type InvoiceResult } from "@/lib/tools-api";
import { Plus, Trash2, Printer, Copy, Check, FileText } from "lucide-react";

export function InvoiceGeneratorWorkbench() {
  const [currency, setCurrency] = useState("USD");
  const [invoiceNumber, setInvoiceNumber] = useState("INV-2026-001");
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(() => new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));

  const [seller, setSeller] = useState<InvoiceParty>({
    name: "Apex Studio LLC",
    email: "billing@apexstudio.com",
    address: "100 Congress Ave, Austin, TX 78701",
    phone: "+1 (512) 555-0199",
    taxId: "US-84920192",
  });

  const [buyer, setBuyer] = useState<InvoiceParty>({
    name: "Summit Capital Group",
    email: "accounts@summitcap.com",
    address: "450 Lexington Ave, New York, NY 10017",
    phone: "+1 (212) 555-0144",
  });

  const [lines, setLines] = useState<InvoiceLineItem[]>([
    { description: "Product Strategy & Architecture Sprint", quantity: 1, unitPrice: 2800, taxPercent: 0, discountPercent: 0 },
    { description: "UI Component Library Implementation", quantity: 40, unitPrice: 75, taxPercent: 0, discountPercent: 5 },
  ]);

  const [notes, setNotes] = useState("Payment is due within 14 days of invoice date. Thank you for your partnership!");
  const [result, setResult] = useState<InvoiceResult | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const input: InvoiceInput = {
      currency,
      invoiceNumber,
      issueDate,
      dueDate,
      seller,
      buyer,
      lines,
      notes,
    };
    calculateInvoiceApi(input).then(setResult);
  }, [currency, invoiceNumber, issueDate, dueDate, seller, buyer, lines, notes]);

  const addLine = () => {
    setLines([...lines, { description: "New Item / Service", quantity: 1, unitPrice: 100, taxPercent: 0, discountPercent: 0 }]);
  };

  const removeLine = (idx: number) => {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, patch: Partial<InvoiceLineItem>) => {
    setLines(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const triggerPrint = () => {
    window.print();
  };

  const copySummary = () => {
    if (!result) return;
    const text = `Invoice #${result.invoiceNumber}
From: ${result.seller.name}
To: ${result.buyer.name}
Total Due: ${result.currency} ${result.totalAmount.toFixed(2)}
Due Date: ${result.dueDate}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-[#2FE3A6]/20 bg-[#032019]/70 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#2FE3A6]" />
          <span className="font-semibold text-white text-sm">Invoice Editor & Live Preview</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={copySummary}
            className="px-3 py-1.5 rounded-lg border border-[#2FE3A6]/25 text-xs text-[#2FE3A6] hover:bg-[#2FE3A6]/10 transition-colors inline-flex items-center gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied" : "Copy Summary"}
          </button>
          <button
            type="button"
            onClick={triggerPrint}
            className="px-4 py-1.5 rounded-lg bg-[#2FE3A6] text-[#032019] text-xs font-bold hover:bg-[#44F5C2] transition-colors inline-flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            Print / Save PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Editor Form (Left 6 cols) */}
        <div className="lg:col-span-6 space-y-6">
          {/* Metadata Card */}
          <div className="rounded-2xl border border-[#2FE3A6]/20 bg-[#032019]/70 p-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#2EE6B0]">Invoice Details</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="col-span-2">
                <label className="text-[11px] font-semibold text-[#8EAEA0] block mb-1">Invoice Number</label>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#2FE3A6]"
                />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] font-semibold text-[#8EAEA0] block mb-1">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#2FE3A6]"
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="CAD">CAD ($)</option>
                  <option value="AUD">AUD ($)</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-[11px] font-semibold text-[#8EAEA0] block mb-1">Issue Date</label>
                <input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#2FE3A6]"
                />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] font-semibold text-[#8EAEA0] block mb-1">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#2FE3A6]"
                />
              </div>
            </div>
          </div>

          {/* Parties Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-[#2FE3A6]/20 bg-[#032019]/70 p-4 space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#2EE6B0]">Seller (From)</h3>
              <input
                type="text"
                placeholder="Business Name"
                value={seller.name}
                onChange={(e) => setSeller({ ...seller, name: e.target.value })}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-lg px-3 py-1.5 text-xs text-white"
              />
              <input
                type="email"
                placeholder="Email Address"
                value={seller.email || ""}
                onChange={(e) => setSeller({ ...seller, email: e.target.value })}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-lg px-3 py-1.5 text-xs text-white"
              />
              <input
                type="text"
                placeholder="Address / City"
                value={seller.address || ""}
                onChange={(e) => setSeller({ ...seller, address: e.target.value })}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-lg px-3 py-1.5 text-xs text-white"
              />
              <input
                type="text"
                placeholder="Tax / VAT ID (optional)"
                value={seller.taxId || ""}
                onChange={(e) => setSeller({ ...seller, taxId: e.target.value })}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-lg px-3 py-1.5 text-xs text-white"
              />
            </div>

            <div className="rounded-2xl border border-[#2FE3A6]/20 bg-[#032019]/70 p-4 space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#2EE6B0]">Client (Bill To)</h3>
              <input
                type="text"
                placeholder="Client Name"
                value={buyer.name}
                onChange={(e) => setBuyer({ ...buyer, name: e.target.value })}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-lg px-3 py-1.5 text-xs text-white"
              />
              <input
                type="email"
                placeholder="Client Email"
                value={buyer.email || ""}
                onChange={(e) => setBuyer({ ...buyer, email: e.target.value })}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-lg px-3 py-1.5 text-xs text-white"
              />
              <input
                type="text"
                placeholder="Client Address"
                value={buyer.address || ""}
                onChange={(e) => setBuyer({ ...buyer, address: e.target.value })}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-lg px-3 py-1.5 text-xs text-white"
              />
            </div>
          </div>

          {/* Line Items Card */}
          <div className="rounded-2xl border border-[#2FE3A6]/20 bg-[#032019]/70 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#2EE6B0]">Line Items</h3>
              <button
                type="button"
                onClick={addLine}
                className="text-xs text-[#2FE3A6] hover:underline inline-flex items-center gap-1 font-semibold"
              >
                <Plus className="w-3.5 h-3.5" /> Add Line
              </button>
            </div>

            <div className="space-y-3">
              {lines.map((line, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-[#021A14] border border-white/5 space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Description"
                      value={line.description}
                      onChange={(e) => updateLine(idx, { description: e.target.value })}
                      className="flex-1 bg-transparent border-b border-white/10 px-2 py-1 text-white focus:outline-none focus:border-[#2FE3A6]"
                    />
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="text-red-400 hover:text-red-300 p-1"
                        title="Remove line"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <span className="text-[10px] text-[#7E9F91] block">Qty</span>
                      <input
                        type="number"
                        min="0.1"
                        step="1"
                        value={line.quantity}
                        onChange={(e) => updateLine(idx, { quantity: parseFloat(e.target.value) || 1 })}
                        className="w-full bg-transparent border-b border-white/10 px-1 py-0.5 text-white"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-[#7E9F91] block">Unit Price</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={line.unitPrice}
                        onChange={(e) => updateLine(idx, { unitPrice: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-transparent border-b border-white/10 px-1 py-0.5 text-white"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-[#7E9F91] block">Disc %</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={line.discountPercent || 0}
                        onChange={(e) => updateLine(idx, { discountPercent: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-transparent border-b border-white/10 px-1 py-0.5 text-white"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-[#7E9F91] block">Tax %</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={line.taxPercent || 0}
                        onChange={(e) => updateLine(idx, { taxPercent: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-transparent border-b border-white/10 px-1 py-0.5 text-white"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-white/5">
              <label className="text-[11px] font-semibold text-[#8EAEA0] block mb-1">
                Payment Terms & Notes
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
          </div>
        </div>

        {/* Live Printable Preview (Right 6 cols) */}
        <div className="lg:col-span-6">
          <div
            id="printable-invoice"
            className="rounded-2xl border border-white/15 bg-white text-gray-900 p-8 shadow-2xl space-y-6"
          >
            {/* Invoice Header */}
            <div className="flex justify-between items-start border-b border-gray-200 pb-6">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-[#0A5A44]">INVOICE</h2>
                <div className="text-xs font-semibold text-gray-500 mt-1">#{invoiceNumber}</div>
              </div>
              <div className="text-right text-xs text-gray-600 space-y-1">
                <div>
                  <strong className="text-gray-900 font-semibold">{seller.name}</strong>
                </div>
                {seller.email && <div>{seller.email}</div>}
                {seller.address && <div>{seller.address}</div>}
                {seller.taxId && <div>Tax ID: {seller.taxId}</div>}
              </div>
            </div>

            {/* Bill To & Dates */}
            <div className="grid grid-cols-2 gap-6 text-xs text-gray-700">
              <div>
                <span className="font-bold text-gray-400 uppercase tracking-wider block mb-1">Billed To</span>
                <div className="font-semibold text-gray-900 text-sm">{buyer.name}</div>
                {buyer.email && <div>{buyer.email}</div>}
                {buyer.address && <div>{buyer.address}</div>}
              </div>
              <div className="text-right space-y-1">
                <div>
                  <span className="text-gray-500">Issue Date:</span>{" "}
                  <strong className="text-gray-900">{issueDate}</strong>
                </div>
                <div>
                  <span className="text-gray-500">Due Date:</span>{" "}
                  <strong className="text-gray-900">{dueDate}</strong>
                </div>
              </div>
            </div>

            {/* Items Table */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold">
                  <tr>
                    <th className="p-3">Item Description</th>
                    <th className="p-3 text-center">Qty</th>
                    <th className="p-3 text-right">Price</th>
                    <th className="p-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {result?.lines.map((l, i) => (
                    <tr key={i} className="text-gray-800">
                      <td className="p-3 font-medium">{l.description}</td>
                      <td className="p-3 text-center">{l.quantity}</td>
                      <td className="p-3 text-right">
                        {currency} {l.unitPrice.toFixed(2)}
                      </td>
                      <td className="p-3 text-right font-semibold">
                        {currency} {l.lineTotal?.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary Totals */}
            {result && (
              <div className="flex justify-end pt-2">
                <div className="w-64 space-y-1.5 text-xs text-gray-600">
                  <div className="flex justify-between py-1">
                    <span>Subtotal:</span>
                    <span className="text-gray-900 font-medium">
                      {currency} {result.subtotal.toFixed(2)}
                    </span>
                  </div>
                  {result.totalDiscount > 0 && (
                    <div className="flex justify-between py-1 text-emerald-700">
                      <span>Discount Total:</span>
                      <span>
                        -{currency} {result.totalDiscount.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {result.totalTax > 0 && (
                    <div className="flex justify-between py-1">
                      <span>Tax Total:</span>
                      <span className="text-gray-900 font-medium">
                        +{currency} {result.totalTax.toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between py-2 border-t border-gray-300 text-sm font-bold text-gray-900">
                    <span>Total Due:</span>
                    <span className="text-[#0A5A44] font-black text-base">
                      {currency} {result.totalAmount.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Terms / Notes */}
            {notes && (
              <div className="border-t border-gray-200 pt-4 text-xs text-gray-500">
                <strong className="block text-gray-700 font-medium mb-1">Notes & Instructions:</strong>
                {notes}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { composeWhatsappApi, type WhatsappInput, type WhatsappResult } from "@/lib/tools-api";
import { Copy, Check, ExternalLink, Download } from "lucide-react";

export function WhatsappLinkGeneratorWorkbench() {
  const [phoneNumber, setPhoneNumber] = useState("+1 415 555 0192");
  const [message, setMessage] = useState("Hi! I would like to schedule a consultation with your team.");
  const [result, setResult] = useState<WhatsappResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const input: WhatsappInput = {
      internationalNumber: phoneNumber,
      prefilledMessage: message,
    };
    composeWhatsappApi(input)
      .then((res) => {
        setError(null);
        setResult(res);
      })
      .catch((err) => setError(err.message || "Invalid phone number"));
  }, [phoneNumber, message]);

  const copyUrl = () => {
    if (!result?.fullUrl) return;
    navigator.clipboard.writeText(result.fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadQr = () => {
    if (!result?.qrDataUrl) return;
    const a = document.createElement("a");
    a.href = result.qrDataUrl;
    a.download = `whatsapp-chat-qr-${result.internationalNumber}.png`;
    a.click();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Form Left */}
      <div className="lg:col-span-7 space-y-6">
        <div className="rounded-2xl border border-[#2FE3A6]/20 bg-[#032019]/70 p-6 backdrop-blur-sm shadow-xl space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
              WhatsApp Phone Number (with Country Code)
            </label>
            <div className="relative">
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1 512 555 0199"
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#2FE3A6]"
              />
            </div>
            <span className="text-[11px] text-[#7E9F91] mt-1 block">
              Format with international prefix (e.g. +1 for US/Canada, +44 for UK, +971 for UAE).
            </span>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0]">
                Pre-filled Message Text
              </label>
              <span className="text-[11px] text-[#7E9F91]">{message.length} characters</span>
            </div>
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Hi Noxtill, I would like to book a service appointment..."
              className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#2FE3A6]"
            />
            <span className="text-[11px] text-[#7E9F91] mt-1 block">
              This message will automatically appear in the user’s text input when WhatsApp opens.
            </span>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/30 text-red-200 text-xs">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Right Column: WhatsApp Phone Simulation & QR */}
      <div className="lg:col-span-5 space-y-5">
        {/* WhatsApp Mobile Mockup */}
        <div className="rounded-3xl border-4 border-gray-800 bg-[#ECE5DD] overflow-hidden shadow-2xl">
          {/* Header Bar */}
          <div className="bg-[#075E54] text-white px-4 py-3 flex items-center gap-3 shadow-md">
            <div className="w-9 h-9 rounded-full bg-[#25D366] flex items-center justify-center font-bold text-xs text-white">
              WA
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate leading-tight">
                {result?.internationalNumber ? `+${result.internationalNumber}` : "WhatsApp Chat"}
              </div>
              <div className="text-[11px] text-emerald-200">Online · Business Account</div>
            </div>
          </div>

          {/* Chat Background & Message Bubble */}
          <div className="p-4 min-h-[160px] flex flex-col justify-end bg-[#ECE5DD] relative">
            <div className="self-end max-w-[85%] bg-[#DCF8C6] text-gray-900 rounded-lg p-3 shadow text-xs relative">
              <p className="leading-relaxed whitespace-pre-wrap">{message || "Type a message..."}</p>
              <span className="text-[9px] text-gray-400 block text-right mt-1">10:45 AM ✓✓</span>
            </div>
          </div>
        </div>

        {/* Generated Link & QR Container */}
        <div className="rounded-2xl border border-[#2FE3A6]/25 bg-[#032019]/90 p-5 space-y-4">
          <div className="text-xs font-bold uppercase tracking-wider text-[#2EE6B0]">
            Generated Click-to-Chat Link
          </div>

          <div className="p-3 rounded-xl bg-[#021A14] border border-[#2FE3A6]/20 text-xs font-mono text-[#2FE3A6] break-all select-all">
            {result?.fullUrl || "Generating..."}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={copyUrl}
              className="py-2 px-3 rounded-xl bg-[#2FE3A6] text-[#032019] text-xs font-bold hover:bg-[#44F5C2] transition-colors flex items-center justify-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Link Copied" : "Copy Link"}</span>
            </button>

            {result?.fullUrl && (
              <a
                href={result.fullUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2 px-3 rounded-xl border border-[#2FE3A6]/30 text-[#2FE3A6] text-xs font-semibold hover:bg-[#2FE3A6]/10 transition-colors flex items-center justify-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Test Link</span>
              </a>
            )}
          </div>

          {result?.qrDataUrl && (
            <div className="pt-3 border-t border-white/10 flex items-center justify-between">
              <span className="text-xs text-[#9DBBB0]">Scan to open chat on phone:</span>
              <button
                type="button"
                onClick={downloadQr}
                className="text-xs font-semibold text-[#2FE3A6] hover:underline inline-flex items-center gap-1"
              >
                <Download className="w-3 h-3" /> Download QR
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

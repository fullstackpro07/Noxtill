"use client";

import { useEffect, useState } from "react";
import { composeReviewKitApi, type ReviewKitInput, type ReviewKitResult } from "@/lib/tools-api";
import { Star, Download, Printer, Copy, Check } from "lucide-react";

export function GoogleReviewGeneratorWorkbench() {
  const [reviewLink, setReviewLink] = useState("https://g.page/r/CbG9Z01_Noxtill/review");
  const [businessName, setBusinessName] = useState("Artisan Roast Coffee Co.");
  const [tagline, setTagline] = useState("Your feedback means the world to our team and helps other local coffee lovers find us!");
  const [template, setTemplate] = useState<"card" | "tent" | "sticker">("card");

  const [result, setResult] = useState<ReviewKitResult | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const input: ReviewKitInput = {
      reviewLink,
      businessDisplayName: businessName,
      tagline,
    };
    composeReviewKitApi(input).then(setResult);
  }, [reviewLink, businessName, tagline]);

  const copyLink = () => {
    if (!result?.reviewLink) return;
    navigator.clipboard.writeText(result.reviewLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadQr = () => {
    if (!result?.qrDataUrl) return;
    const a = document.createElement("a");
    a.href = result.qrDataUrl;
    a.download = `google-review-qr-${businessName.toLowerCase().replace(/\s+/g, "-")}.png`;
    a.click();
  };

  const printKit = () => {
    window.print();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Left Column: Form */}
      <div className="lg:col-span-6 space-y-6">
        <div className="rounded-2xl border border-[#2FE3A6]/20 bg-[#032019]/70 p-6 backdrop-blur-sm shadow-xl space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
              Official Google Review Link
            </label>
            <input
              type="url"
              value={reviewLink}
              onChange={(e) => setReviewLink(e.target.value)}
              placeholder="https://g.page/r/YOUR_LINK/review"
              className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#2FE3A6]"
            />
            <span className="text-[11px] text-[#7E9F91] mt-1 block">
              Copied directly from your Google Business Profile manager under “Ask for reviews”.
            </span>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
              Business Display Name
            </label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g. Austin Clean Dental"
              className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#2FE3A6]"
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
              Customer Invitation Message
            </label>
            <textarea
              rows={3}
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#2FE3A6]"
            />
            <span className="text-[11px] text-[#7E9F91] mt-1 block">
              Google review guidelines require genuine, non-incentivized customer requests.
            </span>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
              Card Layout Style
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "card", label: "Counter Card" },
                { id: "tent", label: "Table Tent" },
                { id: "sticker", label: "Window Decal" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplate(t.id as typeof template)}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all ${
                    template === t.id
                      ? "bg-[#2FE3A6] text-[#032019] border-[#2FE3A6]"
                      : "bg-[#021A14] text-[#C9DCD2] border-white/10"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Live Printable Review Invite Preview */}
      <div className="lg:col-span-6 space-y-4">
        {/* Printable Card Area */}
        <div
          id="printable-review-card"
          className="rounded-3xl border border-white/20 bg-gradient-to-b from-white to-gray-50 text-gray-900 p-8 shadow-2xl flex flex-col items-center text-center space-y-5"
        >
          {/* Google 5-Star Badge */}
          <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold shadow-sm">
            <div className="flex text-amber-500">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-3.5 h-3.5 fill-current" />
              ))}
            </div>
            <span>Review us on Google</span>
          </div>

          <div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">
              {result?.cardHeadline || `Love your experience at ${businessName}?`}
            </h2>
            <p className="text-xs sm:text-sm text-gray-600 max-w-sm mx-auto mt-2 leading-relaxed">
              {tagline}
            </p>
          </div>

          {/* QR Code Frame */}
          <div className="p-4 rounded-2xl bg-white border-2 border-emerald-600/30 shadow-md">
            {result?.qrSvg ? (
              <div
                dangerouslySetInnerHTML={{ __html: result.qrSvg }}
                className="w-44 h-44 flex items-center justify-center"
              />
            ) : (
              <div className="w-44 h-44 flex items-center justify-center text-xs text-gray-400">Loading QR...</div>
            )}
          </div>

          <div className="text-xs text-gray-500">
            Scan with your mobile camera to leave a quick review.
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={downloadQr}
            disabled={!result?.qrDataUrl}
            className="flex-1 py-2.5 px-4 rounded-xl bg-[#2FE3A6] text-[#032019] text-xs font-bold hover:bg-[#44F5C2] transition-colors flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" /> Download QR
          </button>
          <button
            type="button"
            onClick={printKit}
            className="flex-1 py-2.5 px-4 rounded-xl border border-[#2FE3A6]/30 text-[#2FE3A6] text-xs font-bold hover:bg-[#2FE3A6]/15 transition-colors flex items-center justify-center gap-2"
          >
            <Printer className="w-4 h-4" /> Print Card
          </button>
          <button
            type="button"
            onClick={copyLink}
            className="py-2.5 px-3 rounded-xl border border-white/10 text-white text-xs hover:bg-white/5 transition-colors"
            title="Copy Review Link"
          >
            {copied ? <Check className="w-4 h-4 text-[#2FE3A6]" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

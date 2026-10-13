"use client";

import { useEffect, useState } from "react";
import { composeUtmApi, type UtmInput, type UtmResult } from "@/lib/tools-api";
import { Copy, Check, ExternalLink, Download, AlertTriangle } from "lucide-react";

export function UtmBuilderWorkbench() {
  const [destinationUrl, setDestinationUrl] = useState("https://noxtill.com/pricing");
  const [utmSource, setUtmSource] = useState("newsletter");
  const [utmMedium, setUtmMedium] = useState("email");
  const [utmCampaign, setUtmCampaign] = useState("october_promo");
  const [utmTerm, setUtmTerm] = useState("");
  const [utmContent, setUtmContent] = useState("cta_button");
  const [lowercase, setLowercase] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UtmResult | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const input: UtmInput = {
      destinationUrl,
      utmSource,
      utmMedium,
      utmCampaign,
      utmTerm,
      utmContent,
      lowercase,
    };
    const timer = setTimeout(() => {
      composeUtmApi(input)
        .then((res) => {
          setError(null);
          setResult(res);
        })
        .catch((err: Error) => {
          setError(err.message || "Check the details above.");
          setResult(null);
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [destinationUrl, utmSource, utmMedium, utmCampaign, utmTerm, utmContent, lowercase]);

  const copyUrl = () => {
    if (!result?.finalUrl) return;
    navigator.clipboard.writeText(result.finalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadQr = () => {
    if (!result?.qrDataUrl) return;
    const a = document.createElement("a");
    a.href = result.qrDataUrl;
    a.download = `utm-qr-${utmCampaign || "campaign"}.png`;
    a.click();
  };

  const applyPreset = (preset: { source: string; medium: string; campaign: string; content?: string }) => {
    setUtmSource(preset.source);
    setUtmMedium(preset.medium);
    setUtmCampaign(preset.campaign);
    if (preset.content) setUtmContent(preset.content);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {error && (
        <div role="alert" className="lg:col-span-12 rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">
          {error}
        </div>
      )}
      {/* Left Column: Form */}
      <div className="lg:col-span-7 space-y-6">
        {/* Presets */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[#6B7A72] font-medium mr-1">Presets:</span>
          <button
            type="button"
            onClick={() => applyPreset({ source: "google", medium: "cpc", campaign: "search_brand", content: "headline_1" })}
            className="text-xs px-2.5 py-1 rounded-[10px] bg-[#F7FAF8] border border-[#E1E8E4] text-[#3E4B45] hover:border-[#0FA45B] transition-colors"
          >
            Google Paid Search
          </button>
          <button
            type="button"
            onClick={() => applyPreset({ source: "linkedin", medium: "social", campaign: "b2b_launch", content: "feed_post" })}
            className="text-xs px-2.5 py-1 rounded-[10px] bg-[#F7FAF8] border border-[#E1E8E4] text-[#3E4B45] hover:border-[#0FA45B] transition-colors"
          >
            LinkedIn Organic Social
          </button>
          <button
            type="button"
            onClick={() => applyPreset({ source: "mailchimp", medium: "email", campaign: "weekly_digest", content: "footer_cta" })}
            className="text-xs px-2.5 py-1 rounded-[10px] bg-[#F7FAF8] border border-[#E1E8E4] text-[#3E4B45] hover:border-[#0FA45B] transition-colors"
          >
            Email Newsletter
          </button>
        </div>

        {/* Form Container */}
        <div className="rounded-[16px] border border-[#E1E8E4] bg-white p-6 shadow-[0_1px_2px_rgba(16,32,26,.04),0_6px_20px_rgba(16,32,26,.05)] space-y-4">
          <div>
            <label className="text-[#3E4B45] mb-1.5 block text-[13px] font-semibold">
              Website Destination URL *
            </label>
            <input
              type="url"
              value={destinationUrl}
              onChange={(e) => setDestinationUrl(e.target.value)}
              placeholder="https://yourwebsite.com/product"
              className="w-full bg-white border border-[#D5DED9] rounded-[12px] px-3.5 py-2.5 text-sm text-[#10201A] focus:outline-none focus:border-[#0FA45B] focus:ring-[3px] focus:ring-[#0FA45B]/15 placeholder:text-[#9AA7A1]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[#3E4B45] mb-1.5 block text-[13px] font-semibold">
                Campaign Source (utm_source) *
              </label>
              <input
                type="text"
                value={utmSource}
                onChange={(e) => setUtmSource(e.target.value)}
                placeholder="e.g. google, newsletter, instagram"
                className="w-full bg-white border border-[#D5DED9] rounded-[12px] px-3.5 py-2.5 text-sm text-[#10201A] focus:outline-none focus:border-[#0FA45B] focus:ring-[3px] focus:ring-[#0FA45B]/15 placeholder:text-[#9AA7A1]"
              />
            </div>

            <div>
              <label className="text-[#3E4B45] mb-1.5 block text-[13px] font-semibold">
                Campaign Medium (utm_medium) *
              </label>
              <input
                type="text"
                value={utmMedium}
                onChange={(e) => setUtmMedium(e.target.value)}
                placeholder="e.g. cpc, email, social, banner"
                className="w-full bg-white border border-[#D5DED9] rounded-[12px] px-3.5 py-2.5 text-sm text-[#10201A] focus:outline-none focus:border-[#0FA45B] focus:ring-[3px] focus:ring-[#0FA45B]/15 placeholder:text-[#9AA7A1]"
              />
            </div>
          </div>

          <div>
            <label className="text-[#3E4B45] mb-1.5 block text-[13px] font-semibold">
              Campaign Name (utm_campaign) *
            </label>
            <input
              type="text"
              value={utmCampaign}
              onChange={(e) => setUtmCampaign(e.target.value)}
              placeholder="e.g. black_friday_2026, rebrand_launch"
              className="w-full bg-white border border-[#D5DED9] rounded-[12px] px-3.5 py-2.5 text-sm text-[#10201A] focus:outline-none focus:border-[#0FA45B] focus:ring-[3px] focus:ring-[#0FA45B]/15 placeholder:text-[#9AA7A1]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[#3E4B45] mb-1.5 block text-[13px] font-semibold">
                Campaign Term (utm_term - optional)
              </label>
              <input
                type="text"
                value={utmTerm}
                onChange={(e) => setUtmTerm(e.target.value)}
                placeholder="e.g. running+shoes (paid keywords)"
                className="w-full bg-white border border-[#D5DED9] rounded-[12px] px-3.5 py-2.5 text-sm text-[#10201A] focus:outline-none focus:border-[#0FA45B] focus:ring-[3px] focus:ring-[#0FA45B]/15 placeholder:text-[#9AA7A1]"
              />
            </div>

            <div>
              <label className="text-[#3E4B45] mb-1.5 block text-[13px] font-semibold">
                Campaign Content (utm_content - optional)
              </label>
              <input
                type="text"
                value={utmContent}
                onChange={(e) => setUtmContent(e.target.value)}
                placeholder="e.g. header_banner, variant_b"
                className="w-full bg-white border border-[#D5DED9] rounded-[12px] px-3.5 py-2.5 text-sm text-[#10201A] focus:outline-none focus:border-[#0FA45B] focus:ring-[3px] focus:ring-[#0FA45B]/15 placeholder:text-[#9AA7A1]"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-[#3E4B45] cursor-pointer pt-2">
            <input
              type="checkbox"
              checked={lowercase}
              onChange={(e) => setLowercase(e.target.checked)}
              className="accent-[#0FA45B]"
            />
            <span>Automatically convert parameter values to lowercase (recommended for GA4 analytics clean hygiene)</span>
          </label>
        </div>
      </div>

      {/* Right Column: Output & Verification */}
      <div className="lg:col-span-5 space-y-5">
        <div className="rounded-[16px] border border-[#CFE3D7] bg-white p-6 shadow-[0_1px_2px_rgba(16,32,26,.04),0_10px_30px_rgba(16,32,26,.07)] space-y-4">
          <div className="text-[14px] font-bold text-[#10201A]">
            Generated Campaign URL
          </div>

          {result?.hasExistingUtmConflict && (
            <div className="p-3 rounded-[12px] bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong>Existing Parameter Warning:</strong> Destination already contained: {result.existingTags.join(", ")}. These have been replaced with the new campaign values.
              </div>
            </div>
          )}

          <div className="p-3.5 rounded-[12px] bg-white border border-[#D5DED9] text-xs font-mono text-[#0B8A4C] break-all select-all leading-relaxed">
            {result?.finalUrl || (error ? "Fix the details to generate a link." : "Generating...")}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={copyUrl}
              className="py-2.5 px-3 rounded-[12px] bg-[#0FA45B] text-white text-xs font-bold hover:bg-[#0D9452] transition-colors flex items-center justify-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Link Copied" : "Copy URL"}</span>
            </button>

            {result?.finalUrl && (
              <a
                href={result.finalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2.5 px-3 rounded-[12px] border border-[#CFE3D7] text-[#0B8A4C] text-xs font-semibold hover:bg-[#EAF6EF] transition-colors flex items-center justify-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Test Destination</span>
              </a>
            )}
          </div>

          {result?.qrDataUrl && (
            <div className="pt-4 border-t border-[#E6ECE8] flex items-center justify-between">
              <span className="text-xs text-[#5B6B63]">Shareable Campaign QR Code:</span>
              <button
                type="button"
                onClick={downloadQr}
                className="text-xs font-semibold text-[#0B8A4C] hover:underline inline-flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" /> Download QR
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

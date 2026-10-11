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
    composeUtmApi(input).then(setResult);
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
      {/* Left Column: Form */}
      <div className="lg:col-span-7 space-y-6">
        {/* Presets */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[#8EAEA0] font-medium mr-1">Presets:</span>
          <button
            type="button"
            onClick={() => applyPreset({ source: "google", medium: "cpc", campaign: "search_brand", content: "headline_1" })}
            className="text-xs px-2.5 py-1 rounded-lg bg-[#042A20] border border-[#2FE3A6]/20 text-[#C9DCD2] hover:border-[#2FE3A6] transition-colors"
          >
            Google Paid Search
          </button>
          <button
            type="button"
            onClick={() => applyPreset({ source: "linkedin", medium: "social", campaign: "b2b_launch", content: "feed_post" })}
            className="text-xs px-2.5 py-1 rounded-lg bg-[#042A20] border border-[#2FE3A6]/20 text-[#C9DCD2] hover:border-[#2FE3A6] transition-colors"
          >
            LinkedIn Organic Social
          </button>
          <button
            type="button"
            onClick={() => applyPreset({ source: "mailchimp", medium: "email", campaign: "weekly_digest", content: "footer_cta" })}
            className="text-xs px-2.5 py-1 rounded-lg bg-[#042A20] border border-[#2FE3A6]/20 text-[#C9DCD2] hover:border-[#2FE3A6] transition-colors"
          >
            Email Newsletter
          </button>
        </div>

        {/* Form Container */}
        <div className="rounded-2xl border border-[#2FE3A6]/20 bg-[#032019]/70 p-6 backdrop-blur-sm shadow-xl space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
              Website Destination URL *
            </label>
            <input
              type="url"
              value={destinationUrl}
              onChange={(e) => setDestinationUrl(e.target.value)}
              placeholder="https://yourwebsite.com/product"
              className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#2FE3A6]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                Campaign Source (utm_source) *
              </label>
              <input
                type="text"
                value={utmSource}
                onChange={(e) => setUtmSource(e.target.value)}
                placeholder="e.g. google, newsletter, instagram"
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#2FE3A6]"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                Campaign Medium (utm_medium) *
              </label>
              <input
                type="text"
                value={utmMedium}
                onChange={(e) => setUtmMedium(e.target.value)}
                placeholder="e.g. cpc, email, social, banner"
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#2FE3A6]"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
              Campaign Name (utm_campaign) *
            </label>
            <input
              type="text"
              value={utmCampaign}
              onChange={(e) => setUtmCampaign(e.target.value)}
              placeholder="e.g. black_friday_2026, rebrand_launch"
              className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#2FE3A6]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                Campaign Term (utm_term - optional)
              </label>
              <input
                type="text"
                value={utmTerm}
                onChange={(e) => setUtmTerm(e.target.value)}
                placeholder="e.g. running+shoes (paid keywords)"
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#2FE3A6]"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                Campaign Content (utm_content - optional)
              </label>
              <input
                type="text"
                value={utmContent}
                onChange={(e) => setUtmContent(e.target.value)}
                placeholder="e.g. header_banner, variant_b"
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#2FE3A6]"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-[#B8CFC5] cursor-pointer pt-2">
            <input
              type="checkbox"
              checked={lowercase}
              onChange={(e) => setLowercase(e.target.checked)}
              className="accent-[#2FE3A6]"
            />
            <span>Automatically convert parameter values to lowercase (recommended for GA4 analytics clean hygiene)</span>
          </label>
        </div>
      </div>

      {/* Right Column: Output & Verification */}
      <div className="lg:col-span-5 space-y-5">
        <div className="rounded-2xl border border-[#2FE3A6]/30 bg-[#032019]/90 p-6 backdrop-blur-md shadow-2xl space-y-4">
          <div className="text-xs font-bold uppercase tracking-wider text-[#2EE6B0]">
            Generated Campaign URL
          </div>

          {result?.hasExistingUtmConflict && (
            <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <strong>Existing Parameter Warning:</strong> Destination already contained: {result.existingTags.join(", ")}. These have been replaced with the new campaign values.
              </div>
            </div>
          )}

          <div className="p-3.5 rounded-xl bg-[#021A14] border border-[#2FE3A6]/25 text-xs font-mono text-[#2FE3A6] break-all select-all leading-relaxed">
            {result?.finalUrl || "Generating..."}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={copyUrl}
              className="py-2.5 px-3 rounded-xl bg-[#2FE3A6] text-[#032019] text-xs font-bold hover:bg-[#44F5C2] transition-colors flex items-center justify-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Link Copied" : "Copy URL"}</span>
            </button>

            {result?.finalUrl && (
              <a
                href={result.finalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2.5 px-3 rounded-xl border border-[#2FE3A6]/30 text-[#2FE3A6] text-xs font-semibold hover:bg-[#2FE3A6]/10 transition-colors flex items-center justify-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Test Destination</span>
              </a>
            )}
          </div>

          {result?.qrDataUrl && (
            <div className="pt-4 border-t border-white/10 flex items-center justify-between">
              <span className="text-xs text-[#9DBBB0]">Shareable Campaign QR Code:</span>
              <button
                type="button"
                onClick={downloadQr}
                className="text-xs font-semibold text-[#2FE3A6] hover:underline inline-flex items-center gap-1"
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

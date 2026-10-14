"use client";

import { useEffect, useState } from "react";
import { renderSignatureApi, type SignatureInput, type SignatureResult } from "@/lib/tools-api";
import { Copy, Check } from "lucide-react";

export function EmailSignatureWorkbench() {
  const [fullName, setFullName] = useState("Sophia Bennett");
  const [jobTitle, setJobTitle] = useState("Head of Operations");
  const [department, setDepartment] = useState("Client Solutions");
  const [companyName, setCompanyName] = useState("Noxtill Technologies");
  const [email, setEmail] = useState("sophia@noxtill.com");
  const [phone, setPhone] = useState("+1 (512) 555-0198");
  const [website, setWebsite] = useState("https://noxtill.com");
  const [address, setAddress] = useState("Austin, TX · 78701");
  const [avatarUrl, setAvatarUrl] = useState("https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80");
  const [template, setTemplate] = useState<"modern" | "minimal" | "corporate" | "compact">("modern");

  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SignatureResult | null>(null);
  const [copiedRich, setCopiedRich] = useState(false);
  const [copiedHtml, setCopiedHtml] = useState(false);

  useEffect(() => {
    const input: SignatureInput = {
      fullName,
      jobTitle,
      department,
      companyName,
      email,
      phone,
      website,
      address,
      avatarUrl,
      template,
    };
    const timer = setTimeout(() => {
      renderSignatureApi(input)
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
  }, [fullName, jobTitle, department, companyName, email, phone, website, address, avatarUrl, template]);

  const copyRichSignature = async () => {
    if (!result?.html) return;
    try {
      const blob = new Blob([result.html], { type: "text/html" });
      const textBlob = new Blob([result.plainText], { type: "text/plain" });
      const data = [new ClipboardItem({ "text/html": blob, "text/plain": textBlob })];
      await navigator.clipboard.write(data);
      setCopiedRich(true);
      setTimeout(() => setCopiedRich(false), 2000);
    } catch {
      navigator.clipboard.writeText(result.html);
      setCopiedRich(true);
      setTimeout(() => setCopiedRich(false), 2000);
    }
  };

  const copyHtmlSource = () => {
    if (!result?.html) return;
    navigator.clipboard.writeText(result.html);
    setCopiedHtml(true);
    setTimeout(() => setCopiedHtml(false), 2000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {error && (
        <div role="alert" className="lg:col-span-12 rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">
          {error}
        </div>
      )}
      {/* Form Left */}
      <div className="lg:col-span-6 space-y-6">
        <div className="rounded-[16px] border border-[#E1E8E4] bg-white p-6 shadow-[0_1px_2px_rgba(16,32,26,.04),0_6px_20px_rgba(16,32,26,.05)] space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-bold text-[#10201A]">
              Signature Details
            </span>
            <div className="flex items-center gap-1">
              {[
                { id: "modern", label: "Modern" },
                { id: "minimal", label: "Minimal" },
                { id: "corporate", label: "Corporate" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplate(t.id as typeof template)}
                  className={`px-2.5 py-1 text-xs rounded-[10px] border transition-all ${
                    template === t.id
                      ? "bg-[#0FA45B] text-white border-[#0FA45B] font-bold"
                      : "bg-white text-[#3E4B45] border-[#E6ECE8]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="col-span-2 sm:col-span-1">
              <label className="text-[11px] font-semibold text-[#6B7A72] block mb-1">Full Name *</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-white border border-[#D5DED9] rounded-[12px] px-3 py-2 text-[#10201A]"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-[11px] font-semibold text-[#6B7A72] block mb-1">Job Title</label>
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className="w-full bg-white border border-[#D5DED9] rounded-[12px] px-3 py-2 text-[#10201A]"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-[11px] font-semibold text-[#6B7A72] block mb-1">Department</label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full bg-white border border-[#D5DED9] rounded-[12px] px-3 py-2 text-[#10201A]"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-[11px] font-semibold text-[#6B7A72] block mb-1">Company Name *</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full bg-white border border-[#D5DED9] rounded-[12px] px-3 py-2 text-[#10201A]"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-[11px] font-semibold text-[#6B7A72] block mb-1">Email Address *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white border border-[#D5DED9] rounded-[12px] px-3 py-2 text-[#10201A]"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-[11px] font-semibold text-[#6B7A72] block mb-1">Direct Phone</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-white border border-[#D5DED9] rounded-[12px] px-3 py-2 text-[#10201A]"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-[11px] font-semibold text-[#6B7A72] block mb-1">Website URL</label>
              <input
                type="text"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="w-full bg-white border border-[#D5DED9] rounded-[12px] px-3 py-2 text-[#10201A]"
              />
            </div>
            <div className="col-span-2">
              <label className="text-[11px] font-semibold text-[#6B7A72] block mb-1">Office Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-white border border-[#D5DED9] rounded-[12px] px-3 py-2 text-[#10201A]"
              />
            </div>
            <div className="col-span-2">
              <label className="text-[11px] font-semibold text-[#6B7A72] block mb-1">Avatar / Headshot Image URL (optional)</label>
              <input
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://.../photo.jpg"
                className="w-full bg-white border border-[#D5DED9] rounded-[12px] px-3 py-2 text-[#10201A]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Simulated Email Client Preview & Copy Button */}
      <div className="lg:col-span-6 space-y-4">
        {/* Mock Email Composer */}
        <div className="rounded-[16px] border border-[#E1E8E4] bg-white text-gray-900 overflow-hidden shadow-[0_1px_2px_rgba(16,32,26,.04),0_10px_30px_rgba(16,32,26,.07)]">
          {/* Email Composer Window Header */}
          <div className="bg-gray-100 border-b border-gray-200 px-4 py-2.5 flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
              <span className="font-semibold text-gray-700 ml-2">New Message</span>
            </div>
            <span>Preview</span>
          </div>

          <div className="p-6 space-y-4 text-xs text-gray-700">
            <div className="text-gray-400 pb-2 border-b border-gray-100">
              To: client@example.com
            </div>
            <div className="text-gray-400 pb-2 border-b border-gray-100">
              Subject: Following up on our project proposal
            </div>
            <div className="text-gray-500 italic py-2">
              Hi John,
              <br /><br />
              It was great speaking with you earlier today. Here is the contract outline as discussed.
              <br /><br />
              Best regards,
            </div>

            {/* Rendered Signature Area */}
            <div className="pt-3 border-t border-gray-200">
              {result?.html ? (
                <div dangerouslySetInnerHTML={{ __html: result.html }} />
              ) : (
                <div className="text-gray-400">Loading signature...</div>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={copyRichSignature}
            className="flex-1 py-2.5 px-4 rounded-[12px] bg-[#0FA45B] text-white text-xs font-bold hover:bg-[#0D9452] transition-colors flex items-center justify-center gap-2 shadow-[0_1px_2px_rgba(16,32,26,.04),0_6px_20px_rgba(16,32,26,.05)]"
          >
            {copiedRich ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copiedRich ? "Copied! Paste into Gmail/Outlook" : "Copy Rich Signature"}
          </button>

          <button
            type="button"
            onClick={copyHtmlSource}
            className="py-2.5 px-3 rounded-[12px] border border-[#CFE3D7] text-[#0B8A4C] text-xs font-semibold hover:bg-[#EAF6EF] transition-colors"
          >
            {copiedHtml ? "HTML Copied" : "Copy Raw HTML"}
          </button>
        </div>
      </div>
    </div>
  );
}

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
    renderSignatureApi(input).then(setResult);
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
      {/* Form Left */}
      <div className="lg:col-span-6 space-y-6">
        <div className="rounded-2xl border border-[#2FE3A6]/20 bg-[#032019]/70 p-6 backdrop-blur-sm shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#2EE6B0]">
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
                  className={`px-2.5 py-1 text-xs rounded-lg border transition-all ${
                    template === t.id
                      ? "bg-[#2FE3A6] text-[#032019] border-[#2FE3A6] font-bold"
                      : "bg-[#021A14] text-[#C9DCD2] border-white/10"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="col-span-2 sm:col-span-1">
              <label className="text-[11px] font-semibold text-[#8EAEA0] block mb-1">Full Name *</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3 py-2 text-white"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-[11px] font-semibold text-[#8EAEA0] block mb-1">Job Title</label>
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3 py-2 text-white"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-[11px] font-semibold text-[#8EAEA0] block mb-1">Department</label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3 py-2 text-white"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-[11px] font-semibold text-[#8EAEA0] block mb-1">Company Name *</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3 py-2 text-white"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-[11px] font-semibold text-[#8EAEA0] block mb-1">Email Address *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3 py-2 text-white"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-[11px] font-semibold text-[#8EAEA0] block mb-1">Direct Phone</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3 py-2 text-white"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-[11px] font-semibold text-[#8EAEA0] block mb-1">Website URL</label>
              <input
                type="text"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3 py-2 text-white"
              />
            </div>
            <div className="col-span-2">
              <label className="text-[11px] font-semibold text-[#8EAEA0] block mb-1">Office Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3 py-2 text-white"
              />
            </div>
            <div className="col-span-2">
              <label className="text-[11px] font-semibold text-[#8EAEA0] block mb-1">Avatar / Headshot Image URL (optional)</label>
              <input
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://.../photo.jpg"
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3 py-2 text-white"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Simulated Email Client Preview & Copy Button */}
      <div className="lg:col-span-6 space-y-4">
        {/* Mock Email Composer */}
        <div className="rounded-2xl border border-white/15 bg-white text-gray-900 overflow-hidden shadow-2xl">
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
            className="flex-1 py-2.5 px-4 rounded-xl bg-[#2FE3A6] text-[#032019] text-xs font-bold hover:bg-[#44F5C2] transition-colors flex items-center justify-center gap-2 shadow-lg"
          >
            {copiedRich ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copiedRich ? "Copied! Paste into Gmail/Outlook" : "Copy Rich Signature"}
          </button>

          <button
            type="button"
            onClick={copyHtmlSource}
            className="py-2.5 px-3 rounded-xl border border-[#2FE3A6]/30 text-[#2FE3A6] text-xs font-semibold hover:bg-[#2FE3A6]/10 transition-colors"
          >
            {copiedHtml ? "HTML Copied" : "Copy Raw HTML"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { ChevronDown, Sparkles, ArrowRight, ShieldCheck, CheckCircle2 } from "lucide-react";

export interface ToolFaqItem {
  question: string;
  answer: string;
}

export interface ToolFormulaInfo {
  title: string;
  formula?: string;
  description: string;
  steps?: string[];
}

export interface ToolPageLayoutProps {
  title: string;
  badge?: string;
  description: string;
  currentSlug: string;
  formulaInfo?: ToolFormulaInfo;
  faqs?: ToolFaqItem[];
  children: React.ReactNode;
}

const ALL_TOOLS_LIST = [
  { slug: "discount-calculator", name: "Discount Calculator", desc: "Precision multi-mode discounts & taxes" },
  { slug: "profit-margin-calculator", name: "Profit Margin Calculator", desc: "Unit economics, margins & markup" },
  { slug: "break-even-calculator", name: "Break-Even Calculator", desc: "Contribution margin & volume threshold" },
  { slug: "invoice-generator", name: "Invoice Generator", desc: "Customizable PDF invoices & receipts" },
  { slug: "qr-code-generator", name: "QR Code Generator", desc: "7 safe static QR payload formats" },
  { slug: "google-review-link-generator", name: "Google Review Link & QR", desc: "Non-gated review invite cards & QR" },
  { slug: "whatsapp-link-generator", name: "WhatsApp Link Generator", desc: "Click-to-chat links with E.164 formatting" },
  { slug: "utm-campaign-link-builder", name: "UTM Campaign Link Builder", desc: "Clean GA4-compatible marketing URLs" },
  { slug: "email-signature-generator", name: "Email Signature Generator", desc: "Clean HTML signatures for Gmail & Outlook" },
  { slug: "missed-call-revenue-calculator", name: "Missed Call Revenue Calculator", desc: "Recoverable sales opportunity modeling" },
];

export function ToolPageLayout({
  title,
  badge = "Free Business Tool",
  description,
  currentSlug,
  formulaInfo,
  faqs = [],
  children,
}: ToolPageLayoutProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [formulaOpen, setFormulaOpen] = useState(true);

  const otherTools = ALL_TOOLS_LIST.filter((t) => t.slug !== currentSlug).slice(0, 4);

  return (
    <div className="min-h-screen bg-[#021812] text-[#E6F2EC] font-sans antialiased selection:bg-[#2FE3A6]/30 selection:text-white">
      <SiteHeader />

      {/* Hero Banner */}
      <section className="relative overflow-hidden border-b border-[#0E7A5A]/30 bg-gradient-to-b from-[#0A5A44]/35 via-[#042E23]/25 to-transparent pt-12 pb-14 px-4 sm:px-6 lg:px-8">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(47,227,166,0.15),transparent)]" />

        <div className="max-w-6xl mx-auto relative z-10">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-2 text-xs text-[#9DBBB0]">
            <Link href="/" className="hover:text-[#2FE3A6] transition-colors">
              Home
            </Link>
            <span>/</span>
            <Link href="/free-tools" className="hover:text-[#2FE3A6] transition-colors">
              Free Tools
            </Link>
            <span>/</span>
            <span className="text-[#2FE3A6] font-medium">{title}</span>
          </nav>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#2FE3A6]/15 text-[#2FE3A6] border border-[#2FE3A6]/30">
              <Sparkles className="w-3.5 h-3.5" />
              {badge}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-[#7C9E91]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#2FE3A6]" />
              No signup required · 100% Free · Client-safe
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white mb-3">
            {title}
          </h1>
          <p className="text-base sm:text-lg text-[#B8CFC5] max-w-3xl leading-relaxed">
            {description}
          </p>
        </div>
      </section>

      {/* Main Interactive Workbench Container */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-12">{children}</div>

        {/* How It's Calculated Accordion */}
        {formulaInfo && (
          <section className="mb-10 rounded-2xl border border-[#2FE3A6]/20 bg-[#03241C]/80 p-6 sm:p-8 backdrop-blur-sm shadow-xl">
            <button
              type="button"
              onClick={() => setFormulaOpen(!formulaOpen)}
              className="w-full flex items-center justify-between text-left group"
              aria-expanded={formulaOpen}
            >
              <div>
                <span className="text-xs font-semibold tracking-wider uppercase text-[#2EE6B0]">
                  Methodology & Formula
                </span>
                <h2 className="text-xl font-bold text-white group-hover:text-[#2FE3A6] transition-colors mt-0.5">
                  {formulaInfo.title}
                </h2>
              </div>
              <ChevronDown
                className={`w-5 h-5 text-[#9DBBB0] transition-transform duration-200 ${
                  formulaOpen ? "rotate-180 text-[#2FE3A6]" : ""
                }`}
              />
            </button>

            {formulaOpen && (
              <div className="mt-5 pt-5 border-t border-[#2FE3A6]/15 text-sm text-[#C9DCD2] space-y-4">
                {formulaInfo.formula && (
                  <div className="p-3.5 rounded-xl bg-[#021A14] border border-[#2FE3A6]/25 font-mono text-xs sm:text-sm text-[#2FE3A6]">
                    {formulaInfo.formula}
                  </div>
                )}
                <p className="leading-relaxed">{formulaInfo.description}</p>
                {formulaInfo.steps && formulaInfo.steps.length > 0 && (
                  <ul className="space-y-2 mt-3">
                    {formulaInfo.steps.map((step, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-[#2FE3A6] flex-shrink-0 mt-0.5" />
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        )}

        {/* FAQs Section */}
        {faqs.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-white mb-6">Frequently Asked Questions</h2>
            <div className="space-y-3">
              {faqs.map((faq, idx) => {
                const isOpen = openFaq === idx;
                return (
                  <div
                    key={idx}
                    className="rounded-xl border border-[#2FE3A6]/15 bg-[#032019]/60 overflow-hidden transition-colors hover:border-[#2FE3A6]/30"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : idx)}
                      className="w-full flex items-center justify-between p-4 sm:p-5 text-left font-medium text-white text-sm sm:text-base hover:text-[#2FE3A6] transition-colors"
                      aria-expanded={isOpen}
                    >
                      <span>{faq.question}</span>
                      <ChevronDown
                        className={`w-4 h-4 text-[#9DBBB0] flex-shrink-0 transition-transform ${
                          isOpen ? "rotate-180 text-[#2FE3A6]" : ""
                        }`}
                      />
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-5 sm:px-5 sm:pb-6 text-sm text-[#B8CFC5] leading-relaxed border-t border-white/5 pt-3">
                        {faq.answer}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Other Free Tools Grid */}
        <section className="mb-12 pt-8 border-t border-[#2FE3A6]/20">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-white">Explore More Free Tools</h2>
              <p className="text-xs text-[#9DBBB0]">Built to help small businesses automate and thrive.</p>
            </div>
            <Link
              href="/free-tools"
              className="text-xs font-semibold text-[#2FE3A6] hover:underline inline-flex items-center gap-1"
            >
              View all 10 tools <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {otherTools.map((tool) => (
              <Link
                key={tool.slug}
                href={`/free-tools/${tool.slug}`}
                className="group p-4 rounded-xl border border-[#2FE3A6]/20 bg-[#03241C]/60 hover:bg-[#043327] hover:border-[#2FE3A6]/45 transition-all shadow-sm"
              >
                <h3 className="font-semibold text-sm text-white group-hover:text-[#2FE3A6] transition-colors mb-1">
                  {tool.name}
                </h3>
                <p className="text-xs text-[#8EAEA0] line-clamp-2">{tool.desc}</p>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

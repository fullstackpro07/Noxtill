import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import {
  Sparkles,
  ArrowRight,
  Calculator,
  Percent,
  TrendingUp,
  Receipt,
  QrCode,
  Star,
  MessageCircle,
  Link as LinkIcon,
  Mail,
  PhoneMissed,
  ShieldCheck,
  Zap,
  Lock,
} from "lucide-react";

export const metadata: Metadata = {
  title: "10 Free Business Tools & Calculators | Noxtill",
  description:
    "Free interactive business tools for entrepreneurs and operators: Discount Calculator, Profit Margin, Break-Even, Invoicing, QR Codes, Review Link, WhatsApp Link, UTM Builder, Email Signatures, and Missed Call Revenue.",
  alternates: {
    canonical: "https://noxtill.com/free-tools",
  },
};

const TOOLS = [
  {
    slug: "discount-calculator",
    badge: "FT-01",
    category: "Pricing & Finance",
    title: "Discount Calculator",
    desc: "Calculate single and stacked percentage discounts, fixed coupons, and sales tax with zero rounding errors.",
    icon: Percent,
  },
  {
    slug: "profit-margin-calculator",
    badge: "FT-02",
    category: "Pricing & Finance",
    title: "Profit Margin & Markup Calculator",
    desc: "Calculate gross margin, markup percentage, and unit profit to price products with confidence.",
    icon: TrendingUp,
  },
  {
    slug: "break-even-calculator",
    badge: "FT-03",
    category: "Pricing & Finance",
    title: "Break-Even Analysis Calculator",
    desc: "Determine unit volume and threshold sales revenue required to cover fixed overhead and hit target profit.",
    icon: Calculator,
  },
  {
    slug: "invoice-generator",
    badge: "FT-04",
    category: "Sales & Commerce",
    title: "Free Invoice Generator",
    desc: "Generate professional, branded PDF invoices and receipts with line items, tax rates, and payment instructions.",
    icon: Receipt,
  },
  {
    slug: "qr-code-generator",
    badge: "FT-05",
    category: "Marketing & Growth",
    title: "Static QR Code Generator",
    desc: "Create clean, permanent static QR codes for links, Wi-Fi networks, vCards, SMS, and WhatsApp in SVG/PNG.",
    icon: QrCode,
  },
  {
    slug: "google-review-link-generator",
    badge: "FT-06",
    category: "Marketing & Growth",
    title: "Google Review Link & QR Generator",
    desc: "Generate 1-click Google review links and printable counter display stand cards compliant with non-gating rules.",
    icon: Star,
  },
  {
    slug: "whatsapp-link-generator",
    badge: "FT-07",
    category: "Communication",
    title: "WhatsApp Click-to-Chat Generator",
    desc: "Create direct WhatsApp links with international E.164 phone formatting, pre-filled greeting messages, and QR codes.",
    icon: MessageCircle,
  },
  {
    slug: "utm-campaign-link-builder",
    badge: "FT-08",
    category: "Marketing & Growth",
    title: "UTM Campaign Link Builder",
    desc: "Assemble GA4-compliant campaign tracking URLs with standard source, medium, campaign parameters and QR generation.",
    icon: LinkIcon,
  },
  {
    slug: "email-signature-generator",
    badge: "FT-09",
    category: "Communication",
    title: "Email Signature Generator",
    desc: "Design responsive, email-client-safe HTML signatures with contact info, social icons, and branding.",
    icon: Mail,
  },
  {
    slug: "missed-call-revenue-calculator",
    badge: "FT-10",
    category: "Pricing & Finance",
    title: "Missed Call Revenue Calculator",
    desc: "Quantify the real monthly and annual revenue lost to unanswered phone calls and model recoverable pipeline.",
    icon: PhoneMissed,
  },
];

export default function FreeToolsHubPage() {
  return (
    <div className="min-h-screen bg-[#021812] text-[#E6F2EC] font-sans antialiased selection:bg-[#2FE3A6]/30 selection:text-white">
      <SiteHeader />

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-[#0E7A5A]/30 bg-gradient-to-b from-[#0A5A44]/35 via-[#042E23]/25 to-transparent pt-16 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(47,227,166,0.18),transparent)]" />

        <div className="max-w-5xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#2FE3A6]/15 text-[#2FE3A6] border border-[#2FE3A6]/30 mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            10 Professional Business Utilities · 100% Free Forever
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white mb-6">
            Free Business Tools & <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#2FE3A6] via-[#2EE6B0] to-emerald-400">
              Interactive Calculators
            </span>
          </h1>

          <p className="text-base sm:text-lg lg:text-xl text-[#B8CFC5] max-w-2xl mx-auto leading-relaxed mb-8">
            Built for founders, operators, and growth marketers. Free of charge, no registration required, and engineered with mathematical precision.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-[#8EAEA0]">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#2FE3A6]" /> Zero Sign-up Required
            </span>
            <span className="flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-[#2FE3A6]" /> Private & Client-Safe
            </span>
            <span className="flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-[#2FE3A6]" /> Instant Real-Time Calculations
            </span>
          </div>
        </div>
      </section>

      {/* Tools Grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link
                key={tool.slug}
                href={`/free-tools/${tool.slug}`}
                className="group rounded-2xl border border-[#2FE3A6]/20 bg-[#032019]/75 p-6 backdrop-blur-sm shadow-lg hover:border-[#2FE3A6]/50 hover:bg-[#042A21] hover:shadow-2xl hover:shadow-[#2FE3A6]/10 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[11px] font-bold font-mono px-2.5 py-1 rounded-md bg-[#2FE3A6]/15 text-[#2FE3A6] border border-[#2FE3A6]/30">
                      {tool.badge}
                    </span>
                    <span className="text-xs text-[#8EAEA0] font-medium">{tool.category}</span>
                  </div>

                  <div className="w-12 h-12 rounded-xl bg-[#021A14] border border-[#2FE3A6]/25 flex items-center justify-center text-[#2FE3A6] mb-4 group-hover:scale-105 group-hover:bg-[#2FE3A6]/20 transition-all">
                    <Icon className="w-6 h-6" />
                  </div>

                  <h2 className="text-lg font-bold text-white group-hover:text-[#2FE3A6] transition-colors mb-2">
                    {tool.title}
                  </h2>

                  <p className="text-xs sm:text-sm text-[#A3C6B8] leading-relaxed mb-6">
                    {tool.desc}
                  </p>
                </div>

                <div className="pt-4 border-t border-white/5 flex items-center justify-between text-xs font-semibold text-[#2FE3A6] group-hover:translate-x-0.5 transition-transform">
                  <span>Open Free Tool</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              </Link>
            );
          })}
        </div>

        {/* Feature Highlights Banner */}
        <section className="mt-20 rounded-3xl border border-[#2FE3A6]/25 bg-gradient-to-r from-[#032019] via-[#05382B] to-[#032019] p-8 sm:p-12 text-center relative overflow-hidden">
          <div className="max-w-3xl mx-auto space-y-4">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
              Power Your Operations with Noxtill
            </h2>
            <p className="text-sm sm:text-base text-[#B8CFC5] leading-relaxed">
              These free tools solve everyday calculations. The full Noxtill platform unifies POS, AI Phone Answering, Online Bookings, CRM, and Multi-location Inventory in one unified system.
            </p>
            <div className="pt-4 flex flex-wrap justify-center gap-4">
              <Link
                href="/book-a-demo"
                className="px-6 py-3 rounded-xl bg-[#2FE3A6] text-[#021A14] font-bold text-sm hover:bg-[#28CF96] transition-colors shadow-lg"
              >
                Schedule Platform Demo
              </Link>
              <Link
                href="/product"
                className="px-6 py-3 rounded-xl border border-[#2FE3A6]/40 text-white font-semibold text-sm hover:bg-[#2FE3A6]/10 transition-colors"
              >
                Explore All Features
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

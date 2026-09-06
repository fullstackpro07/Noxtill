import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bookmark,
  Cake,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FlaskConical,
  Gift,
  Heart,
  Layers,
  Mail,
  MessageCircle,
  MessageSquare,
  Monitor,
  PencilLine,
  Percent,
  PlayCircle,
  Quote,
  Repeat,
  Rocket,
  Send,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Star,
  Target,
  TrendingUp,
  Users,
  Workflow,
} from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { DetailRelated } from "@/components/site/detail-page-sections";
import { findProductDetailPage } from "@/lib/marketing/product-detail-content";

const page = findProductDetailPage("marketing")!;

export const metadata: Metadata = {
  title: page.metaTitle,
  description: page.metaDescription,
  alternates: { canonical: "https://noxtill.com/product/marketing/" },
  openGraph: {
    type: "website",
    url: "https://noxtill.com/product/marketing/",
    title: page.metaTitle,
    description: page.metaDescription,
  },
  twitter: { card: "summary_large_image", title: page.metaTitle },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://noxtill.com/" },
        { "@type": "ListItem", position: 2, name: "Product", item: "https://noxtill.com/product/" },
        { "@type": "ListItem", position: 3, name: "Marketing & Campaigns", item: "https://noxtill.com/product/marketing/" },
      ],
    },
    {
      "@type": "Article",
      headline: page.metaTitle,
      description: page.metaDescription,
      url: "https://noxtill.com/product/marketing/",
    },
  ],
};

function FacebookIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" />
    </svg>
  );
}

function InstagramGlyph({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

function TwitterIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z" />
    </svg>
  );
}

function YoutubeIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
      <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
    </svg>
  );
}

const STEP_COLORS = ["#7c3aed", "#0ea86a", "#e8a93c", "#2563eb", "#7c3aed"];

const CAPABILITIES = [
  { icon: Target, title: "Smart Audience Targeting", description: "Use customer data to find the right audience." },
  { icon: PencilLine, title: "Beautiful Templates That Convert", description: "Ready-to-use templates or create your own." },
  { icon: Workflow, title: "Automation That Saves Time", description: "Trigger campaigns based on actions and events." },
  { icon: BarChart3, title: "Real-time Analytics & Insights", description: "Track opens, clicks, sales and ROI in real-time." },
  { icon: FlaskConical, title: "A/B Testing Made Easy", description: "Test subject lines, content and offers." },
  { icon: Layers, title: "Multi-Channel Campaigns", description: "Reach customers on their favorite channels." },
];

const BUILD_STEPS = [
  { icon: Target, title: "Choose Your Goal", description: "Pick what you want to achieve." },
  { icon: Users, title: "Select Your Audience", description: "Use smart filters and segments." },
  { icon: PencilLine, title: "Create Your Campaign", description: "Design, personalize and preview." },
  { icon: Rocket, title: "Launch & Automate", description: "Send now or schedule for later." },
  { icon: TrendingUp, title: "Track & Optimize", description: "Analyze and improve results." },
];

const CHANNEL_PERFORMANCE = [
  { logo: "/brand/whatsapp.png", label: "WhatsApp", open: 65, click: 28, color: "#0ea86a" },
  { logo: "/brand/email.png", label: "Email", open: 42, click: 15, color: "#7c3aed" },
  { logo: "/brand/sms.png", label: "SMS", open: 36, click: 12, color: "#e8a93c" },
  { logo: "/brand/instagram.png", label: "Instagram", open: 24, click: 3.6, color: "#db2777" },
  { facebook: true, label: "Facebook", open: 20, click: 2.9, color: "#1877F2" },
];

const TEMPLATES = [
  { icon: ShoppingBag, title: "New Arrivals", description: "Announce new products", tint: "bg-[#e3fbf1]", color: "text-accent" },
  { icon: Percent, title: "Special Offer", description: "Promote offers & discounts", tint: "bg-amber-50", color: "text-amber-600" },
  { icon: ShoppingCart, title: "Abandoned Cart", description: "Bring back lost customers", tint: "bg-blue-50", color: "text-blue-600" },
  { icon: Cake, title: "Happy Birthday", description: "Make your customers smile", tint: "bg-rose-50", color: "text-rose-600" },
  { icon: Repeat, title: "Re-engagement", description: "Win back inactive customers", tint: "bg-violet-50", color: "text-violet-600" },
];

const AUTOMATION_FLOW = [
  { icon: ShoppingBag, label: "Customer Makes a Purchase" },
  { icon: Mail, label: "Thank You Message" },
  { icon: Clock, label: "Wait 7 Days" },
  { icon: Star, label: "Review Request" },
  { icon: Gift, label: "Offer for Next Purchase" },
];

const CLOSING_CHECKLIST = ["14-day free trial", "No credit card required", "Cancel anytime"];

export default function MarketingCampaignsPage() {
  return (
    <div data-theme="light" className="flex min-h-dvh flex-col bg-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />

      <main className="flex-1">
        

        {/* Hero */}
        <section className="relative px-5 pb-8 pt-8 sm:px-7 sm:pb-10">
          <div className="mx-auto flex max-w-[1560px] flex-wrap items-center gap-x-14 gap-y-12">
            <div className="min-w-[280px] max-w-[460px] flex-1 basis-[400px]">
              <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">Marketing & Campaigns</p>
              <h1 className="text-balance font-display text-[38px] font-bold leading-[1.1] tracking-tight text-fg sm:text-[46px]">
                {page.h1Lead} <span className="text-accent">{page.h1Highlight}</span>
              </h1>
              <p className="mt-4 max-w-[48ch] text-[15px] leading-relaxed text-fg-muted">{page.subhead}</p>

              <div className="mt-5 flex flex-col gap-2.5">
                {page.withList.map((item) => (
                  <div key={item} className="flex items-center gap-2.5 text-[13.5px] text-fg">
                    <CheckCircle2 className="h-4 w-4 flex-none text-accent" aria-hidden />
                    {item}
                  </div>
                ))}
              </div>

              <div className="mt-7 flex flex-nowrap items-center gap-2 sm:gap-3">
                <Link
                  href="/book-a-demo"
                  className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3.5 py-2.5 text-[12.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover sm:gap-2 sm:px-6 sm:py-3.5 sm:text-[15px]"
                >
                  Book a Demo <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                </Link>
                <Link
                  href="#capabilities"
                  className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-md border border-border-strong px-3.5 py-2.5 text-[12.5px] font-medium text-fg transition-colors hover:border-accent hover:text-primary sm:gap-2 sm:px-6 sm:py-3.5 sm:text-[15px]"
                >
                  See How It Works <PlayCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                </Link>
              </div>
            </div>

            <div className="relative min-w-[320px] flex-[1.4] basis-[520px]">
              <div
                className="pointer-events-none absolute inset-0 -z-10"
                style={{ background: "radial-gradient(45% 45% at 50% 45%, rgba(14,168,106,0.1), transparent 70%)" }}
                aria-hidden
              />
              <div className="relative mx-auto flex w-full max-w-[600px] flex-wrap items-center justify-center gap-3">
                <div className="flex flex-col gap-3">
                  <div className="w-[150px] rounded-md border border-border bg-white p-3 shadow-[0_20px_45px_-25px_rgba(13,21,18,0.35)]">
                    <span className="mb-2 flex h-7 w-7 items-center justify-center rounded-md bg-[#25D366]">
                      <MessageCircle className="h-3.5 w-3.5 text-white" aria-hidden />
                    </span>
                    <p className="text-[11.5px] font-semibold text-fg">WhatsApp Message</p>
                    <p className="mt-1.5 text-[9.5px] text-fg-faint">Open Rate</p>
                    <p className="text-[13px] font-bold text-accent">65%</p>
                  </div>
                  <div className="w-[150px] rounded-md border border-border bg-white p-3 shadow-[0_20px_45px_-25px_rgba(13,21,18,0.35)]">
                    <span className="mb-2 flex h-7 w-7 items-center justify-center rounded-md bg-blue-600">
                      <Mail className="h-3.5 w-3.5 text-white" aria-hidden />
                    </span>
                    <p className="text-[11.5px] font-semibold text-fg">Email Campaign</p>
                    <p className="mt-1.5 text-[9.5px] text-fg-faint">Open Rate</p>
                    <p className="text-[13px] font-bold text-fg">42%</p>
                  </div>
                </div>

                <div className="w-[210px] rounded-md border border-border bg-white p-4 shadow-[0_24px_60px_-30px_rgba(13,21,18,0.4)]">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-[12px] font-semibold text-fg">New Campaign</p>
                    <span className="rounded-full bg-[#e3fbf1] px-2 py-0.5 text-[8.5px] font-medium text-accent">Active</span>
                  </div>
                  <p className="mb-3 text-[11px] font-medium text-fg">Summer Sale 2025</p>

                  <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-fg-faint">Audience</p>
                  <div className="mb-3 flex items-center justify-between text-[10.5px]">
                    <span className="text-fg-muted">VIP Customers</span>
                    <span className="font-semibold text-fg">8,742</span>
                  </div>

                  <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-fg-faint">Channels</p>
                  <div className="mb-3 flex items-center gap-1.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#25D366]">
                      <MessageCircle className="h-2.5 w-2.5 text-white" aria-hidden />
                    </span>
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-600">
                      <Mail className="h-2.5 w-2.5 text-white" aria-hidden />
                    </span>
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-500">
                      <MessageCircle className="h-2.5 w-2.5 text-white" aria-hidden />
                    </span>
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#1877F2]">
                      <FacebookIcon className="h-2.5 w-2.5 text-white" />
                    </span>
                  </div>

                  <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-fg-faint">Schedule</p>
                  <p className="mb-3 text-[10.5px] text-fg-muted">May 10, 2025 at 10:00 AM</p>

                  <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-fg-faint">Goal</p>
                  <p className="mb-3 text-[10.5px] text-fg-muted">Increase repeat sales</p>

                  <span className="block rounded-md bg-primary px-3 py-2 text-center text-[11px] font-semibold text-primary-foreground">
                    Launch Campaign
                  </span>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="w-[150px] rounded-md border border-border bg-white p-3 shadow-[0_20px_45px_-25px_rgba(13,21,18,0.35)]">
                    <span className="mb-2 flex h-7 w-7 items-center justify-center rounded-md bg-amber-500">
                      <MessageCircle className="h-3.5 w-3.5 text-white" aria-hidden />
                    </span>
                    <p className="text-[11.5px] font-semibold text-fg">SMS Campaign</p>
                    <p className="mt-1.5 text-[9.5px] text-fg-faint">Click Rate</p>
                    <p className="text-[13px] font-bold text-fg">28%</p>
                  </div>
                  <div className="w-[150px] rounded-md border border-border bg-white p-3 shadow-[0_20px_45px_-25px_rgba(13,21,18,0.35)]">
                    <span className="mb-2 flex h-7 w-7 items-center justify-center rounded-md bg-rose-500">
                      <Image src="/brand/instagram.png" alt="" width={14} height={14} className="object-contain" />
                    </span>
                    <p className="text-[11.5px] font-semibold text-fg">Social Media Post</p>
                    <p className="mt-1.5 text-[9.5px] text-fg-faint">Engagement</p>
                    <p className="text-[13px] font-bold text-fg">3.6%</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Capabilities */}
        <section id="capabilities" className="px-5 pb-8 sm:px-7">
          <div className="mx-auto max-w-[1560px] rounded-md bg-surface-deep px-6 py-8 sm:px-10">
            <h2 className="mb-6 text-center text-[16px] font-semibold text-fg-on-deep">Everything you need to run powerful campaigns</h2>
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
              {CAPABILITIES.map((c) => (
                <div key={c.title} className="flex flex-col items-center text-center">
                  <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10">
                    <c.icon className="h-5 w-5 text-accent-on-deep" aria-hidden />
                  </span>
                  <p className="mb-1 text-[12.5px] font-semibold text-fg-on-deep">{c.title}</p>
                  <p className="text-[11px] leading-relaxed text-fg-on-deep-muted">{c.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Smarter way to run campaigns */}
        <section className="px-5 pb-8 sm:px-7">
          <div className="mx-auto grid max-w-[1560px] grid-cols-1 gap-10 rounded-md border border-border bg-surface-2 p-6 sm:p-8 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">From Idea to Impact</p>
              <h2 className="mb-2 text-balance font-display text-[24px] font-bold leading-[1.2] tracking-tight text-fg">
                A Smarter Way to Run Campaigns
              </h2>
              <p className="mb-6 max-w-[42ch] text-[13.5px] leading-relaxed text-fg-muted">
                Noxtill makes every step simple, connected and measurable.
              </p>
              <div className="relative flex flex-col gap-5">
                <div className="absolute bottom-4 left-4 top-4 border-l border-dashed border-border-strong" aria-hidden />
                {BUILD_STEPS.map((s, i) => (
                  <div key={s.title} className="relative flex items-start gap-3">
                    <span
                      className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[13px] font-bold text-white"
                      style={{ backgroundColor: STEP_COLORS[i] }}
                    >
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-[13.5px] font-semibold text-fg">{s.title}</p>
                      <p className="text-[12px] leading-relaxed text-fg-muted">{s.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-border bg-white p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[14px] font-semibold text-fg">Campaign Builder</p>
                <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md text-fg-faint">
                    <Monitor className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span className="flex h-6 w-6 items-center justify-center rounded-md border border-accent bg-[#e3fbf1] text-accent">
                    <Smartphone className="h-3.5 w-3.5" aria-hidden />
                  </span>
                </div>
              </div>

              <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border pb-3 text-[11.5px] font-medium">
                {["Goal", "Audience", "Content", "Schedule", "Review"].map((tab, i) => (
                  <span
                    key={tab}
                    className={`flex items-center gap-1.5 pb-3 -mb-3 ${i === 2 ? "border-b-2 border-accent text-accent" : "text-fg-faint"}`}
                  >
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold ${
                        i === 2 ? "bg-accent text-white" : "border border-border-strong text-fg-faint"
                      }`}
                    >
                      {i + 1}
                    </span>
                    {tab}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_auto]">
                <div className="rounded-md border border-border p-3">
                  <p className="mb-2 text-[10.5px] font-semibold text-fg">Email Template</p>
                  <div
                    className="relative overflow-hidden rounded-md"
                    style={{ background: "linear-gradient(135deg, #0ea86a, #053b2a)" }}
                  >
                    <div className="relative p-3 text-white">
                      <p className="text-[11px] font-semibold">Exclusive Offer Just for You! 🎉</p>
                      <div className="mt-2 flex items-end justify-between gap-2">
                        <p className="font-display text-[20px] font-bold leading-tight">
                          SUMMER
                          <br />
                          SALE
                        </p>
                        <span className="flex h-11 w-11 flex-none flex-col items-center justify-center rounded-full bg-white/15 text-center text-[8px] font-bold leading-tight">
                          UP TO
                          <br />
                          30%
                          <br />
                          OFF
                        </span>
                      </div>
                      <span className="mt-2 inline-block rounded-md bg-[#0a0a0a] px-2.5 py-1 text-[9.5px] font-semibold">Shop Now</span>
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] leading-snug text-fg-muted">
                    Hi {"{first_name}"}, Summer is here! Enjoy up to 30% off on best-selling products. Limited time only!
                  </p>
                  <div className="mt-2.5 flex items-center gap-1.5">
                    {[FacebookIcon, InstagramGlyph, TwitterIcon, YoutubeIcon].map((Glyph, i) => (
                      <span key={i} className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-2 text-fg-faint">
                        <Glyph className="h-2.5 w-2.5" />
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-md border border-border p-3">
                  <p className="mb-2 text-[10.5px] font-semibold text-fg">Message Preview</p>
                  <div className="mb-2 flex items-center gap-1.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#25D366]">
                      <MessageCircle className="h-2.5 w-2.5 text-white" aria-hidden />
                    </span>
                    <span className="text-[10px] font-medium text-fg">Noxtill Store</span>
                  </div>
                  <div className="rounded-md bg-[#e3fbf1] p-2.5 text-[10px] leading-relaxed text-fg">
                    Hi {"{first_name}"}! 🎉 Enjoy up to 30% OFF on our best-selling products.
                    <br />
                    <br />
                    Hurry, offer ends soon!
                    <br />
                    <br />
                    Shop now: <span className="text-accent underline">noxtill.link/sale</span>
                    <div className="mt-1 text-right text-[8.5px] text-fg-faint">10:30 AM ✓✓</div>
                  </div>
                </div>

                <div className="mx-auto w-[130px] flex-none rounded-[22px] border-[6px] border-[#1a1a1a] bg-[#1a1a1a] p-1">
                  <span className="absolute left-1/2 top-1.5 z-10 hidden h-2.5 w-10 -translate-x-1/2 rounded-full bg-[#1a1a1a]" aria-hidden />
                  <div className="overflow-hidden rounded-[17px] bg-white">
                    <div className="flex items-center justify-between px-2 pt-1.5 text-[7px] font-semibold text-fg">
                      <span>9:41</span>
                      <span>●●●</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-1.5">
                      <ChevronLeft className="h-2.5 w-2.5 text-fg" aria-hidden />
                      <div className="relative h-4 w-4 flex-none overflow-hidden rounded-full">
                        <Image
                          src="https://images.unsplash.com/photo-1573496527892-904f897eb744?w=40&q=80&auto=format&fit=crop"
                          alt=""
                          fill
                          sizes="16px"
                          className="object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[7px] font-semibold text-fg">noxtill.store</p>
                        <p className="text-[6px] text-fg-faint">Sponsored</p>
                      </div>
                      <span className="text-[9px] text-fg-faint">⋯</span>
                    </div>
                    <div
                      className="relative flex h-24 items-end overflow-hidden p-2 text-white"
                      style={{ background: "linear-gradient(135deg, #0ea86a, #053b2a)" }}
                    >
                      <span className="absolute -bottom-2 -left-2 text-[26px]">🌿</span>
                      <span className="absolute -bottom-3 -right-3 text-[30px]">🌿</span>
                      <div className="relative">
                        <p className="font-display text-[13px] font-bold leading-none">SUMMER</p>
                        <p className="font-display text-[13px] font-bold leading-none">SALE</p>
                        <p className="mt-1 text-[7px] font-semibold">UP TO 30% OFF</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between bg-[#1877F2] px-2 py-1 text-[7.5px] font-semibold text-white">
                      Shop Now <ChevronRight className="h-2.5 w-2.5" aria-hidden />
                    </div>
                    <div className="flex items-center justify-between px-2 pt-1.5 text-fg-faint">
                      <div className="flex items-center gap-1.5">
                        <Heart className="h-2.5 w-2.5" aria-hidden />
                        <MessageSquare className="h-2.5 w-2.5" aria-hidden />
                        <Send className="h-2.5 w-2.5" aria-hidden />
                      </div>
                      <Bookmark className="h-2.5 w-2.5" aria-hidden />
                    </div>
                    <div className="px-2 pb-1.5 pt-1">
                      <p className="text-[6.5px] font-semibold text-fg">125 likes</p>
                      <p className="text-[6px] leading-tight text-fg-muted">
                        <span className="font-semibold text-fg">noxtill.store</span> Don&apos;t miss our biggest sale of the season! 🔥
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Performance */}
        <section className="px-5 pb-8 sm:px-7">
          <div className="mx-auto grid max-w-[1560px] grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-md border border-border bg-white p-5">
              <p className="mb-4 text-[13.5px] font-semibold text-fg">Campaign Performance</p>
              <div className="mb-4 grid grid-cols-3 gap-3 sm:grid-cols-5">
                {[
                  { value: "24,510", label: "Sent", delta: "↑ 10.6%" },
                  { value: "42.7%", label: "Open Rate", delta: "↑ 12.4%" },
                  { value: "15.3%", label: "Click Rate", delta: "↑ 9.8%" },
                  { value: "2,451", label: "Conversions", delta: "↑ 22.1%" },
                  { value: "$18,742", label: "Revenue", delta: "↑ 25.7%" },
                ].map((s) => (
                  <div key={s.label}>
                    <p className="text-[15px] font-bold text-fg">{s.value}</p>
                    <p className="text-[9.5px] text-fg-faint">{s.label}</p>
                    <p className="mt-0.5 text-[9px] text-accent">{s.delta}</p>
                  </div>
                ))}
              </div>
              <svg viewBox="0 0 300 90" className="w-full" preserveAspectRatio="none" aria-hidden>
                <path d="M0,55 L60,50 L120,58 L180,42 L240,48 L300,35" fill="none" stroke="#0ea86a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M0,68 L60,65 L120,70 L180,60 L240,64 L300,55" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="mt-1 flex justify-between text-[9px] text-fg-faint">
                <span>Apr 27</span>
                <span>May 4</span>
                <span>May 11</span>
                <span>May 18</span>
                <span>May 25</span>
              </div>
            </div>

            <div className="rounded-md border border-border bg-white p-5">
              <p className="mb-4 text-[13.5px] font-semibold text-fg">Channel Performance</p>
              <div className="mb-2 flex items-center justify-between text-[9.5px] font-medium text-fg-faint">
                <span>Channel</span>
                <div className="flex gap-8">
                  <span>Open Rate</span>
                  <span>Click Rate</span>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                {CHANNEL_PERFORMANCE.map((c) => (
                  <div key={c.label} className="flex items-center gap-3">
                    {c.logo ? (
                      <Image src={c.logo} alt={c.label} width={18} height={18} className="flex-none object-contain" />
                    ) : (
                      <span className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-[#1877F2]">
                        <FacebookIcon className="h-2.5 w-2.5 text-white" />
                      </span>
                    )}
                    <span className="w-16 flex-none text-[11px] text-fg-muted">{c.label}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full" style={{ width: `${c.open}%`, backgroundColor: c.color }} />
                    </div>
                    <span className="w-10 flex-none text-right text-[11px] font-medium text-fg">{c.open}%</span>
                    <span className="w-10 flex-none text-right text-[11px] font-medium text-fg">{c.click}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Templates */}
        <section className="px-5 pb-8 sm:px-7">
          <div className="mx-auto max-w-[1560px]">
            <h2 className="mb-1 text-balance font-display text-[22px] font-bold leading-[1.2] tracking-tight text-fg">
              Campaign Templates That Get Results
            </h2>
            <p className="mb-6 max-w-[52ch] text-[13.5px] leading-relaxed text-fg-muted">
              Use our proven templates or create your own in minutes.
            </p>
            <div className="flex flex-wrap gap-4">
              {TEMPLATES.map((t) => (
                <div key={t.title} className="min-w-[150px] flex-1 basis-[180px] rounded-md border border-border bg-white p-4">
                  <span className={`mb-3 flex h-9 w-9 items-center justify-center rounded-md ${t.tint}`}>
                    <t.icon className={`h-[18px] w-[18px] ${t.color}`} aria-hidden />
                  </span>
                  <p className="mb-1 text-[13px] font-semibold text-fg">{t.title}</p>
                  <p className="text-[11px] leading-relaxed text-fg-muted">{t.description}</p>
                </div>
              ))}
              <Link
                href="/product"
                className="flex min-w-[150px] flex-1 basis-[180px] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border-strong bg-surface-2 p-4 text-center text-[12.5px] font-medium text-primary hover:border-accent"
              >
                View All Templates <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
        </section>

        {/* Automation + testimonial */}
        <section className="px-5 pb-8 sm:px-7">
          <div className="mx-auto flex max-w-[1560px] flex-wrap gap-6">
            <div className="min-w-[280px] flex-[1.6] basis-[560px] rounded-md border border-border bg-surface-2 p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-x-10 gap-y-6">
                <div className="min-w-[200px] max-w-[240px] flex-none">
                  <h2 className="mb-1 text-balance font-display text-[20px] font-bold leading-[1.2] tracking-tight text-fg">
                    Smart Automation. Better Results.
                  </h2>
                  <p className="mb-5 text-[12.5px] leading-relaxed text-fg-muted">
                    Set up once and let Noxtill handle the rest. Send the right message at the right time — automatically.
                  </p>
                  <Link href="/book-a-demo" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-[12.5px] font-semibold text-primary-foreground hover:bg-primary-hover">
                    Explore Automations <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-1 overflow-x-auto pb-1">
                    {AUTOMATION_FLOW.map((step, i) => (
                      <div key={step.label} className="flex flex-none items-start gap-1">
                        <div className="flex w-[64px] flex-none flex-col items-center gap-1 text-center">
                          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-primary">
                            <step.icon className="h-[18px] w-[18px] text-primary-foreground" aria-hidden />
                          </span>
                          <p className="text-[10px] font-medium leading-tight text-fg">{step.label}</p>
                        </div>
                        {i < AUTOMATION_FLOW.length - 1 ? (
                          <ArrowRight className="mt-3.5 h-3.5 w-3.5 flex-none text-border-strong" aria-hidden />
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 flex items-center gap-3">
                    <span className="h-px flex-1 border-t border-dashed border-border-strong" />
                    <span className="flex-none text-[11.5px] font-medium text-primary">+ Many more pre-built automations</span>
                    <span className="h-px flex-1 border-t border-dashed border-border-strong" />
                  </div>
                </div>
              </div>
            </div>

            <div className="relative min-w-[240px] flex-1 basis-[300px] overflow-hidden rounded-md border border-border bg-white p-5">
              <Quote className="absolute left-3 top-3 h-6 w-6 text-border-strong" aria-hidden />
              <p className="relative mb-3 text-[13.5px] italic leading-relaxed text-fg-muted">&ldquo;{page.pullQuote}&rdquo;</p>
              <div className="mb-3 flex items-center gap-2.5">
                <div className="relative h-9 w-9 flex-none overflow-hidden rounded-full">
                  <Image
                    src="https://images.unsplash.com/photo-1758876019338-c190822f6ca0?w=120&q=80&auto=format&fit=crop"
                    alt="Ayesha Khan, Marketing Manager at UrbanFit"
                    fill
                    sizes="36px"
                    className="object-cover"
                  />
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-fg">Ayesha Khan</p>
                  <p className="text-[10.5px] text-fg-faint">Marketing Manager, UrbanFit</p>
                </div>
              </div>
              <div className="flex justify-end gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === 1 ? "bg-accent" : "bg-border-strong"}`} />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="relative overflow-hidden bg-surface-deep px-5 py-7 sm:px-7 sm:py-8">
          <div className="relative mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-8">
            <div className="flex items-start gap-4 min-w-[280px] flex-1 basis-[500px]">
              <span className="flex h-12 w-12 flex-none items-center justify-center rounded-md bg-white/10">
                <TrendingUp className="h-6 w-6 text-accent-on-deep" aria-hidden />
              </span>
              <div>
                <h2 className="mb-2 text-balance font-display text-[22px] font-bold leading-[1.2] tracking-tight text-fg-on-deep">
                  Better campaigns. Stronger relationships. More sales.
                </h2>
                <p className="mb-4 max-w-[48ch] text-[13px] leading-relaxed text-fg-on-deep-muted">
                  Start creating high-performing campaigns with Noxtill today.
                </p>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {CLOSING_CHECKLIST.map((c) => (
                    <div key={c} className="flex items-center gap-2 text-[12px] text-fg-on-deep-muted">
                      <CheckCircle2 className="h-3.5 w-3.5 flex-none text-accent-on-deep" aria-hidden />
                      {c}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/book-a-demo"
                className="inline-flex items-center gap-2 rounded-md bg-white px-5.5 py-3 text-[14px] font-semibold text-[#053b2a] transition-colors hover:bg-[#e6f5ee]"
              >
                Start Free Trial <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/book-a-demo"
                className="inline-flex items-center rounded-md border border-border-on-deep px-5.5 py-3 text-[14px] font-medium text-fg-on-deep transition-colors hover:border-fg-on-deep-muted"
              >
                Book a Demo
              </Link>
            </div>
          </div>
        </section>


      </main>

      <SiteFooter />
    </div>
  );
}

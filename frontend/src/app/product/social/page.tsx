import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FlaskConical,
  Megaphone,
  MessageSquare,
  PenTool,
  PlayCircle,
  Sparkles,
  Target,
  TrendingUp,
  Workflow,
} from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { DetailRelated } from "@/components/site/detail-page-sections";
import { findProductDetailPage } from "@/lib/marketing/product-detail-content";

const page = findProductDetailPage("social")!;

export const metadata: Metadata = {
  title: page.metaTitle,
  description: page.metaDescription,
  alternates: { canonical: "https://noxtill.com/product/social/" },
  openGraph: {
    type: "website",
    url: "https://noxtill.com/product/social/",
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
        { "@type": "ListItem", position: 3, name: "Social & Advertising", item: "https://noxtill.com/product/social/" },
      ],
    },
    {
      "@type": "Article",
      headline: page.metaTitle,
      description: page.metaDescription,
      url: "https://noxtill.com/product/social/",
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

function XIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function PinterestIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 0a12 12 0 0 0-4.373 23.178c-.035-.947-.008-2.086.207-3.117.231-1.096 1.545-6.552 1.545-6.552s-.394-.789-.394-1.955c0-1.831 1.062-3.199 2.384-3.199 1.125 0 1.667.844 1.667 1.856 0 1.13-.72 2.821-1.091 4.39-.31 1.312.658 2.382 1.951 2.382 2.342 0 4.142-2.469 4.142-6.032 0-3.155-2.267-5.361-5.505-5.361-3.751 0-5.952 2.814-5.952 5.72 0 1.133.436 2.348 0.981 3.007a.395.395 0 0 1 .091.378c-.1.416-.32 1.313-.365 1.497-.058.242-.19.293-.439.177-1.638-.762-2.663-3.155-2.663-5.078 0-4.135 3.004-7.933 8.66-7.933 4.548 0 8.083 3.24 8.083 7.569 0 4.516-2.848 8.152-6.802 8.152-1.328 0-2.577-.69-3.003-1.507l-.817 3.113c-.296 1.14-1.096 2.567-1.632 3.438A12 12 0 1 0 12 0z" />
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

const CAPABILITIES = [
  { icon: PenTool, title: "Content Creation", description: "Design stunning posts in minutes." },
  { icon: CalendarDays, title: "Post Scheduling", description: "Plan and schedule across all platforms." },
  { icon: Megaphone, title: "Ad Campaigns", description: "Run and manage ads that deliver results." },
  { icon: Target, title: "Audience Targeting", description: "Reach the right people with smart targeting." },
  { icon: Sparkles, title: "AI Optimization", description: "Get AI insights to improve performance." },
  { icon: BarChart3, title: "Reports & Analytics", description: "Track, measure and grow your ROI." },
];

const CAMPAIGNS = [
  { name: "Summer Sale Campaign", emoji: "🌞", platforms: ["facebook", "instagram"], objective: "Sales", status: "Active", budget: "$1,500.00", results: "328 Sales", roas: "4.21x" },
  { name: "New Collection Launch", emoji: "✨", platforms: ["tiktok"], objective: "Conversions", status: "Active", budget: "$1,200.00", results: "214 Sales", roas: "3.89x" },
  { name: "Brand Awareness May", emoji: "", platforms: ["facebook", "instagram"], objective: "Awareness", status: "Active", budget: "$800.00", results: "152,430 Reach", roas: "—" },
  { name: "Remarketing Campaign", emoji: "", platforms: ["google"], objective: "Leads", status: "Paused", budget: "$950.00", results: "46 Leads", roas: "2.15x" },
];

const SNAPSHOT_STATS = [
  { label: "Impressions", value: "1.25M", delta: "↑ 22.7%", color: "#7c3aed" },
  { label: "Clicks", value: "24,532", delta: "↑ 18.4%", color: "#2563eb" },
  { label: "Engagement Rate", value: "4.38%", delta: "↑ 9.6%", color: "#0ea86a" },
  { label: "Cost per Result", value: "$6.72", delta: "↓ 12.5%", color: "#e8a93c" },
  { label: "Conversions", value: "1,253", delta: "↑ 21.9%", color: "#7c3aed" },
  { label: "ROAS", value: "4.21x", delta: "↑ 19.3%", color: "#0891b2" },
];

const AUDIENCE_SEGMENTS = [
  { label: "Existing Customers", value: 36, color: "#0ea86a" },
  { label: "Website Visitors", value: 28, color: "#2563eb" },
  { label: "Lookalike Audience", value: 20, color: "#7c3aed" },
  { label: "Engaged Users", value: 16, color: "#db2777" },
];

const PLATFORM_ADS = [
  { facebook: true, label: "Facebook Pages", sub: "Feed & Stories" },
  { logo: "/brand/instagram.png", label: "Instagram", sub: "Feed & Stories" },
  { logo: "/brand/tiktok.png", label: "TikTok", sub: "Ads" },
  { logo: "/brand/google.png", label: "Google Ads", sub: "Search & Display" },
  { youtube: true, label: "YouTube", sub: "Ads" },
  { logo: "/brand/linkedin.png", label: "LinkedIn", sub: "Ads" },
  { x: true, label: "Twitter / X", sub: "Tweets" },
  { pinterest: true, label: "Pinterest", sub: "Ads" },
  { icon: MessageSquare, label: "And More", sub: "Coming Soon" },
];

const AUTOMATIONS = [
  { icon: Workflow, title: "Automations", description: "Auto-publish, auto-boost and create workflows that save you time." },
  { icon: FlaskConical, title: "A/B Testing", description: "Test ad creatives, audiences and placements to find what works." },
  { icon: TrendingUp, title: "Budget Optimization", description: "AI automatically shifts budget to your best-performing campaigns." },
  { icon: ClipboardList, title: "Custom Reports", description: "Build custom reports and schedule them to be delivered to you." },
];

const CLOSING_CHECKLIST = ["14-day free trial", "No credit card required", "Cancel anytime"];

export default function SocialAdvertisingPage() {
  return (
    <div data-theme="light" className="flex min-h-dvh flex-col bg-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />

      <main className="flex-1">
        <nav aria-label="Breadcrumb" className="mx-auto max-w-[1560px] px-5 pt-5 text-[12.5px] text-fg-faint sm:px-7">
          <Link href="/" className="hover:text-fg-muted">
            Home
          </Link>{" "}
          ›{" "}
          <Link href="/product" className="hover:text-fg-muted">
            Product
          </Link>{" "}
          › <span className="text-fg-muted">Social & Advertising</span>
        </nav>

        {/* Hero */}
        <section className="relative px-5 pb-16 pt-8 sm:px-7 sm:pb-20">
          <div className="mx-auto flex max-w-[1560px] flex-wrap items-center gap-x-14 gap-y-12">
            <div className="min-w-[280px] max-w-[460px] flex-1 basis-[400px]">
              <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">Social & Advertising</p>
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

            <div className="relative min-w-[320px] flex-[1.5] basis-[560px]">
              <div
                className="pointer-events-none absolute inset-0 -z-10"
                style={{ background: "radial-gradient(45% 45% at 50% 45%, rgba(14,168,106,0.1), transparent 70%)" }}
                aria-hidden
              />
              <div className="rounded-md border border-border bg-white p-4 shadow-[0_24px_60px_-30px_rgba(13,21,18,0.4)]">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[0.7fr_2fr_0.9fr]">
                  <div className="flex flex-col gap-0.5 rounded-md border border-border p-2 text-[10.5px]">
                    {["Overview", "Campaigns", "Calendar", "Content", "Ads Manager", "Reports", "Audience", "Automations", "Settings"].map((n, i) => (
                      <div key={n} className={`rounded-md px-2 py-1 ${i === 0 ? "bg-[#e3fbf1] font-medium text-accent" : "text-fg-muted"}`}>
                        {n}
                      </div>
                    ))}
                  </div>

                  <div>
                    <div className="mb-2 flex justify-end">
                      <span className="rounded-md border border-border px-2 py-1 text-[9.5px] text-fg-muted">May 1 – May 31, 2025</span>
                    </div>
                    <div className="mb-3 grid grid-cols-3 gap-2">
                      {[
                        { label: "Total Spend", value: "$8,432.71", delta: "↑ 18.6%" },
                        { label: "Reach", value: "152,430", delta: "↑ 24.3%" },
                        { label: "Engagements", value: "16,823", delta: "↑ 27.8%" },
                      ].map((s) => (
                        <div key={s.label} className="rounded-md border border-border p-2">
                          <p className="text-[9px] text-fg-faint">{s.label}</p>
                          <p className="text-[13px] font-bold text-fg">{s.value}</p>
                          <p className="text-[8.5px] text-accent">{s.delta}</p>
                        </div>
                      ))}
                    </div>
                    <p className="mb-1 text-[10px] font-semibold text-fg">Performance Overview</p>
                    <svg viewBox="0 0 300 90" className="w-full" preserveAspectRatio="none" aria-hidden>
                      <path d="M0,25 L50,40 L100,20 L150,32 L200,15 L250,28 L300,10" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M0,50 L50,58 L100,45 L150,55 L200,42 L250,52 L300,38" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M0,75 L50,78 L100,72 L150,76 L200,68 L250,73 L300,64" fill="none" stroke="#0ea86a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <div className="flex justify-between text-[8px] text-fg-faint">
                      <span>May 1</span>
                      <span>May 6</span>
                      <span>May 11</span>
                      <span>May 16</span>
                      <span>May 21</span>
                      <span>May 26</span>
                      <span>May 31</span>
                    </div>
                  </div>

                  <div className="rounded-md border border-border p-2.5">
                    <p className="mb-2 text-[10px] font-semibold text-fg">Top Platforms</p>
                    <div className="flex flex-col gap-2">
                      {[
                        { facebook: true, label: "Facebook", value: "32%" },
                        { logo: "/brand/instagram.png", label: "Instagram", value: "24%" },
                        { logo: "/brand/google.png", label: "Google Ads", value: "20%" },
                        { logo: "/brand/tiktok.png", label: "TikTok", value: "14%" },
                        { logo: "/brand/linkedin.png", label: "LinkedIn", value: "10%" },
                      ].map((p) => (
                        <div key={p.label} className="flex items-center gap-1.5 text-[10px]">
                          {p.facebook ? (
                            <span className="flex h-3.5 w-3.5 flex-none items-center justify-center rounded-full bg-[#1877F2]">
                              <FacebookIcon className="h-2 w-2 text-white" />
                            </span>
                          ) : (
                            <Image src={p.logo!} alt="" width={14} height={14} className="flex-none object-contain" />
                          )}
                          <span className="flex-1 text-fg-muted">{p.label}</span>
                          <span className="font-medium text-fg">{p.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Capabilities */}
        <section id="capabilities" className="px-5 pb-16 sm:px-7">
          <div className="mx-auto max-w-[1560px] rounded-md bg-surface-deep px-6 py-8 sm:px-10">
            <h2 className="mb-6 text-center text-[16px] font-semibold text-fg-on-deep">Everything you need to power your social media & advertising</h2>
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

        {/* Manage every campaign */}
        <section className="px-5 pb-16 sm:px-7">
          <div className="mx-auto grid max-w-[1560px] grid-cols-1 gap-6 lg:grid-cols-[0.7fr_1.6fr]">
            <div>
              <h2 className="mb-2 text-balance font-display text-[22px] font-bold leading-[1.2] tracking-tight text-fg">Manage Every Campaign From One Place</h2>
              <p className="mb-4 max-w-[42ch] text-[13px] leading-relaxed text-fg-muted">
                Create, manage and monitor all your campaigns across social media and advertising platforms.
              </p>
              <Link href="/book-a-demo" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-primary hover:underline">
                View all campaigns <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>

            <div className="rounded-md border border-border bg-white p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] font-medium">
                  <span className="border-b-2 border-accent pb-1 text-accent">All Campaigns</span>
                  <span className="pb-1 text-fg-faint">Active</span>
                  <span className="pb-1 text-fg-faint">Scheduled</span>
                  <span className="pb-1 text-fg-faint">Completed</span>
                  <span className="pb-1 text-fg-faint">Drafts</span>
                </div>
                <Link href="/book-a-demo" className="rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary-hover">
                  + New Campaign
                </Link>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="text-fg-faint">
                      <th className="pb-2 font-medium">Campaign Name</th>
                      <th className="pb-2 font-medium">Platform</th>
                      <th className="pb-2 font-medium">Objective</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium">Budget</th>
                      <th className="pb-2 font-medium">Results</th>
                      <th className="pb-2 font-medium">ROAS</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {CAMPAIGNS.map((c) => (
                      <tr key={c.name}>
                        <td className="whitespace-nowrap py-2.5 pr-3 font-medium text-fg">
                          {c.name} {c.emoji}
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-1">
                            {c.platforms.includes("facebook") ? (
                              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#1877F2]">
                                <FacebookIcon className="h-2 w-2 text-white" />
                              </span>
                            ) : null}
                            {c.platforms.includes("instagram") ? <Image src="/brand/instagram.png" alt="" width={16} height={16} className="object-contain" /> : null}
                            {c.platforms.includes("tiktok") ? <Image src="/brand/tiktok.png" alt="" width={16} height={16} className="object-contain" /> : null}
                            {c.platforms.includes("google") ? <Image src="/brand/google.png" alt="" width={16} height={16} className="object-contain" /> : null}
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 text-fg-muted">{c.objective}</td>
                        <td className="py-2.5 pr-3">
                          <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-medium ${c.status === "Active" ? "bg-[#e3fbf1] text-accent" : "bg-amber-50 text-amber-700"}`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-fg-muted">{c.budget}</td>
                        <td className="py-2.5 pr-3 text-fg-muted">{c.results}</td>
                        <td className="py-2.5 pr-3 font-medium text-fg">{c.roas}</td>
                        <td className="py-2.5 text-fg-faint">⋯</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* Performance snapshot */}
        <section className="px-5 pb-16 sm:px-7">
          <div className="mx-auto max-w-[1560px] rounded-md border border-border bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[14px] font-semibold text-fg">Performance Snapshot</p>
              <span className="rounded-md border border-border px-2 py-1 text-[10.5px] text-fg-muted">This Month</span>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {SNAPSHOT_STATS.map((s) => (
                <div key={s.label} className="rounded-md border border-border p-3">
                  <p className="mb-1 text-[10px] text-fg-faint">{s.label}</p>
                  <p className="mb-1 text-[16px] font-bold text-fg">{s.value}</p>
                  <p className="mb-2 text-[9.5px]" style={{ color: s.delta.startsWith("↓") ? "#e8a93c" : "#0ea86a" }}>
                    {s.delta}
                  </p>
                  <svg viewBox="0 0 100 30" className="w-full" preserveAspectRatio="none" aria-hidden>
                    <path d="M0,22 L20,18 L40,20 L60,10 L80,14 L100,6" fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Audience + AI content + best time */}
        <section className="px-5 pb-16 sm:px-7">
          <div className="mx-auto grid max-w-[1560px] grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-md border border-border bg-white p-5">
              <h2 className="mb-1 text-[14px] font-bold text-fg">Smart Audience Targeting</h2>
              <p className="mb-4 text-[11.5px] leading-relaxed text-fg-muted">Find, segment and reach the right audience to get better results.</p>
              <div className="relative mx-auto mb-4 h-32 w-32">
                <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="#eceeed" strokeWidth="5" />
                  {(() => {
                    const gap = 1.6;
                    let offset = 0;
                    return AUDIENCE_SEGMENTS.map((seg) => {
                      const dash = (seg.value / 100) * 100 - gap;
                      const circle = (
                        <circle
                          key={seg.label}
                          cx="18"
                          cy="18"
                          r="15.5"
                          fill="none"
                          stroke={seg.color}
                          strokeWidth="5"
                          strokeLinecap="round"
                          strokeDasharray={`${dash} ${100 - dash}`}
                          strokeDashoffset={-offset}
                        />
                      );
                      offset += seg.value;
                      return circle;
                    });
                  })()}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[17px] font-bold text-fg">128,540</span>
                  <span className="text-[8.5px] text-fg-faint">Total Audience</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 text-[11px]">
                {AUDIENCE_SEGMENTS.map((seg) => (
                  <div key={seg.label} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-fg-muted">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: seg.color }} /> {seg.label}
                    </span>
                    <span className="font-medium text-fg">{seg.value}%</span>
                  </div>
                ))}
              </div>
              <Link href="/book-a-demo" className="mt-3 inline-block text-[11.5px] font-medium text-primary hover:underline">
                Manage Audiences →
              </Link>
            </div>

            <div className="rounded-md border border-border bg-white p-5">
              <h2 className="mb-1 text-[14px] font-bold text-fg">AI Content & Ad Creation</h2>
              <p className="mb-4 text-[11.5px] leading-relaxed text-fg-muted">Generate high-converting content and ad variations that connect with your audience.</p>
              <div className="mb-4 grid grid-cols-3 gap-2">
                <div className="relative h-28 overflow-hidden rounded-md">
                  <Image
                    src="https://images.unsplash.com/photo-1758876019338-c190822f6ca0?w=200&q=80&auto=format&fit=crop"
                    alt=""
                    fill
                    sizes="100px"
                    className="object-cover"
                  />
                  <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(5,59,42,0.75), transparent 55%)" }} />
                  <div className="absolute inset-x-0 bottom-0 p-2 text-white">
                    <p className="text-[10px] font-bold leading-tight">NEW</p>
                    <p className="text-[10px] font-bold leading-tight">ARRIVAL</p>
                  </div>
                </div>
                <div className="relative h-28 overflow-hidden rounded-md">
                  <Image
                    src="https://images.unsplash.com/photo-1705579607707-717fb965145f?w=200&q=80&auto=format&fit=crop"
                    alt=""
                    fill
                    sizes="100px"
                    className="object-cover"
                  />
                  <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(11,31,77,0.75), transparent 55%)" }} />
                  <div className="absolute inset-x-0 bottom-0 p-2 text-white">
                    <p className="text-[10px] font-bold leading-tight">SUMMER</p>
                    <p className="text-[10px] font-bold leading-tight">SALE 30%</p>
                  </div>
                </div>
                <div className="relative h-28 overflow-hidden rounded-md">
                  <Image
                    src="https://images.unsplash.com/photo-1589386417686-0d34b5903d23?w=200&q=80&auto=format&fit=crop"
                    alt=""
                    fill
                    sizes="100px"
                    className="object-cover"
                  />
                  <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(5,59,42,0.7), transparent 55%)" }} />
                  <div className="absolute inset-x-0 bottom-0 p-2 text-white">
                    <p className="text-[10px] font-bold leading-tight">SUMMER</p>
                    <p className="text-[10px] font-bold leading-tight">SALE</p>
                  </div>
                </div>
              </div>
              <Link
                href="/book-a-demo"
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-[12px] font-semibold text-primary-foreground hover:bg-primary-hover"
              >
                Generate New Content <Sparkles className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>

            <div className="rounded-md border border-border bg-white p-5">
              <h2 className="mb-1 text-[14px] font-bold text-fg">Best Time to Post</h2>
              <p className="mb-4 text-[11.5px] leading-relaxed text-fg-muted">Reach more people when your audience is most active.</p>
              <div className="grid grid-cols-[auto_1fr] gap-1.5 text-[9px] text-fg-faint">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, di) => (
                  <div key={day} className="contents">
                    <span className="flex items-center pr-1">{day}</span>
                    <div className="grid grid-cols-6 gap-1">
                      {Array.from({ length: 6 }).map((_, hi) => {
                        const intensity = Math.max(0.08, Math.sin((hi + di) * 0.6) * 0.5 + 0.5);
                        return <span key={hi} className="h-4 rounded-sm" style={{ backgroundColor: `rgba(124,58,237,${intensity})` }} />;
                      })}
                    </div>
                  </div>
                ))}
                <span />
                <div className="grid grid-cols-6 gap-1 pt-0.5">
                  {["12 AM", "4 AM", "8 AM", "12 PM", "4 PM", "8 PM"].map((t) => (
                    <span key={t} className="text-center text-[7.5px]">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <Link href="/book-a-demo" className="mt-3 inline-block text-[11.5px] font-medium text-primary hover:underline">
                View Full Insights →
              </Link>
            </div>
          </div>
        </section>

        {/* Platform row */}
        <section className="px-5 pb-16 sm:px-7">
          <div className="mx-auto max-w-[1560px]">
            <h2 className="mb-6 text-center text-[16px] font-semibold text-fg">Manage and advertise across all major platforms</h2>
            <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
              {PLATFORM_ADS.map((p) => (
                <div key={p.label} className="flex flex-col items-center gap-2">
                  {p.logo ? (
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm">
                      <Image src={p.logo} alt="" width={22} height={22} className="object-contain" />
                    </span>
                  ) : p.facebook ? (
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1877F2]">
                      <FacebookIcon className="h-5 w-5 text-white" />
                    </span>
                  ) : p.youtube ? (
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FF0000]">
                      <YoutubeIcon className="h-5 w-5 text-white" />
                    </span>
                  ) : p.x ? (
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black">
                      <XIcon className="h-4.5 w-4.5 text-white" />
                    </span>
                  ) : p.pinterest ? (
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#E60023]">
                      <PinterestIcon className="h-5 w-5 text-white" />
                    </span>
                  ) : (
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-fg-muted">
                      {p.icon ? <p.icon className="h-5 w-5" aria-hidden /> : null}
                    </span>
                  )}
                  <div className="text-center">
                    <p className="text-[11.5px] font-medium text-fg">{p.label}</p>
                    <p className="text-[9.5px] text-fg-faint">{p.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Automations */}
        <section className="px-5 pb-16 sm:px-7">
          <div className="mx-auto grid max-w-[1560px] grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {AUTOMATIONS.map((a) => (
              <div key={a.title} className="flex items-start gap-3">
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-md bg-[#e3fbf1]">
                  <a.icon className="h-[18px] w-[18px] text-accent" aria-hidden />
                </span>
                <div>
                  <p className="mb-0.5 text-[13px] font-semibold text-fg">{a.title}</p>
                  <p className="text-[11.5px] leading-relaxed text-fg-muted">{a.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Closing CTA */}
        <section className="relative mt-4 overflow-hidden bg-surface-deep px-5 py-14 sm:px-7 sm:py-16">
          <div className="relative mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-8">
            <div className="flex items-start gap-4 min-w-[280px] flex-1 basis-[500px]">
              <span className="flex h-12 w-12 flex-none items-center justify-center rounded-md bg-white/10">
                <Target className="h-6 w-6 text-accent-on-deep" aria-hidden />
              </span>
              <div>
                <h2 className="mb-2 text-balance font-display text-[22px] font-bold leading-[1.2] tracking-tight text-fg-on-deep">
                  More reach. More engagement. Better results. All with Noxtill.
                </h2>
                <p className="mb-4 max-w-[48ch] text-[13px] leading-relaxed text-fg-on-deep-muted">
                  Create powerful campaigns. Connect with your audience. Grow your business.
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

        <DetailRelated heading="Related features" links={page.related} />

        <section className="px-5 pb-16 pt-14 text-center sm:px-7">
          <p className="text-sm text-fg-faint">
            Not the feature you were looking for?{" "}
            <Link href="/product" className="font-medium text-primary hover:underline">
              See every Noxtill feature
            </Link>
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

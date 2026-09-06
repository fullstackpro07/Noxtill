import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Box,
  Calendar,
  Check,
  ClipboardList,
  CreditCard,
  Eye,
  Megaphone,
  Moon,
  Package,
  Receipt,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { DetailRelated } from "@/components/site/detail-page-sections";
import { EcosystemStrip } from "@/components/site/ecosystem-strip";
import { findProductDetailPage } from "@/lib/marketing/product-detail-content";

const page = findProductDetailPage("nightly-close")!;

export const metadata: Metadata = {
  title: page.metaTitle,
  description: page.metaDescription,
  alternates: { canonical: "https://noxtill.com/product/nightly-close/" },
  openGraph: {
    type: "website",
    url: "https://noxtill.com/product/nightly-close/",
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
        { "@type": "ListItem", position: 3, name: "Nightly Close", item: "https://noxtill.com/product/nightly-close/" },
      ],
    },
    {
      "@type": "Article",
      headline: page.metaTitle,
      description: page.metaDescription,
      url: "https://noxtill.com/product/nightly-close/",
    },
  ],
};

const CLOSE_STATS = [
  { label: "Sales", value: "$18,650", delta: "↑ 12.4%" },
  { label: "Profit", value: "$3,420", delta: "↑ 8.7%" },
  { label: "Orders", value: "32", delta: "↑ 6" },
  { label: "Bookings", value: "18", delta: "↑ 4" },
  { label: "Payments", value: "$9,250", delta: "↑ 15.2%" },
  { label: "Credit Outstanding", value: "$6,840", delta: null },
];

const NEEDS_ATTENTION = ["2 customer balances need follow-up", "3 orders require action", "Inventory low on 4 items"];
const TOMORROW = ["8 upcoming bookings", "5 pending orders", "2 staff on leave"];

const MODULES = [
  { icon: Receipt, label: "Sales" },
  { icon: Package, label: "Orders" },
  { icon: Calendar, label: "Bookings" },
  { icon: Users, label: "Customers" },
  { icon: CreditCard, label: "Credit" },
  { icon: Wallet, label: "Payments" },
  { icon: Box, label: "Inventory" },
  { icon: UserCheck, label: "Staff" },
  { icon: Megaphone, label: "Marketing" },
  { icon: BarChart3, label: "Analytics" },
];

const SUMMARY_GROUPS = [
  {
    icon: BarChart3,
    title: "Sales & Revenue",
    description: "See how much business moved through your operation today, compared with previous days and trends.",
    chart: "bars" as const,
  },
  {
    icon: TrendingUp,
    title: "Profit & Performance",
    description: "Review profit, margin and other financial signals that help you understand the quality of today's business.",
    chart: "line" as const,
  },
  {
    icon: CreditCard,
    title: "Customers, Credit & Payments",
    description: "Know who paid, who still owes, and which customer accounts require your attention.",
    rows: [
      ["Outstanding Credit", "$6,840"],
      ["Payments Received", "$9,250"],
      ["New Customers", "12"],
    ],
  },
  {
    icon: Calendar,
    title: "Bookings, Orders & Operations",
    description: "See completed bookings, active orders, inventory alerts and operational updates.",
    rows: [
      ["Pending Orders", "5"],
      ["Low Stock Items", "4"],
      ["Completed Bookings", "18"],
    ],
  },
];

const QUESTIONS = [
  { icon: BarChart3, text: "How much did we sell today?" },
  { icon: Wallet, text: "What did we actually earn?" },
  { icon: Users, text: "Who still owes us money?" },
  { icon: ClipboardList, text: "Which orders need attention?" },
  { icon: Calendar, text: "What bookings are coming tomorrow?" },
  { icon: Sparkles, text: "Did anything unusual happen today?" },
  { icon: Eye, text: "What should I look at before I go home?" },
];

const BUSINESS_TYPES = [
  {
    title: "Retail Stores",
    description: "Close the shop knowing what sold, what remains, what was paid and which issues need attention.",
    image: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&q=80&auto=format&fit=crop",
  },
  {
    title: "Service Businesses",
    description: "Review completed bookings, payments, customer activity and tomorrow's appointments.",
    image: "https://images.unsplash.com/photo-1746723375184-5f537d2e6f31?w=800&q=80&auto=format&fit=crop",
  },
  {
    title: "E-commerce Businesses",
    description: "Bring orders, payments, sales and operational signals into one clear end-of-day picture.",
    image: "https://images.unsplash.com/photo-1684695749267-233af13276d0?w=800&q=80&auto=format&fit=crop",
  },
  {
    title: "Multi-Location Businesses",
    description: "See the closing picture across all branches while retaining the ability to investigate locations.",
    image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&q=80&auto=format&fit=crop",
  },
];

const CLOSING_CHECKLIST = ["End-of-day business summary", "See what needs your attention", "Start tomorrow prepared", "Connected to your business data"];

function AnalogClock() {
  const ticks = Array.from({ length: 12 }, (_, i) => i);
  return (
    <div className="relative flex h-[168px] w-[168px] flex-none items-center justify-center rounded-full border border-white/15 bg-[#03251b] shadow-[0_30px_70px_-30px_rgba(0,0,0,0.6)] sm:h-[190px] sm:w-[190px]">
      {ticks.map((i) => (
        <span
          key={i}
          className="absolute left-1/2 top-1/2 h-[9px] w-[2px] rounded-full bg-white/25"
          style={{ transform: `rotate(${i * 30}deg) translateY(-78px)`, transformOrigin: "center" }}
        />
      ))}
      {/* Hands fixed at 10:00 */}
      <span className="absolute left-1/2 top-1/2 h-[52px] w-[3px] origin-bottom rounded-full bg-white/90" style={{ transform: "translate(-50%, -100%) rotate(-60deg)" }} />
      <span className="absolute left-1/2 top-1/2 h-[38px] w-[3px] origin-bottom rounded-full bg-white/70" style={{ transform: "translate(-50%, -100%) rotate(0deg)" }} />
      <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-on-deep" />
      <span className="absolute -top-3 flex flex-col items-center gap-1 text-center">
        <span className="font-display text-[15px] font-semibold text-fg-on-deep">10:00</span>
        <span className="text-[10px] uppercase tracking-[0.1em] text-fg-on-deep-faint">PM</span>
      </span>
    </div>
  );
}

export default function NightlyClosePage() {
  return (
    <div data-theme="light" className="flex min-h-dvh flex-col bg-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />

      <main className="flex-1">
        

        {/* Hero */}
        <section className="relative mt-5 overflow-hidden px-5 pb-16 pt-12 sm:px-7 sm:pb-20 sm:pt-10">
          <div className="relative mx-auto flex max-w-[1320px] flex-wrap items-start gap-x-14 gap-y-12">
            <div className="min-w-[300px] max-w-[540px] flex-1 basis-[440px]">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#e3fbf1] px-3.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#0b7a4c]">
                <Moon className="h-3.5 w-3.5" aria-hidden /> Nightly Close
              </div>
              <h1 className="text-balance font-display text-[40px] font-bold leading-[1.1] tracking-tight text-fg sm:text-[50px]">
                End Every Business Day With <span className="text-accent">Clarity.</span>
              </h1>
              <p className="mt-4 max-w-[48ch] text-[16px] leading-relaxed text-fg-muted">
                Nightly Close brings together the information that matters from across your business and delivers one
                clear end-of-day summary. See what happened today, know what needs attention, and start tomorrow prepared.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  href="/book-a-demo"
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-6.5 py-3.5 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
                >
                  Set Up Nightly Close <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link
                  href="#story"
                  className="inline-flex items-center rounded-xl border border-border-strong px-6 py-3.5 text-[15px] font-medium text-fg transition-colors hover:border-accent hover:text-primary"
                >
                  See What It Looks Like
                </Link>
              </div>

              <div className="mt-5 flex items-center gap-2 text-[13px] text-fg-muted">
                <Check className="h-4 w-4 flex-none text-accent" aria-hidden />
                Connected to your Noxtill business data.
              </div>
            </div>

            <div className="flex min-w-[300px] flex-1 basis-[420px] justify-center">
              <div className="w-full max-w-[440px]">
                

                <div className="rounded-[18px] border border-white/10 bg-[#03251b] p-5 shadow-[0_40px_90px_-40px_rgba(13,21,18,0.4)]">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
                    <span className="text-[13.5px] font-medium text-fg-on-deep">Nightly Close — May 18, 2025</span>
                    <span className="rounded-full bg-accent-on-deep/15 px-2.5 py-1 text-[10.5px] font-medium text-accent-on-deep">Delivered</span>
                  </div>

                  <p className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-fg-on-deep-faint">Today&apos;s Close</p>
                  <div className="mb-4 grid grid-cols-3 gap-2">
                    {CLOSE_STATS.map((stat) => (
                      <div key={stat.label} className="rounded-[10px] border border-white/10 p-2.5">
                        <div className="text-[9.5px] leading-tight text-fg-on-deep-faint">{stat.label}</div>
                        <div className="mt-0.5 font-display text-[13.5px] font-semibold text-fg-on-deep">{stat.value}</div>
                        {stat.delta ? <div className="mt-0.5 text-[9.5px] text-accent-on-deep">{stat.delta}</div> : null}
                      </div>
                    ))}
                  </div>

                  <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <div className="rounded-[10px] border border-white/10 p-3">
                      <p className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.08em] text-fg-on-deep-faint">Needs Attention</p>
                      <ul className="flex flex-col gap-1.5">
                        {NEEDS_ATTENTION.map((item) => (
                          <li key={item} className="flex items-start gap-1.5 text-[11.5px] leading-snug text-fg-on-deep-muted">
                            <AlertTriangle className="mt-0.5 h-3 w-3 flex-none text-[#e8a93c]" aria-hidden />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-[10px] border border-white/10 p-3">
                      <p className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.08em] text-fg-on-deep-faint">Tomorrow</p>
                      <ul className="flex flex-col gap-1.5">
                        {TOMORROW.map((item) => (
                          <li key={item} className="flex items-start gap-1.5 text-[11.5px] leading-snug text-fg-on-deep-muted">
                            <Check className="mt-0.5 h-3 w-3 flex-none text-accent-on-deep" aria-hidden />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <Link href="/book-a-demo" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-accent-on-deep hover:underline">
                    See full report in Noxtill <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <EcosystemStrip heading="All Your Business. One Connected Close." items={MODULES} />

        {/* Story section */}
        <section id="story" className="px-5 pt-16 sm:px-7 sm:pt-20">
          <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-14 gap-y-10">
            <div className="min-w-[300px] max-w-[480px] flex-1 basis-[400px]">
              <p className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-[0.1em] text-primary">The end of the day matters</p>
              <h2 className="mb-4 text-balance font-display text-[30px] font-bold leading-[1.15] tracking-tight text-fg sm:text-[36px]">
                Your Business Has A Story Every Day.
              </h2>
              <p className="mb-3.5 text-[15px] leading-relaxed text-fg-muted">
                Every sale, every payment, every order, every booking leaves behind important signals. Taken together,
                they show you how your business really performed.
              </p>
              <p className="text-[15px] leading-relaxed text-fg-muted">
                Nightly Close collects those signals from across Noxtill and turns them into one concise summary that&apos;s
                easy to review and act on.
              </p>
            </div>

            <div className="min-w-[300px] flex-1 basis-[440px]">
              <div className="relative overflow-hidden rounded-[20px] bg-surface-deep p-8 shadow-[0_30px_70px_-46px_rgba(13,21,18,0.4)] sm:p-10">
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{ background: "radial-gradient(55% 55% at 20% 20%, rgba(79,227,168,0.14) 0%, rgba(5,59,42,0) 70%)" }}
                  aria-hidden
                />
                <div className="relative mx-auto max-w-[320px] rounded-[16px] border border-white/10 bg-[#03251b] p-4 shadow-[0_20px_50px_-24px_rgba(0,0,0,0.6)]">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-[6px] bg-accent-on-deep/20 font-display text-[11px] font-bold text-accent-on-deep">
                        N
                      </span>
                      <span className="text-[13px] font-medium text-fg-on-deep">Nightly Close</span>
                    </div>
                    <span className="text-[10.5px] text-fg-on-deep-faint">10:00 PM</span>
                  </div>

                  <div className="mb-3 grid grid-cols-3 gap-2">
                    {CLOSE_STATS.slice(0, 3).map((stat) => (
                      <div key={stat.label} className="rounded-[10px] border border-white/10 p-2.5">
                        <div className="text-[9.5px] leading-tight text-fg-on-deep-faint">{stat.label}</div>
                        <div className="mt-0.5 font-display text-[13px] font-semibold text-fg-on-deep">{stat.value}</div>
                        {stat.delta ? <div className="mt-0.5 text-[9.5px] text-accent-on-deep">{stat.delta}</div> : null}
                      </div>
                    ))}
                  </div>

                  <div className="mb-3 flex items-start gap-1.5 rounded-[10px] border border-white/10 p-2.5 text-[11.5px] leading-snug text-fg-on-deep-muted">
                    <AlertTriangle className="mt-0.5 h-3 w-3 flex-none text-[#e8a93c]" aria-hidden />
                    {NEEDS_ATTENTION[0]}
                  </div>

                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-[12px] font-medium text-fg-on-deep">
                    View Full Summary <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* One daily summary */}
        <section className="mt-16 bg-surface-2 px-5 py-14 sm:px-7 sm:py-16">
          <div className="mx-auto max-w-[1320px]">
            <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
              <div className="max-w-[480px]">
                <p className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-[0.1em] text-primary">More than numbers</p>
                <h2 className="text-balance font-display text-[30px] font-bold leading-[1.15] tracking-tight text-fg sm:text-[36px]">
                  One Daily Summary. Connected To The Business.
                </h2>
              </div>
              <p className="max-w-[46ch] text-[15px] leading-relaxed text-fg-muted">
                Nightly Close doesn&apos;t just show numbers. It connects the dots across your business so you understand
                the bigger picture behind the results.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {SUMMARY_GROUPS.map((group) => (
                <div key={group.title} className="rounded-2xl border border-border bg-white p-5.5">
                  <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#e3fbf1]">
                    <group.icon className="h-[19px] w-[19px] text-accent" aria-hidden />
                  </span>
                  <div className="mb-1.5 font-display text-[15.5px] font-semibold text-fg">{group.title}</div>
                  <p className="mb-4 text-[13px] leading-relaxed text-fg-muted">{group.description}</p>

                  {group.chart === "bars" ? (
                    <div className="flex h-[46px] items-end gap-1">
                      {[35, 55, 45, 70, 60, 85, 75].map((h, i) => (
                        <span key={i} className="flex-1 rounded-[2px] bg-accent/40" style={{ height: `${h}%` }} />
                      ))}
                    </div>
                  ) : null}
                  {group.chart === "line" ? (
                    <svg viewBox="0 0 140 46" className="h-[46px] w-full" preserveAspectRatio="none" aria-hidden>
                      <polyline
                        points="0,34 20,26 40,30 60,16 80,22 100,8 120,14 140,4"
                        fill="none"
                        stroke="#0ea86a"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                  {group.rows ? (
                    <div className="flex flex-col gap-1.5 rounded-[10px] border border-border p-2.5">
                      {group.rows.map(([label, value]) => (
                        <div key={label} className="flex items-center justify-between gap-2.5 text-[12px]">
                          <span className="text-fg-faint">{label}</span>
                          <span className="font-medium text-fg">{value}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Answers that matter */}
        <section className="mt-16 bg-surface-deep px-5 py-14 sm:px-7 sm:py-16">
          <div className="mx-auto max-w-[1320px]">
            <div className="mb-9 flex flex-wrap items-end justify-between gap-6">
              <div className="max-w-[480px]">
                <p className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-on-deep">Answers that matter</p>
                <h2 className="text-balance font-display text-[30px] font-bold leading-[1.15] tracking-tight text-fg-on-deep sm:text-[36px]">
                  Before You Close The Day, Know The Answers.
                </h2>
              </div>
              <p className="max-w-[46ch] text-[15px] leading-relaxed text-fg-on-deep-muted">
                Nightly Close is built around the questions every business owner asks before signing off for the night.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4 lg:grid-cols-7">
              {QUESTIONS.map((q) => (
                <div key={q.text} className="flex flex-col gap-2.5 rounded-[14px] border border-white/10 bg-white/5 p-3.5">
                  <q.icon className="h-4 w-4 text-accent-on-deep" aria-hidden />
                  <p className="text-[12px] leading-snug text-fg-on-deep">{q.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Built for real businesses */}
        <section className="px-5 pt-16 sm:px-7 sm:pt-20">
          <div className="mx-auto max-w-[1320px]">
            <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
              <div className="max-w-[480px]">
                <p className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-[0.1em] text-primary">Built for real businesses</p>
                <h2 className="text-balance font-display text-[30px] font-bold leading-[1.15] tracking-tight text-fg sm:text-[36px]">
                  One System. Many Ways To Run Your Business.
                </h2>
              </div>
              <p className="max-w-[46ch] text-[15px] leading-relaxed text-fg-muted">
                Nightly Close adapts to the way your business works and gives you a daily summary that&apos;s relevant to
                your operations.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {BUSINESS_TYPES.map((type) => (
                <div key={type.title}>
                  <div className="relative mb-4 h-[140px] overflow-hidden rounded-2xl">
                    <Image
                      src={type.image}
                      alt={type.title}
                      fill
                      sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                  <div className="mb-1.5 font-display text-[15.5px] font-semibold text-fg">{type.title}</div>
                  <p className="text-[13px] leading-relaxed text-fg-muted">{type.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mt-16 bg-surface-deep px-5 pb-16 pt-14 sm:px-7 sm:pb-0 sm:pt-16">
          <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-14 gap-y-10">
            <div className="min-w-[300px] flex-1 basis-[420px]">
              <h2 className="mb-4 text-balance font-display text-[30px] font-bold leading-[1.15] tracking-tight text-fg-on-deep sm:text-[36px]">
                Close The Day Knowing Where Your Business Stands.
              </h2>
              <p className="mb-7 max-w-[48ch] text-[15px] leading-relaxed text-fg-on-deep-muted">
                Noxtill Nightly Close brings the important parts of your business together so you can understand today
                and start tomorrow with confidence.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/book-a-demo"
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-6.5 py-3.5 text-[15px] font-semibold text-[#053b2a] transition-colors hover:bg-[#e6f5ee]"
                >
                  Set Up Nightly Close <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link
                  href="/product"
                  className="inline-flex items-center rounded-xl border border-border-on-deep px-6 py-3.5 text-[15px] font-medium text-fg-on-deep transition-colors hover:border-fg-on-deep-muted"
                >
                  Explore Noxtill
                </Link>
              </div>
            </div>

            <div className="min-w-[280px] flex-1 basis-[360px]">
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                {CLOSING_CHECKLIST.map((item) => (
                  <div key={item} className="flex items-center gap-2.5 text-[13.5px] text-fg-on-deep">
                    <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-white/10">
                      <Check className="h-3.5 w-3.5 text-accent-on-deep" aria-hidden />
                    </span>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        
      </main>

      <SiteFooter />
    </div>
  );
}

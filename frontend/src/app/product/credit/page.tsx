import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bell,
  Box,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  CircleDollarSign,
  CreditCard,
  Lock,
  MoreVertical,
  PieChart,
  PlayCircle,
  Search,
  ShoppingCart,
  TrendingUp,
  Users,
  Users2,
  Wallet,
  Zap,
} from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { DetailRelated } from "@/components/site/detail-page-sections";
import { EcosystemStrip } from "@/components/site/ecosystem-strip";
import { findProductDetailPage } from "@/lib/marketing/product-detail-content";

const page = findProductDetailPage("credit")!;

export const metadata: Metadata = {
  title: page.metaTitle,
  description: page.metaDescription,
  alternates: { canonical: "https://noxtill.com/product/credit/" },
  openGraph: {
    type: "website",
    url: "https://noxtill.com/product/credit/",
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
        { "@type": "ListItem", position: 3, name: "Customer Credit", item: "https://noxtill.com/product/credit/" },
      ],
    },
    {
      "@type": "Article",
      headline: page.metaTitle,
      description: page.metaDescription,
      url: "https://noxtill.com/product/credit/",
    },
  ],
};

const STAT_TILES = [
  { label: "Total Credit Sales", value: "$24,850", caption: "This Month", color: "text-fg" },
  { label: "Total Paid", value: "$15,320", caption: "This Month", color: "text-fg" },
  { label: "Outstanding Balance", value: "$9,530", caption: "As of Today", color: "text-accent" },
  { label: "Overdue Amount", value: "$3,120", caption: "> 30 Days", color: "text-red-600" },
];

const TOP_CUSTOMERS = [
  { name: "Alex Morgan", amount: "$1,850", days: "61 days" },
  { name: "Global Traders", amount: "$1,250", days: "45 days" },
  { name: "Sunset Electricals", amount: "$960", days: "32 days" },
  { name: "Bright Enterprises", amount: "$760", days: "15 days" },
  { name: "TechHub Solutions", amount: "$620", days: "8 days" },
];

const AGING_SUMMARY = [
  { label: "Current", sub: "(0 - 30 days)", value: "$2,430", color: "#10b981", pct: 25.5 },
  { label: "1 - 30 Days", value: "$2,180", color: "#3b82f6", pct: 22.9 },
  { label: "31 - 60 Days", value: "$1,760", color: "#f59e0b", pct: 18.5 },
  { label: "61 - 90 Days", value: "$1,120", color: "#f97316", pct: 11.7 },
  { label: "90+ Days", value: "$2,040", color: "#ef4444", pct: 21.4 },
];

function donutGradient() {
  let acc = 0;
  const stops = AGING_SUMMARY.map((a) => {
    const start = acc;
    acc += a.pct;
    return `${a.color} ${start}% ${acc}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

const LIFECYCLE_STEPS = [
  { icon: ShoppingCart, title: "Credit Sale", description: "Customer buys on credit. Balance is recorded.", bg: "bg-blue-50", color: "text-blue-600" },
  { icon: Wallet, title: "Balance Created", description: "Outstanding balance is updated in the customer ledger.", bg: "bg-sky-50", color: "text-sky-600" },
  { icon: Clock, title: "Payment Due", description: "Balance becomes due based on your credit terms.", bg: "bg-amber-50", color: "text-amber-600" },
  { icon: Bell, title: "Reminder Sent", description: "Automated reminders help you follow up on time.", bg: "bg-red-50", color: "text-red-600" },
  { icon: CreditCard, title: "Payment Received", description: "Full or part payment is recorded and balance updated.", bg: "bg-violet-50", color: "text-violet-600" },
  { icon: PieChart, title: "Balance Reduced", description: "Outstanding amount decreases with every payment.", bg: "bg-teal-50", color: "text-teal-600" },
  { icon: CheckCircle2, title: "Account Settled", description: "When balance is zero, the account is closed or renewed.", bg: "bg-emerald-50", color: "text-emerald-600" },
];

const RECENT_PAYMENTS = [
  { date: "May 15, 2025", label: "Payment from Alex Morgan", amount: "+$150" },
  { date: "May 12, 2025", label: "Credit Sale to Alex Morgan", amount: "+$250" },
  { date: "May 10, 2025", label: "Payment from Global Traders", amount: "+$200" },
  { date: "May 8, 2025", label: "Payment from Bright Enterprises", amount: "+$120" },
  { date: "May 5, 2025", label: "Payment from Alex Morgan", amount: "+$100" },
];

const WHY_CHOOSE = [
  { icon: Users2, title: "Clear Customer Ledgers", description: "Complete credit history, payments and balances in one place." },
  { icon: Bell, title: "Smarter Follow-Ups", description: "Automated reminders and messages help you collect faster." },
  { icon: TrendingUp, title: "Better Cash Flow", description: "Know what's coming in, what's overdue and what needs action." },
  { icon: Users, title: "Stronger Relationships", description: "Professional statements and clear communication build customer trust." },
  { icon: BarChart3, title: "Business Insights", description: "Understand credit trends, top debtors and payment behavior." },
  { icon: Lock, title: "Secure & Reliable", description: "Your financial data is safe with role-based access and audit trails." },
];

const ECOSYSTEM = [
  { icon: Zap, label: "Fast Sale" },
  { icon: Box, label: "Orders" },
  { icon: Users, label: "Customers" },
  { icon: Wallet, label: "Payments" },
  { icon: Box, label: "Inventory" },
  { icon: BarChart3, label: "Reports" },
  { icon: CalendarClock, label: "Nightly Close" },
];

export default function CustomerCreditPage() {
  return (
    <div data-theme="light" className="flex min-h-dvh flex-col bg-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
        

          <div className="relative mx-auto flex max-w-[1320px] flex-wrap items-start gap-x-14 gap-y-12 px-5 pb-8 pt-10 sm:px-7 ">
            <div className="min-w-[300px] max-w-[520px] flex-1 basis-[440px]">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#e3fbf1] px-3.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#0b7a4c]">
                <Wallet className="h-3.5 w-3.5" aria-hidden /> Customer Credit
              </div>
              <h1 className="text-balance font-display text-[40px] font-bold leading-[1.1] tracking-tight text-fg sm:text-[50px]">
                {page.h1Lead} <span className="text-accent">{page.h1Highlight}</span>
              </h1>
              <p className="mt-4 max-w-[48ch] text-[16px] leading-relaxed text-fg-muted">{page.subhead}</p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  href="/book-a-demo"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-6.5 py-3.5 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
                >
                  Start Managing Credit <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link
                  href="#lifecycle"
                  className="inline-flex items-center gap-2 rounded-md border border-border-on-deep px-6 py-3.5 text-[15px] font-medium text-fg transition-colors hover:border-accent hover:text-primary"
                >
                  See How It Works <PlayCircle className="h-4 w-4" aria-hidden />
                </Link>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {page.benefits.map((b) => (
                  <div key={b.label} className="flex flex-col items-center gap-2 rounded-md border bg-white px-2 py-4 text-center shadow-[0_2px_10px_-4px_rgba(13,21,18,0.08)]">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e3fbf1]">
                      <b.icon className="h-5 w-5 text-accent" aria-hidden />
                    </span>
                    <span className="text-[12px] font-medium leading-tight text-fg">{b.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="min-w-[340px] flex-1 basis-[520px]">
              <div className="rounded-md border border-border-strong bg-white p-4 shadow-[0_50px_100px_-40px_rgba(0,0,0,0.5)] sm:p-5">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <span className="text-[14.5px] font-semibold text-fg">Customer Credit Overview</span>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md border border-border px-2.5 py-1 text-[10.5px] text-fg-muted">All Branches ⌄</span>
                    <MoreVertical className="h-4 w-4 text-fg-faint" aria-hidden />
                  </div>
                </div>

                <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {STAT_TILES.map((s) => (
                    <div key={s.label} className="rounded-md border border-border p-2.5">
                      <p className="text-[9.5px] leading-tight text-fg-faint">{s.label}</p>
                      <p className={`mt-1 font-display text-[16px] font-bold ${s.color}`}>{s.value}</p>
                      <p className="text-[9px] text-fg-faint">{s.caption}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-md border border-border p-3">
                    <p className="mb-2 text-[11.5px] font-semibold text-fg">Top Outstanding Customers</p>
                    <div className="flex flex-col gap-2">
                      {TOP_CUSTOMERS.map((c) => (
                        <div key={c.name} className="flex items-center gap-2 text-[10px]">
                          <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-surface-2 text-[8px] font-semibold text-fg-muted">
                            {c.name[0]}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-fg">{c.name}</span>
                          <span className="flex-none font-semibold text-fg">{c.amount}</span>
                          <span className="flex-none text-fg-faint">{c.days}</span>
                        </div>
                      ))}
                    </div>
                    <Link href="#lifecycle" className="mt-2 inline-block text-[10.5px] font-medium text-primary hover:underline">
                      View All Customers →
                    </Link>
                  </div>

                  <div className="rounded-md border border-border p-3">
                    <p className="mb-2 text-[11.5px] font-semibold text-fg">Aging Summary</p>
                    <div className="flex items-center gap-3">
                      <div className="relative h-20 w-20 flex-none rounded-full" style={{ background: donutGradient() }}>
                        <div className="absolute inset-2 flex flex-col items-center justify-center rounded-full bg-white text-center">
                          <span className="font-display text-[12px] font-bold text-fg">$9,530</span>
                          <span className="text-[7px] leading-tight text-fg-faint">Total Outstanding</span>
                        </div>
                      </div>
                      <div className="flex flex-1 flex-col gap-1 text-[9px]">
                        {AGING_SUMMARY.map((a) => (
                          <div key={a.label} className="flex items-center justify-between gap-1">
                            <span className="flex items-center gap-1 truncate text-fg-muted">
                              <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: a.color }} />
                              {a.label}
                            </span>
                            <span className="flex-none font-medium text-fg">{a.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <Link href="#lifecycle" className="mt-2 inline-block text-[10.5px] font-medium text-primary hover:underline">
                      View Aging Report →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* From paper to powerful */}
        <section className="px-5 py-7 sm:px-7 sm:py-8">
          <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-10 gap-y-10">
            <div className="relative aspect-[4/3] min-w-[220px] flex-1 basis-[300px] overflow-hidden rounded-md">
              <Image
                src="/marketing/credit-account-register-template.png"
                alt="Credit account register template"
                fill
                sizes="(min-width: 1024px) 25vw, 45vw"
                className="object-cover"
              />
            </div>

            <ArrowRight className="hidden h-6 w-6 flex-none text-accent sm:block" aria-hidden />

            <div className="min-w-[220px] flex-1 basis-[280px] rounded-md border border-border bg-white p-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-faint">Noxtill Digital Ledger</p>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e3fbf1] text-[11px] font-semibold text-accent">AM</span>
                <span className="text-[13px] font-semibold text-fg">Alex Morgan</span>
                <span className="rounded-full bg-[#e3fbf1] px-2 py-0.5 text-[9.5px] font-medium text-accent">Active</span>
              </div>
              <div className="mb-2 grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <p className="text-fg-faint">Total Credit Sales</p>
                  <p className="font-semibold text-fg">$1,250</p>
                </div>
                <div>
                  <p className="text-fg-faint">Total Paid</p>
                  <p className="font-semibold text-fg">$750</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-border pt-2 text-[11px]">
                <div>
                  <p className="text-fg-faint">Outstanding Balance</p>
                  <p className="font-semibold text-accent">$500</p>
                </div>
                <div>
                  <p className="text-fg-faint">Last Payment</p>
                  <p className="font-semibold text-fg">May 15, 2025</p>
                </div>
              </div>
            </div>

            <div className="min-w-[260px] flex-1 basis-[360px]">
              <p className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-[0.1em] text-primary">From paper to powerful</p>
              <h2 className="mb-4 text-balance font-display text-[28px] font-bold leading-[1.15] tracking-tight text-fg sm:text-[32px]">
                Same Relationship. Smarter Management.
              </h2>
              <p className="mb-5 text-[14.5px] leading-relaxed text-fg-muted">
                Keep the simplicity of your khata, with the power of a digital system. Track every credit sale, payment,
                and adjustment in one secure, connected ledger.
              </p>
              <div className="flex flex-col gap-2.5">
                {["Accurate balances, always", "Full payment history at your fingertips", "Less confusion, more trust"].map((item) => (
                  <div key={item} className="flex items-center gap-2.5 text-[13.5px] text-fg">
                    <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[#e3fbf1]">
                      <Check className="h-3 w-3 text-accent" aria-hidden />
                    </span>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Lifecycle */}
        <section id="lifecycle" className="px-5 sm:px-7">
          <div className="mx-auto max-w-[1320px]">
            <h2 className="mb-10 text-center font-display text-[26px] font-bold tracking-tight text-fg">The Customer Credit Lifecycle</h2>
            <div className="flex flex-wrap items-start justify-center gap-y-8">
              {LIFECYCLE_STEPS.map((s, i) => (
                <div key={s.title} className="flex items-start">
                  <div className="flex w-[130px] flex-col items-center text-center">
                    <span className={`mb-3 flex h-12 w-12 items-center justify-center rounded-full ${s.bg}`}>
                      <s.icon className={`h-5 w-5 ${s.color}`} aria-hidden />
                    </span>
                    <p className="mb-1 text-[12.5px] font-semibold text-fg">
                      {i + 1}. {s.title}
                    </p>
                    <p className="text-[10.5px] leading-relaxed text-fg-muted">{s.description}</p>
                  </div>
                  {i < LIFECYCLE_STEPS.length - 1 ? (
                    <span className="mt-5 hidden px-1 text-fg-faint sm:inline">⋯→</span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Aging radar + recent activity */}
        <section className="mt-10 px-5 sm:px-7">
          <div className="mx-auto grid max-w-[1320px] grid-cols-1 gap-5 lg:grid-cols-[1fr_1fr]">
            <div className="rounded-md border border-white/10 bg-surface-deep p-5">
              <p className="mb-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-accent-on-deep">Aging radar</p>
              <h3 className="mb-2 text-balance font-display text-[19px] font-bold leading-[1.2] text-fg-on-deep">Focus on What Needs Attention.</h3>
              <p className="mb-5 text-[12.5px] leading-relaxed text-fg-on-deep-muted">
                Aging helps you understand how long balances have been outstanding so you can follow up with the right
                priority.
              </p>

              <div className="flex items-center gap-5">
                <div className="relative h-28 w-28 flex-none rounded-full" style={{ background: donutGradient() }}>
                  <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-[#03251b] text-center">
                    <span className="text-[9.5px] text-fg-on-deep-faint">Total</span>
                    <span className="text-[9.5px] text-fg-on-deep-faint">Outstanding</span>
                    <span className="font-display text-[15px] font-bold text-fg-on-deep">$9,530</span>
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-1.5 text-[11px]">
                  {AGING_SUMMARY.map((a) => (
                    <div key={a.label} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 truncate text-fg-on-deep-muted">
                        <span className="h-2 w-2 flex-none rounded-full" style={{ background: a.color }} />
                        {a.label} {a.sub ? <span className="text-fg-on-deep-faint">{a.sub}</span> : null}
                      </span>
                      <span className="flex-none font-medium text-fg-on-deep">{a.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Link href="#lifecycle" className="mt-4 inline-block text-[11.5px] font-medium text-accent-on-deep hover:underline">
                View Full Aging Report →
              </Link>
            </div>

            <div className="rounded-md border border-border bg-white p-5">
              <h3 className="mb-4 text-[16px] font-semibold text-fg">Recent Payment Activity</h3>
              <div className="flex flex-col gap-3">
                {RECENT_PAYMENTS.map((p) => (
                  <div key={p.date + p.label} className="flex items-center justify-between gap-3 border-b border-border pb-3 text-[12.5px] last:border-b-0 last:pb-0">
                    <span className="w-[80px] flex-none text-fg-faint">{p.date}</span>
                    <span className="min-w-0 flex-1 truncate text-fg">{p.label}</span>
                    <span className="flex-none font-semibold text-emerald-600">{p.amount}</span>
                  </div>
                ))}
              </div>
              <Link href="#lifecycle" className="mt-4 inline-block text-[11.5px] font-medium text-primary hover:underline">
                View All Transactions →
              </Link>
            </div>
          </div>
        </section>

        {/* Why choose */}
        <section className="mt-10 px-5 sm:px-7">
          <div className="mx-auto max-w-[1320px] text-center">
            <h2 className="mb-10 font-display text-[24px] font-bold tracking-tight text-fg">Why Businesses Choose Noxtill Customer Credit</h2>
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
              {WHY_CHOOSE.map((b) => (
                <div key={b.title} className="flex flex-col items-center text-center">
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#e3fbf1]">
                    <b.icon className="h-5 w-5 text-accent" aria-hidden />
                  </span>
                  <div className="mb-1 text-[13px] font-semibold text-fg">{b.title}</div>
                  <p className="text-[11px] leading-relaxed text-fg-muted">{b.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <EcosystemStrip heading="Connected With Your Entire Business" items={ECOSYSTEM} />

        {/* Closing CTA */}
        <section className="relative mt-10 overflow-hidden bg-surface-deep px-5 py-7 sm:px-7 sm:py-8">
          
          <div className="relative mx-auto flex max-w-[1320px] flex-wrap items-center gap-10">
            <div className="min-w-[260px] flex-1 basis-[380px]">
              <h2 className="mb-4 text-balance font-display text-[28px] font-bold leading-[1.15] tracking-tight text-fg-on-deep">
                Close the Day. Collect Tomorrow.
              </h2>
              <p className="mb-6 max-w-[42ch] text-[14px] leading-relaxed text-fg-on-deep-muted">
                Noxtill Customer Credit helps you keep track of every balance, every payment and every customer — so
                you can grow your business with confidence.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/book-a-demo"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-5.5 py-3 text-[14px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
                >
                  Start Managing Credit <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link
                  href="/book-a-demo"
                  className="inline-flex items-center rounded-md border border-border-on-deep px-5.5 py-3 text-[14px] font-medium text-fg-on-deep transition-colors hover:border-fg-on-deep-muted"
                >
                  Book a Demo
                </Link>
              </div>
            </div>
            

            <div className="min-w-[240px] flex-1 basis-[260px]">
              <div className="mx-auto w-[190px] rounded-[20px] border border-border-strong bg-white p-2 shadow-[0_30px_70px_-30px_rgba(0,0,0,0.6)]">
                <div className="rounded-[14px] bg-[#03251b] p-3">
                  <div className="mb-2 flex items-center gap-1.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-on-deep/20">
                      <Check className="h-3 w-3 text-accent-on-deep" aria-hidden />
                    </span>
                    <span className="text-[10.5px] font-semibold text-fg-on-deep">Payment Reminder</span>
                  </div>
                  <p className="mb-0.5 text-[9px] text-fg-on-deep-faint">Hi Alex Morgan,</p>
                  <p className="mb-2 text-[9px] text-fg-on-deep-faint">Your outstanding balance is $330.</p>
                  <div className="flex flex-col gap-1">
                    <span className="rounded-[4px] border border-white/15 py-1 text-center text-[9px] font-medium text-fg-on-deep">View Statement</span>
                    <span className="rounded-[4px] bg-accent-on-deep py-1 text-center text-[9px] font-semibold text-[#03251b]">Pay Now</span>
                  </div>
                </div>
              </div>
            </div>
              <div className="min-w-[260px] flex-1 basis-[320px] rounded-md border border-border bg-white p-4">
              <p className="mb-3 text-[13px] italic leading-relaxed text-fg-muted">&ldquo;{page.pullQuote}&rdquo;</p>
              <div className="flex items-center gap-2.5">
                <div className="relative h-9 w-9 flex-none overflow-hidden rounded-full">
                  <Image
                    src="https://images.unsplash.com/photo-1589386417686-0d34b5903d23?w=120&q=80&auto=format&fit=crop"
                    alt="Rashid Khan, wholesale business owner"
                    fill
                    sizes="36px"
                    className="object-cover"
                  />
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-fg">Rashid Khan</p>
                  <p className="text-[10.5px] text-fg-faint">Wholesale Business Owner</p>
                </div>
              </div>
            </div>
            
          </div>
        </section>

        
      </main>

      <SiteFooter />
    </div>
  );
}

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Calculator,
  Check,
  CheckCircle2,
  DollarSign,
  FileText,
  PlayCircle,
  Settings2,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { DetailRelated } from "@/components/site/detail-page-sections";
import { EcosystemStrip } from "@/components/site/ecosystem-strip";
import { findProductDetailPage } from "@/lib/marketing/product-detail-content";

const page = findProductDetailPage("staff")!;

export const metadata: Metadata = {
  title: page.metaTitle,
  description: page.metaDescription,
  alternates: { canonical: "https://noxtill.com/product/staff/" },
  openGraph: {
    type: "website",
    url: "https://noxtill.com/product/staff/",
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
        { "@type": "ListItem", position: 3, name: "Staff & Commissions", item: "https://noxtill.com/product/staff/" },
      ],
    },
    {
      "@type": "Article",
      headline: page.metaTitle,
      description: page.metaDescription,
      url: "https://noxtill.com/product/staff/",
    },
  ],
};

const STAT_TILES = [
  { label: "Total Sales", value: "$48,750", delta: "↑ 18.5% vs Apr 1 – Apr 30" },
  { label: "Total Commissions", value: "$7,842", delta: "↑ 16.2% vs Apr 1 – Apr 30" },
  { label: "Active Staff", value: "24", delta: "↑ 4 vs Apr 1 – Apr 30" },
  { label: "Avg. Commission Rate", value: "16.1%", delta: "↑ 1.3% vs Apr 1 – Apr 30" },
];

const FEATURE_ROW = [
  { icon: Users, title: "Team Management", description: "Add staff, set roles, permissions and targets." },
  { icon: BarChart3, title: "Performance Tracking", description: "Track sales, orders, revenue and other key KPIs." },
  { icon: Settings2, title: "Commission Rules", description: "Create custom commission plans and structures." },
  { icon: Calculator, title: "Automated Calculation", description: "Commissions are calculated automatically in real-time." },
  { icon: Wallet, title: "Payouts & Settlement", description: "Review, approve and pay commissions with ease." },
  { icon: FileText, title: "Reports & Insights", description: "Understand performance and reward the best." },
];

const STAFF_TABLE = [
  { name: "Ayesha Khan", role: "Sales Executive", sales: "$12,450", orders: 38, commission: "$2,242", rate: "18%", performance: "Excellent", photo: "photo-1758876019338-c190822f6ca0" },
  { name: "Usman Ali", role: "Sales Executive", sales: "$9,875", orders: 31, commission: "$1,678", rate: "17%", performance: "Very Good", photo: "photo-1557425747-929b65a39785" },
  { name: "Maria Ahmed", role: "Store Manager", sales: "$15,230", orders: 46, commission: "$2,585", rate: "17%", performance: "Excellent", photo: "photo-1573496527892-904f897eb744" },
  { name: "Bilal Hassan", role: "Sales Executive", sales: "$6,980", orders: 24, commission: "$1,117", rate: "16%", performance: "Good", photo: "photo-1705579607707-717fb965145f" },
  { name: "Zainab Noor", role: "Sales Associate", sales: "$4,215", orders: 18, commission: "$421", rate: "10%", performance: "Good", photo: "photo-1589386417686-0d34b5903d23" },
];

const PERFORMANCE_STYLES: Record<string, string> = {
  Excellent: "bg-emerald-50 text-emerald-700",
  "Very Good": "bg-emerald-50 text-emerald-700",
  Good: "bg-blue-50 text-blue-700",
};

const COMMISSION_BREAKDOWN = [
  { label: "Sales Executive", value: "$5,124 (65.4%)", pct: 65.4, color: "#8b5cf6" },
  { label: "Store Manager", value: "$1,876 (23.9%)", pct: 23.9, color: "#3b82f6" },
  { label: "Sales Associate", value: "$842 (10.7%)", pct: 10.7, color: "#10b981" },
];

function donutGradient(slices: { pct: number; color: string }[]) {
  let acc = 0;
  const stops = slices.map((s) => {
    const start = acc;
    acc += s.pct;
    return `${s.color} ${start}% ${acc}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

const TOP_PERFORMERS = [
  { name: "Ayesha Khan", commission: "$2,242" },
  { name: "Maria Ahmed", commission: "$2,585" },
  { name: "Usman Ali", commission: "$1,678" },
  { name: "Bilal Hassan", commission: "$1,117" },
  { name: "Zainab Noor", commission: "$421" },
];

const TREND_MONTHS = ["Dec '24", "Jan '25", "Feb '25", "Mar '25", "Apr '25", "May '25"];
const TREND_VALUES = [3200, 5100, 4800, 5600, 6100, 4842];
const TREND_HIGHLIGHT_INDEX = 5;

function TrendChart() {
  const max = Math.max(...TREND_VALUES);
  const min = Math.min(...TREND_VALUES) * 0.8;
  const w = 260;
  const h = 90;
  const points = TREND_VALUES.map((v, i) => {
    const x = (i / (TREND_VALUES.length - 1)) * w;
    const y = h - ((v - min) / (max - min)) * h;
    return { x, y };
  });
  const line = points.map((p) => `${p.x},${p.y}`).join(" ");
  const hl = points[TREND_HIGHLIGHT_INDEX];
  return (
    <svg viewBox={`0 0 ${w} ${h + 20}`} className="h-[100px] w-full" preserveAspectRatio="none" aria-hidden>
      <polyline points={line} fill="none" stroke="#8b5cf6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === TREND_HIGHLIGHT_INDEX ? 3.5 : 2.5} fill="#8b5cf6" />
      ))}
      {hl ? (
        <g>
          <rect x={hl.x - 34} y={hl.y - 30} width="56" height="24" rx="4" fill="#053b2a" />
          <text x={hl.x - 6} y={hl.y - 17} fontSize="9" fontWeight="bold" fill="white" textAnchor="middle">
            $7,842
          </text>
          <text x={hl.x - 6} y={hl.y - 7} fontSize="7" fill="#9ee8c4" textAnchor="middle">
            May '25
          </text>
        </g>
      ) : null}
    </svg>
  );
}

const COMMISSION_RULES_CHECKLIST = ["Percentage or fixed amount", "Tiered or slab based structures", "Product, category or brand specific", "Team or individual based rules"];

const PROCESS_STEPS = [
  { icon: BarChart3, title: "Track Performance", description: "Sales and KPIs are captured in real-time." },
  { icon: Calculator, title: "Calculate Commissions", description: "Commissions are calculated automatically based on rules." },
  { icon: CheckCircle2, title: "Review & Approve", description: "Review the summary and approve payouts." },
  { icon: Wallet, title: "Pay Your Team", description: "Pay instantly via bank transfer or wallet." },
];

const ECOSYSTEM = [
  { icon: Users, label: "Staff" },
  { icon: BarChart3, label: "Sales" },
  { icon: Wallet, label: "Payments" },
  { icon: FileText, label: "Reports" },
  { icon: DollarSign, label: "Profit & Loss" },
];

export default function StaffCommissionsPage() {
  return (
    <div data-theme="light" className="flex min-h-dvh flex-col bg-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />

      <main className="flex-1">
        

        {/* Hero */}
        <section className="px-5 pb-8 pt-8 sm:px-7 sm:pb-10">
          <div className="mx-auto flex max-w-[1320px] flex-wrap items-start gap-x-14 gap-y-12">
            <div className="min-w-[280px] max-w-[440px] flex-1 basis-[400px]">
              <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">Staff & Commissions</p>
              <h1 className="text-balance font-display text-[38px] font-bold leading-[1.1] tracking-tight text-fg sm:text-[46px]">
                {page.h1Lead} <span className="text-accent">{page.h1Highlight}</span>
              </h1>
              <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-fg-muted">{page.subhead}</p>

              <div className="mt-5 flex flex-col gap-2.5">
                {page.withList.slice(0, 3).map((item) => (
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
                  Manage Your Team <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                </Link>
                <Link
                  href="#process"
                  className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-md border border-border-strong px-3.5 py-2.5 text-[12.5px] font-medium text-fg transition-colors hover:border-accent hover:text-primary sm:gap-2 sm:px-6 sm:py-3.5 sm:text-[15px]"
                >
                  See How It Works <PlayCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                </Link>
              </div>
            </div>

            <div className="relative min-w-[300px] flex-[1.4] basis-[440px]">
              <div className="relative aspect-[16/10] overflow-hidden rounded-md">
                <Image
                  src="https://images.unsplash.com/photo-1633114072836-15d933c6d3a7?w=1000&q=80&auto=format&fit=crop"
                  alt="Two colleagues reviewing performance on a tablet"
                  fill
                  sizes="(min-width: 1024px) 45vw, 100vw"
                  className="object-cover"
                />
                <span className="absolute right-6 top-6 flex h-11 w-11 items-center justify-center rounded-full bg-accent shadow-lg">
                  <Users className="h-5 w-5 text-white" aria-hidden />
                </span>
                <span className="absolute bottom-6 right-16 flex h-11 w-11 items-center justify-center rounded-full bg-primary shadow-lg">
                  <DollarSign className="h-5 w-5 text-white" aria-hidden />
                </span>
              </div>

              <div className="absolute -bottom-8 -right-4 w-[280px] rounded-md border border-border-strong bg-white p-4 shadow-[0_30px_70px_-30px_rgba(13,21,18,0.4)] sm:-right-4 sm:w-[300px]">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[12.5px] font-semibold text-fg">This Month Overview</span>
                  <span className="text-[9.5px] text-fg-faint">May 1 – May 31, 2025</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {STAT_TILES.map((s) => (
                    <div key={s.label}>
                      <p className="text-[9.5px] leading-tight text-fg-faint">{s.label}</p>
                      <p className="mt-0.5 font-display text-[15px] font-bold text-fg">{s.value}</p>
                      <p className="text-[8.5px] text-accent">{s.delta}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Feature row */}
        <section className="bg-surface-deep px-5 py-7 sm:px-7 sm:py-10">
          <div className="mx-auto max-w-[1320px]">
            <h2 className="mb-8 text-center font-display text-[19px] font-semibold text-fg-on-deep">Everything you need to manage your team and commissions</h2>
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
              {FEATURE_ROW.map((f) => (
                <div key={f.title} className="flex flex-col items-center text-center">
                  <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10">
                    <f.icon className="h-5 w-5 text-accent-on-deep" aria-hidden />
                  </span>
                  <div className="mb-1 text-[12.5px] font-semibold text-fg-on-deep">{f.title}</div>
                  <p className="text-[10.5px] leading-relaxed text-fg-on-deep-muted">{f.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Staff table */}
        <section className="px-5 py-8 sm:px-7">
          <div className="mx-auto max-w-[1320px]">
            <div className="mb-6 max-w-[420px]">
              <h2 className="mb-3 text-balance font-display text-[26px] font-bold leading-[1.15] tracking-tight text-fg">Your Team. Their Performance.</h2>
              <p className="mb-3 text-[13.5px] leading-relaxed text-fg-muted">
                Get a real-time view of how your team is performing and how much they are earning.
              </p>
              <Link href="#process" className="text-[13px] font-medium text-primary hover:underline">
                View All Staff →
              </Link>
            </div>

            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[760px] text-[12.5px]">
                <thead>
                  <tr className="border-b border-border bg-surface-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.03em] text-fg-faint">
                    <th className="px-4 py-3">Staff Member</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Sales (This Month)</th>
                    <th className="px-4 py-3">Orders</th>
                    <th className="px-4 py-3">Commission</th>
                    <th className="px-4 py-3">Commission Rate</th>
                    <th className="px-4 py-3">Performance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {STAFF_TABLE.map((s) => (
                    <tr key={s.name}>
                      <td className="flex items-center gap-2.5 px-4 py-3 font-medium text-fg">
                        <span className="relative h-7 w-7 flex-none overflow-hidden rounded-full">
                          <Image src={`https://images.unsplash.com/${s.photo}?w=80&q=80&auto=format&fit=crop`} alt={s.name} fill sizes="28px" className="object-cover" />
                        </span>
                        {s.name}
                      </td>
                      <td className="px-4 py-3 text-fg-muted">{s.role}</td>
                      <td className="px-4 py-3 text-fg">{s.sales}</td>
                      <td className="px-4 py-3 text-fg-muted">{s.orders}</td>
                      <td className="px-4 py-3 font-semibold text-fg">{s.commission}</td>
                      <td className="px-4 py-3 text-fg">{s.rate}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-medium ${PERFORMANCE_STYLES[s.performance]}`}>{s.performance}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Breakdown + top performers + trend */}
        <section className="px-5 pb-8 sm:px-7">
          <div className="mx-auto grid max-w-[1320px] grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="rounded-md border border-border bg-white p-5">
              <p className="mb-4 text-[14px] font-semibold text-fg">Commission Breakdown</p>
              <div className="flex items-center gap-4">
                <div className="relative h-24 w-24 flex-none rounded-full" style={{ background: donutGradient(COMMISSION_BREAKDOWN) }}>
                  <div className="absolute inset-2.5 flex flex-col items-center justify-center rounded-full bg-white text-center">
                    <span className="font-display text-[14px] font-bold text-fg">$7,842</span>
                    <span className="text-[8px] text-fg-faint">Total Commissions</span>
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-2 text-[11px]">
                  {COMMISSION_BREAKDOWN.map((c) => (
                    <div key={c.label} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-fg-muted">
                        <span className="h-2 w-2 flex-none rounded-full" style={{ background: c.color }} />
                        {c.label}
                      </span>
                      <span className="font-medium text-fg">{c.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <Link href="#process" className="mt-4 inline-block text-[11.5px] font-medium text-primary hover:underline">
                View Detailed Report →
              </Link>
            </div>

            <div className="rounded-md border border-border bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-[14px] font-semibold text-fg">Top Performers</p>
                <span className="rounded-md border border-border px-2 py-1 text-[10px] text-fg-muted">This Month</span>
              </div>
              <div className="flex flex-col gap-3">
                {TOP_PERFORMERS.map((t, i) => (
                  <div key={t.name} className="flex items-center gap-2.5 text-[12.5px]">
                    <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-surface-2 text-[10px] font-semibold text-fg-muted">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-fg">{t.name}</span>
                    <span className="flex-none font-semibold text-fg">{t.commission}</span>
                  </div>
                ))}
              </div>
              <Link href="#process" className="mt-4 inline-block text-[11.5px] font-medium text-primary hover:underline">
                View Leaderboard →
              </Link>
            </div>

            <div className="rounded-md border border-border bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-[14px] font-semibold text-fg">Commission Trend</p>
                <span className="rounded-md border border-border px-2 py-1 text-[10px] text-fg-muted">Last 6 Months</span>
              </div>
              <TrendChart />
              <div className="mt-2 flex justify-between text-[9.5px] text-fg-faint">
                {TREND_MONTHS.map((m) => (
                  <span key={m}>{m}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Commission rules */}
        <section className="px-5 pb-8 sm:px-7">
          <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-14 gap-y-10">
            <div className="min-w-[280px] max-w-[420px] flex-1">
              <h2 className="mb-3 text-balance font-display text-[26px] font-bold leading-[1.15] tracking-tight text-fg">
                Flexible Commission Rules That Fit Your Business.
              </h2>
              <p className="mb-5 text-[13.5px] leading-relaxed text-fg-muted">
                Create unlimited commission plans. Set different rates for products, categories, channels, staff roles
                or custom conditions.
              </p>
              <div className="flex flex-col gap-2.5">
                {COMMISSION_RULES_CHECKLIST.map((item) => (
                  <div key={item} className="flex items-center gap-2.5 text-[13px] text-fg">
                    <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[#e3fbf1]">
                      <Check className="h-3 w-3 text-accent" aria-hidden />
                    </span>
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="min-w-[300px] flex-[1.3] rounded-md border border-border bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-[14px] font-semibold text-fg">Example Commission Plan</p>
              </div>
              <div className="mb-4 flex items-center gap-2">
                <span className="text-[13.5px] font-semibold text-fg">Sales Executive Plan</span>
                <span className="rounded-full bg-[#e3fbf1] px-2.5 py-1 text-[10.5px] font-medium text-accent">Active</span>
              </div>
              <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
                <div className="rounded-md border border-border p-3 text-center">
                  <p className="mb-1 text-[10.5px] text-fg-faint">Base Commission</p>
                  <p className="font-display text-[20px] font-bold text-fg">10%</p>
                  <p className="text-[10px] text-fg-faint">of sales</p>
                </div>
                <span className="hidden text-center text-[16px] text-fg-faint sm:block">+</span>
                <div className="rounded-md border border-border p-3 text-center">
                  <p className="mb-1 text-[10.5px] text-fg-faint">Performance Bonus</p>
                  <p className="font-display text-[20px] font-bold text-fg">2%</p>
                  <p className="text-[10px] text-fg-faint">if target achieved</p>
                </div>
                <span className="hidden text-center text-[16px] text-fg-faint sm:block">+</span>
                <div className="rounded-md border border-border p-3 text-center">
                  <p className="mb-1 text-[10.5px] text-fg-faint">High Value Bonus</p>
                  <p className="font-display text-[20px] font-bold text-fg">1.5%</p>
                  <p className="text-[10px] text-fg-faint">for high margin products</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <p className="text-[11.5px] text-fg-muted">Applies to: All Sales Executives</p>
                <Link href="#process" className="text-[11.5px] font-medium text-primary hover:underline">
                  Edit Plan →
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Process */}
        <section id="process" className="px-5 pb-8 sm:px-7">
          <div className="mx-auto max-w-[1320px] rounded-md border border-white/10 bg-surface-deep p-6 sm:p-8">
            <div className="mb-8 text-center">
              <h2 className="mb-1 font-display text-[22px] font-bold tracking-tight text-fg-on-deep">From Performance to Payout. Seamlessly.</h2>
              <p className="text-[13px] text-fg-on-deep-muted">Noxtill makes the entire commission process automatic, transparent and reliable.</p>
            </div>

            <div className="relative grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="absolute left-[12.5%] right-[12.5%] top-[26px] hidden border-t border-dashed border-white/15 sm:block" aria-hidden />
              {PROCESS_STEPS.map((s) => (
                <div key={s.title} className="relative flex flex-col items-center text-center">
                  <span className="relative z-10 mb-3 flex h-14 w-14 items-center justify-center rounded-full border-4 border-surface-deep bg-[#0a1712]">
                    <s.icon className="h-6 w-6 text-accent-on-deep" aria-hidden />
                  </span>
                  <div className="mb-1 text-[13px] font-semibold text-fg-on-deep">{s.title}</div>
                  <p className="max-w-[160px] text-[11px] leading-relaxed text-fg-on-deep-muted">{s.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <EcosystemStrip heading="Connected With Your Entire Business" items={ECOSYSTEM} />

        {/* Closing CTA */}
        <section className="relative mt-10 overflow-hidden bg-surface-deep px-5 py-7 sm:px-7 sm:py-10">
          <div className="relative mx-auto flex max-w-[1320px] flex-wrap items-center gap-6">
            <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-white/10">
              <Trophy className="h-6 w-6 text-accent-on-deep" aria-hidden />
            </span>
            <h2 className="min-w-[240px] flex-1 text-balance font-display text-[19px] font-bold leading-[1.3] text-fg-on-deep">
              Motivate your team. Reward success. <span className="text-accent-on-deep">Grow your business together.</span>
            </h2>
            <div className="flex flex-none flex-wrap gap-3">
              <Link
                href="/book-a-demo"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3.5 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
              >
                Manage Your Team <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/book-a-demo"
                className="inline-flex items-center rounded-md border border-border-on-deep px-6 py-3.5 text-[15px] font-medium text-fg-on-deep transition-colors hover:border-fg-on-deep-muted"
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

import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Building2,
  Calculator,
  Check,
  ClipboardList,
  CreditCard,
  DollarSign,
  FileText,
  Layers,
  PieChart,
  PlayCircle,
  Receipt,
  Settings2,
  Shield,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { DetailRelated } from "@/components/site/detail-page-sections";
import { EcosystemStrip } from "@/components/site/ecosystem-strip";
import { findProductDetailPage } from "@/lib/marketing/product-detail-content";

const page = findProductDetailPage("pnl")!;

export const metadata: Metadata = {
  title: page.metaTitle,
  description: page.metaDescription,
  alternates: { canonical: "https://noxtill.com/product/pnl/" },
  openGraph: {
    type: "website",
    url: "https://noxtill.com/product/pnl/",
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
        { "@type": "ListItem", position: 3, name: "Profit & Loss", item: "https://noxtill.com/product/pnl/" },
      ],
    },
    {
      "@type": "Article",
      headline: page.metaTitle,
      description: page.metaDescription,
      url: "https://noxtill.com/product/pnl/",
    },
  ],
};

const STAT_TILES = [
  { label: "Total Revenue", value: "$48,750", delta: "↑ 18.5% vs last month", up: true },
  { label: "Total Cost of Goods Sold", value: "$21,430", delta: "↑ 12.2% vs last month", up: true },
  { label: "Total Expenses", value: "$8,620", delta: "↓ 4.3% vs last month", up: false },
  { label: "Net Profit", value: "$18,700", delta: "↑ 26.8% vs last month", up: true },
];

const TREND_LABELS = ["May 1", "May 8", "May 15", "May 22", "May 29"];
const TREND_VALUES = [8500, 11200, 16480, 14100, 20200];
const TREND_HIGHLIGHT_INDEX = 2;

function TrendChart() {
  const max = Math.max(...TREND_VALUES);
  const min = Math.min(...TREND_VALUES) * 0.7;
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
      <polyline points={line} fill="none" stroke="#0ea86a" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === TREND_HIGHLIGHT_INDEX ? 3.5 : 2.5} fill="#0ea86a" />
      ))}
      {hl ? (
        <g>
          <line x1={hl.x} y1={hl.y} x2={hl.x} y2={h + 14} stroke="#d6ddd9" strokeDasharray="2 2" />
          <rect x={hl.x - 26} y={hl.y - 26} width="52" height="20" rx="4" fill="#053b2a" />
          <text x={hl.x} y={hl.y - 12} fontSize="9" fill="white" textAnchor="middle">
            $16,480
          </text>
        </g>
      ) : null}
    </svg>
  );
}

const BREAKDOWN_SLICES = [
  { label: "Revenue", value: 48750, color: "#10b981" },
  { label: "Cost of Goods Sold", value: 21430, color: "#f97316" },
  { label: "Expenses", value: 8620, color: "#3b82f6" },
];

function donutGradient(slices: { value: number; color: string }[]) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  let acc = 0;
  const stops = slices.map((s) => {
    const start = (acc / total) * 100;
    acc += s.value;
    const end = (acc / total) * 100;
    return `${s.color} ${start}% ${end}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

const DRIVERS = [
  { icon: DollarSign, tint: "bg-[#e3fbf1]", color: "text-accent", title: "Revenue", description: "Track all your income sources in one place with real-time updates." },
  { icon: ShoppingCart, tint: "bg-violet-50", color: "text-violet-600", title: "Cost of Goods Sold", description: "Understand product costs and their impact on your overall profitability." },
  { icon: Wallet, tint: "bg-blue-50", color: "text-blue-600", title: "Operating Expenses", description: "Monitor daily operating expenses and control your spending." },
  { icon: PieChart, tint: "bg-orange-50", color: "text-orange-600", title: "Other Income", description: "Add and track other income streams that contribute to your business." },
  { icon: BarChart3, tint: "bg-teal-50", color: "text-teal-600", title: "Net Profit", description: "See your true profit after all costs and expenses are accounted for." },
];

const TOP_PROFIT_PRODUCTS = [
  { name: "Wireless Headphones", value: "$8,240", pct: 100 },
  { name: "Smart Watch", value: "$5,120", pct: 62 },
  { name: "Phone Case", value: "$2,430", pct: 29 },
  { name: "Charger Cable", value: "$1,250", pct: 15 },
];

const EXPENSE_TREND_LABELS = ["May 1", "May 15", "May 31"];
const EXPENSE_TREND_VALUES = [6800, 8100, 8620];

function MiniTrend({ values, height = 60 }: { values: number[]; height?: number }) {
  const max = Math.max(...values);
  const min = Math.min(...values) * 0.85;
  const w = 200;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = height - ((v - min) / (max - min)) * height;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none" aria-hidden>
      <polyline points={points} fill="none" stroke="#4fe3a8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const PNL_STATEMENT = [
  { label: "Total Revenue", value: "$48,750" },
  { label: "(-) Cost of Goods Sold", value: "$21,430" },
  { label: "Gross Profit", value: "$27,320", bold: true },
  { label: "(-) Operating Expenses", value: "$8,620" },
  { label: "(-) Other Expenses", value: "$0" },
  { label: "Other Income", value: "$0" },
  { label: "Net Profit", value: "$18,700", bold: true, accent: true },
];

const COMPARE_ROWS = [
  { label: "Revenue", thisMonth: "$48,750", lastMonth: "$41,120", change: "↑ 18.5%", up: true },
  { label: "COGS", thisMonth: "$21,430", lastMonth: "$19,090", change: "↑ 12.2%", up: true },
  { label: "Expenses", thisMonth: "$8,620", lastMonth: "$9,010", change: "↓ 4.3%", up: false },
  { label: "Net Profit", thisMonth: "$18,700", lastMonth: "$15,620", change: "↑ 19.7%", up: true },
  { label: "Net Profit Margin", thisMonth: "38.3%", lastMonth: "38.0%", change: "↑ 0.3%", up: true },
];

const REPORTS = [
  { icon: FileText, tint: "bg-[#e3fbf1]", color: "text-accent", title: "Profit & Loss Statement", description: "Standard P&L report for any period." },
  { icon: BarChart3, tint: "bg-violet-50", color: "text-violet-600", title: "Summary Report", description: "High-level summary of profitability." },
  { icon: Receipt, tint: "bg-blue-50", color: "text-blue-600", title: "Expense Report", description: "Detailed view of all expenses." },
  { icon: PieChart, tint: "bg-orange-50", color: "text-orange-600", title: "Category Report", description: "Profit by product or service category." },
  { icon: Building2, tint: "bg-teal-50", color: "text-teal-600", title: "Branch Report", description: "Compare profit across branches." },
  { icon: Settings2, tint: "bg-sky-50", color: "text-sky-600", title: "Custom Report", description: "Build custom reports that fit your business." },
];

const ECOSYSTEM = [
  { icon: Zap, label: "Fast Sale" },
  { icon: ClipboardList, label: "Orders" },
  { icon: ShoppingCart, label: "Purchases" },
  { icon: Boxes, label: "Inventory" },
  { icon: CreditCard, label: "Payments" },
  { icon: Users, label: "Customers" },
  { icon: Receipt, label: "Expenses" },
];

const CLOSING_CHECKLIST = [
  { icon: TrendingUp, label: "Real-time clarity" },
  { icon: Sparkles, label: "Smarter decisions" },
  { icon: Shield, label: "Stronger growth" },
];

export default function ProfitAndLossPage() {
  return (
    <div data-theme="light" className="flex min-h-dvh flex-col bg-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />

      <main className="flex-1">
        

        {/* Hero */}
        <section className="relative mt-5 overflow-hidden px-5 pb-8 pt-8 sm:px-7 sm:pb-10">
          <div
            className="pointer-events-none absolute -right-10 -top-10 h-[260px] w-[260px] rotate-12 text-accent/10"
            style={{ backgroundImage: "radial-gradient(currentColor 1.5px, transparent 1.5px)", backgroundSize: "16px 16px" }}
            aria-hidden
          />
          <div className="relative mx-auto flex max-w-[1320px] flex-wrap items-start gap-x-14 gap-y-12">
            <div className="min-w-[300px] max-w-[500px] flex-1 basis-[440px]">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#e3fbf1] px-3.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#0b7a4c]">
                <BarChart3 className="h-3.5 w-3.5" aria-hidden /> Profit & Loss
              </div>
              <h1 className="text-balance font-display text-[40px] font-bold leading-[1.1] tracking-tight text-fg sm:text-[50px]">
                {page.h1Lead} <span className="text-accent">{page.h1Highlight}</span>
              </h1>
              <p className="mt-4 text-[16px] font-semibold text-fg">Real numbers. Clear insights. Better business decisions.</p>
              <p className="mt-3 max-w-[48ch] text-[15px] leading-relaxed text-fg-muted">{page.subhead}</p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  href="/book-a-demo"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-6.5 py-3.5 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
                >
                  Explore Profit & Loss <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link
                  href="#drivers"
                  className="inline-flex items-center gap-2 rounded-md border border-border-strong px-6 py-3.5 text-[15px] font-medium text-fg transition-colors hover:border-accent hover:text-primary"
                >
                  See How It Works <PlayCircle className="h-4 w-4" aria-hidden />
                </Link>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                {page.benefits.map((b) => (
                  <div key={b.label} className="flex flex-col items-start gap-2">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e3fbf1]">
                      <b.icon className="h-5 w-5 text-accent" aria-hidden />
                    </span>
                    <span className="text-[12.5px] font-medium leading-tight text-fg">{b.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="min-w-[340px] flex-1 basis-[560px]">
              <div className="rounded-md border border-border-strong bg-white p-4 shadow-[0_50px_100px_-45px_rgba(13,21,18,0.35)] sm:p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[14.5px] font-semibold text-fg">Profit & Loss Overview</span>
                  <div className="flex items-center gap-2 text-[10.5px] text-fg-muted">
                    <span className="rounded-md border border-border px-2.5 py-1">This Month ⌄</span>
                    <span className="rounded-md border border-border px-2.5 py-1">All Branches ⌄</span>
                  </div>
                </div>

                <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {STAT_TILES.map((s) => (
                    <div key={s.label} className="rounded-md border border-border p-2.5">
                      <p className="text-[9.5px] leading-tight text-fg-faint">{s.label}</p>
                      <p className="mt-1 font-display text-[15px] font-bold text-fg">{s.value}</p>
                      <p className={`text-[8.5px] ${s.up ? "text-accent" : "text-red-600"}`}>{s.delta}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.3fr_1fr]">
                  <div className="rounded-md border border-border p-3">
                    <p className="mb-2 text-[11.5px] font-semibold text-fg">Profit Trend</p>
                    <TrendChart />
                    <div className="mt-1 flex justify-between text-[8.5px] text-fg-faint">
                      {TREND_LABELS.map((l) => (
                        <span key={l}>{l}</span>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-md border border-border p-3">
                    <p className="mb-2 text-[11.5px] font-semibold text-fg">Profit Breakdown</p>
                    <div className="flex items-center gap-3">
                      <div className="relative h-16 w-16 flex-none rounded-full" style={{ background: donutGradient(BREAKDOWN_SLICES) }}>
                        <div className="absolute inset-2 flex flex-col items-center justify-center rounded-full bg-white text-center">
                          <span className="text-[10px] font-bold text-fg">$18,700</span>
                          <span className="text-[6px] leading-tight text-fg-faint">Net Profit</span>
                        </div>
                      </div>
                      <div className="flex flex-1 flex-col gap-1 text-[9px]">
                        {BREAKDOWN_SLICES.map((s) => (
                          <div key={s.label} className="flex items-center gap-1 truncate text-fg-muted">
                            <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: s.color }} />
                            <span className="truncate">{s.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 rounded-md border border-border bg-surface-2 p-3 text-center">
                  <div>
                    <p className="text-[9.5px] text-fg-faint">Gross Profit</p>
                    <p className="text-[13px] font-bold text-fg">$27,320</p>
                  </div>
                  <div>
                    <p className="text-[9.5px] text-fg-faint">Gross Profit Margin</p>
                    <p className="text-[13px] font-bold text-fg">56.0%</p>
                  </div>
                  <div>
                    <p className="text-[9.5px] text-fg-faint">Net Profit Margin</p>
                    <p className="text-[13px] font-bold text-fg">38.3%</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Know what drives your profit */}
        <section id="drivers" className="px-5 pb-8 sm:px-7">
          <div className="mx-auto max-w-[1320px]">
            <div className="mb-10 text-center">
              <h2 className="font-display text-[26px] font-bold tracking-tight text-fg sm:text-[30px]">Know what drives your profit.</h2>
              <div className="mx-auto mt-3 h-[3px] w-10 rounded-full bg-accent" />
              <p className="mt-3 text-[14px] text-fg-muted">Noxtill Profit & Loss helps you break down your numbers and focus on what truly matters.</p>
            </div>

            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
              {DRIVERS.map((d) => (
                <div key={d.title} className="flex flex-col items-center text-center">
                  <span className={`mb-3 flex h-12 w-12 items-center justify-center rounded-full ${d.tint}`}>
                    <d.icon className={`h-5 w-5 ${d.color}`} aria-hidden />
                  </span>
                  <div className="mb-1 text-[13.5px] font-semibold text-fg">{d.title}</div>
                  <p className="text-[11.5px] leading-relaxed text-fg-muted">{d.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Insights */}
        <section className="px-5 pb-8 sm:px-7">
          <div className="mx-auto max-w-[1320px] rounded-md border border-white/10 bg-surface-deep p-6 sm:p-8">
            <div className="mb-8 flex flex-wrap items-center gap-x-14 gap-y-6">
              <div className="min-w-[240px] max-w-[300px] flex-1">
                <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-on-deep">Smart financial insights</p>
                <h2 className="mb-3 text-balance font-display text-[24px] font-bold leading-[1.15] tracking-tight text-fg-on-deep">
                  Insights that help you make better decisions.
                </h2>
                <p className="mb-4 text-[13px] leading-relaxed text-fg-on-deep-muted">
                  Go beyond numbers. Understand trends, spot problems early and identify opportunities to grow your
                  business.
                </p>
                <Link
                  href="/book-a-demo"
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground hover:bg-primary-hover"
                >
                  Explore Insights <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </div>

              <div className="grid min-w-[280px] flex-[2.2] grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="rounded-md border border-white/10 bg-[#0a1712] p-3">
                  <p className="mb-2 text-[11px] font-semibold text-fg-on-deep">Top Profit Products</p>
                  <div className="flex flex-col gap-2">
                    {TOP_PROFIT_PRODUCTS.map((p) => (
                      <div key={p.name}>
                        <div className="mb-1 flex items-center justify-between text-[9px]">
                          <span className="truncate text-fg-on-deep-muted">{p.name}</span>
                          <span className="flex-none font-medium text-fg-on-deep">{p.value}</span>
                        </div>
                        <div className="h-1 rounded-full bg-white/10">
                          <div className="h-1 rounded-full bg-accent-on-deep" style={{ width: `${p.pct}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <Link href="/book-a-demo" className="mt-2 inline-block text-[9.5px] font-medium text-accent-on-deep hover:underline">
                    View All Products →
                  </Link>
                </div>

                <div className="rounded-md border border-white/10 bg-[#0a1712] p-3">
                  <p className="mb-2 text-[11px] font-semibold text-fg-on-deep">Profit by Category</p>
                  <div className="relative mx-auto h-16 w-16 rounded-full" style={{ background: donutGradient(BREAKDOWN_SLICES) }}>
                    <div className="absolute inset-2 flex flex-col items-center justify-center rounded-full bg-[#0a1712] text-center">
                      <span className="text-[9.5px] font-bold text-fg-on-deep">$18,700</span>
                      <span className="text-[6px] text-fg-on-deep-faint">Net Profit</span>
                    </div>
                  </div>
                  <Link href="/book-a-demo" className="mt-3 inline-block text-[9.5px] font-medium text-accent-on-deep hover:underline">
                    View All Categories →
                  </Link>
                </div>

                <div className="rounded-md border border-white/10 bg-[#0a1712] p-3">
                  <p className="mb-2 text-[11px] font-semibold text-fg-on-deep">Expense Trend</p>
                  <MiniTrend values={EXPENSE_TREND_VALUES} height={50} />
                  <div className="mt-1 flex justify-between text-[8px] text-fg-on-deep-faint">
                    {EXPENSE_TREND_LABELS.map((l) => (
                      <span key={l}>{l}</span>
                    ))}
                  </div>
                  <Link href="/book-a-demo" className="mt-2 inline-block text-[9.5px] font-medium text-accent-on-deep hover:underline">
                    View Expense Report →
                  </Link>
                </div>

                <div className="rounded-md border border-white/10 bg-[#0a1712] p-3">
                  <p className="mb-2 text-[11px] font-semibold text-fg-on-deep">Profit Margin</p>
                  <p className="font-display text-[22px] font-bold text-fg-on-deep">38.3%</p>
                  <p className="mb-1 text-[9px] text-accent-on-deep">↑ 8.7% vs last month</p>
                  <MiniTrend values={[30, 33, 34, 36, 38.3]} height={30} />
                  <Link href="/book-a-demo" className="mt-1 inline-block text-[9.5px] font-medium text-accent-on-deep hover:underline">
                    View Margin Details →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Detailed breakdown */}
        <section className="px-5 pb-8 sm:px-7">
          <div className="mx-auto flex max-w-[1320px] flex-wrap gap-x-10 gap-y-12">
            <div className="min-w-[280px] flex-1 basis-[440px]">
              <h2 className="mb-3 text-balance font-display text-[24px] font-bold leading-[1.15] tracking-tight text-fg">Detailed breakdown.</h2>
              <p className="mb-4 max-w-[42ch] text-[13.5px] leading-relaxed text-fg-muted">
                Every number in your Profit & Loss is just a click away. Drill down and see the details behind your
                performance.
              </p>
              <Link href="/book-a-demo" className="mb-5 inline-block text-[13px] font-medium text-primary hover:underline">
                View Detailed Report →
              </Link>

              <div className="rounded-md border border-border bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[12.5px] font-semibold text-fg">Profit & Loss Statement</p>
                  <p className="text-[10px] text-fg-faint">May 1 – May 31, 2025</p>
                </div>
                <div className="flex flex-col divide-y divide-border text-[12px]">
                  {PNL_STATEMENT.map((r) => (
                    <div key={r.label} className="flex items-center justify-between py-1.5">
                      <span className={r.bold ? "font-semibold text-fg" : "text-fg-muted"}>{r.label}</span>
                      <span className={`font-medium ${r.accent ? "text-accent" : r.bold ? "text-fg" : "text-fg"}`}>{r.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="min-w-[280px] flex-1 basis-[440px]">
              <h2 className="mb-3 text-balance font-display text-[24px] font-bold leading-[1.15] tracking-tight text-fg">Compare. Learn. Improve.</h2>
              <p className="mb-4 max-w-[44ch] text-[13.5px] leading-relaxed text-fg-muted">
                Compare your performance across periods to understand growth, seasonality and trends.
              </p>
              <Link href="/book-a-demo" className="mb-5 inline-block text-[13px] font-medium text-primary hover:underline">
                Compare Periods →
              </Link>

              <div className="overflow-x-auto rounded-md border border-border bg-white">
                <table className="w-full min-w-[440px] text-[11.5px]">
                  <thead>
                    <tr className="border-b border-border text-left text-[9.5px] font-semibold uppercase tracking-[0.03em] text-fg-faint">
                      <th className="px-3 py-2.5">Metric</th>
                      <th className="px-3 py-2.5">This Month</th>
                      <th className="px-3 py-2.5">Last Month</th>
                      <th className="px-3 py-2.5">Change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {COMPARE_ROWS.map((r) => (
                      <tr key={r.label}>
                        <td className="px-3 py-2 font-medium text-fg">{r.label}</td>
                        <td className="px-3 py-2 text-fg">{r.thisMonth}</td>
                        <td className="px-3 py-2 text-fg-faint">{r.lastMonth}</td>
                        <td className={`px-3 py-2 font-medium ${r.up ? "text-accent" : "text-red-600"}`}>{r.change}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* Reports */}
        <section className="px-5 pb-8 sm:px-7">
          <div className="mx-auto max-w-[1320px]">
            <div className="mb-10 text-center">
              <h2 className="font-display text-[24px] font-bold tracking-tight text-fg">Reports for every need.</h2>
              <p className="mt-2 text-[13.5px] text-fg-muted">Access beautiful, easy-to-understand reports anytime.</p>
            </div>
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
              {REPORTS.map((r) => (
                <div key={r.title} className="flex flex-col items-center text-center">
                  <span className={`mb-3 flex h-11 w-11 items-center justify-center rounded-full ${r.tint}`}>
                    <r.icon className={`h-5 w-5 ${r.color}`} aria-hidden />
                  </span>
                  <div className="mb-1 text-[12.5px] font-semibold text-fg">{r.title}</div>
                  <p className="text-[10.5px] leading-relaxed text-fg-muted">{r.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <EcosystemStrip heading="Connected to Your Entire Business" subheading="Profit & Loss uses real data from across Noxtill — sales, purchases, payments, inventory, expenses and more." items={ECOSYSTEM} />

        {/* Closing CTA */}
        <section className="relative mt-10 overflow-hidden bg-surface-deep px-5 py-7 sm:px-7 sm:py-8">
          <BarChart3 className="pointer-events-none absolute -right-4 bottom-0 h-40 w-40 text-accent-on-deep/10 sm:h-52 sm:w-52" aria-hidden strokeWidth={1} />

          <div className="relative mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-6">
            <div className="min-w-[280px] flex-1 basis-[400px]">
              <h2 className="mb-3 text-balance font-display text-[26px] font-bold leading-[1.15] tracking-tight text-fg-on-deep sm:text-[30px]">
                Understand today. Plan tomorrow. <span className="text-accent-on-deep">Grow your business.</span>
              </h2>
              <p className="mb-4 max-w-[50ch] text-[13.5px] leading-relaxed text-fg-on-deep-muted">{page.pullQuote}</p>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {CLOSING_CHECKLIST.map((c) => (
                  <div key={c.label} className="flex items-center gap-1.5 text-[12.5px] text-fg-on-deep-muted">
                    <c.icon className="h-3.5 w-3.5 flex-none text-accent-on-deep" aria-hidden />
                    {c.label}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-none flex-wrap gap-3">
              <Link
                href="/book-a-demo"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-6.5 py-3.5 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
              >
                Explore Profit & Loss <ArrowRight className="h-4 w-4" aria-hidden />
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

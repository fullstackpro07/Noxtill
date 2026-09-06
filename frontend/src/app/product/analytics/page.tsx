import type { Metadata } from "next";
import Link from "next/link";
import {
  Award,
  ArrowRight,
  BarChart3,
  Bell,
  Boxes,
  CalendarCheck,
  Check,
  Database,
  Filter,
  FileSpreadsheet,
  FileText,
  LayoutGrid,
  LineChart,
  Mail,
  MessageSquare,
  PackageCheck,
  PieChart,
  PlayCircle,
  Send,
  Share2,
  Sliders,
  Users,
  Wallet,
} from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { DetailRelated } from "@/components/site/detail-page-sections";
import { findProductDetailPage } from "@/lib/marketing/product-detail-content";

const page = findProductDetailPage("analytics")!;

export const metadata: Metadata = {
  title: page.metaTitle,
  description: page.metaDescription,
  alternates: { canonical: "https://noxtill.com/product/analytics/" },
  openGraph: {
    type: "website",
    url: "https://noxtill.com/product/analytics/",
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
        { "@type": "ListItem", position: 3, name: "Analytics", item: "https://noxtill.com/product/analytics/" },
      ],
    },
    {
      "@type": "Article",
      headline: page.metaTitle,
      description: page.metaDescription,
      url: "https://noxtill.com/product/analytics/",
    },
  ],
};

const NAV_ITEMS = ["Overview", "Revenue Sources", "Customer Retention", "Cohorts", "Staff Performance", "Channel Breakdown", "Product Analytics", "Trends", "Custom Reports", "Saved Views"];

const STAT_TILES = [
  { label: "Total Revenue", value: "$48,750", delta: "↑ 18.5% vs Apr 1 – Apr 30" },
  { label: "Repeat-Customer Rate", value: "42.6%", delta: "↑ 6.1% vs Apr 1 – Apr 30" },
  { label: "Avg. Order Value", value: "$39.20", delta: "↑ 4.3% vs Apr 1 – Apr 30" },
  { label: "New vs Returning", value: "38% / 62%", delta: "↑ 3.2% returning" },
];

const TREND_LABELS = ["May 1", "May 8", "May 15", "May 22", "May 29"];
const TREND_VALUES = [22000, 26000, 34420, 30000, 40000];
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
            $34,420
          </text>
        </g>
      ) : null}
    </svg>
  );
}

const REVENUE_CHANNELS = [
  { label: "In-store", value: "$20,140 (41.3%)", pct: 41.3, color: "#3b82f6" },
  { label: "Online Store", value: "$16,620 (34.0%)", pct: 34.0, color: "#8b5cf6" },
  { label: "Marketplace", value: "$9,480 (19.4%)", pct: 19.4, color: "#10b981" },
  { label: "Referral", value: "$3,910 (8.0%)", pct: 8.0, color: "#f59e0b" },
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

const EMPOWERS = [
  { icon: Database, title: "Built From Real Data", description: "Every metric traces back to an actual sale or booking." },
  { icon: Users, title: "Retention, Automatically", description: "Repeat-visit rate calculated with zero manual tagging." },
  { icon: Sliders, title: "Segment Any Way", description: "By staff, item, channel or time period, instantly." },
  { icon: LineChart, title: "Trend Over Time", description: "See if growth is real or just a one-off rush." },
  { icon: Share2, title: "Share & Export", description: "Send any breakdown to your team or clients in seconds." },
];

const REVENUE_WEEKS = [
  { label: "W1", pct: 55 },
  { label: "W2", pct: 68 },
  { label: "W3", pct: 48 },
  { label: "W4", pct: 82 },
  { label: "W5", pct: 100 },
];

const STAFF_MINI = [
  { name: "T. Nguyen", pct: 100, sales: "$5,940" },
  { name: "A. Rossi", pct: 81, sales: "$4,820" },
  { name: "S. Malik", pct: 52, sales: "$3,110" },
  { name: "J. Park", pct: 41, sales: "$2,430" },
];

const COHORT_GRID = [
  [1, 0.8, 0.6, 0.5, 0.4, 0.3],
  [1, 0.7, 0.55, 0.42, 0.35, 0.28],
  [1, 0.75, 0.5, 0.38, 0.3, 0.22],
  [1, 0.82, 0.62, 0.48, 0.36, 0.3],
];

const PRODUCT_MINI = [
  { name: "Wireless Headphones", pct: 100, sold: 256 },
  { name: "Wall Charger", pct: 78, sold: 278 },
  { name: "Smart Watch", pct: 74, sold: 189 },
  { name: "USB-C Cable", pct: 65, sold: 512 },
];

const DATA_SOURCES = [
  { icon: BarChart3, label: "Sales" },
  { icon: Users, label: "Customers" },
  { icon: Award, label: "Staff" },
  { icon: Share2, label: "Channels" },
  { icon: Boxes, label: "Products" },
  { icon: Wallet, label: "Payments" },
  { icon: PackageCheck, label: "Bookings" },
  { icon: FileText, label: "Time Period" },
];

const REPORT_COLUMNS = ["Staff", "Sales", "Orders", "Retention %"];
const REPORT_FILTERS = ["Date Range: This Month", "Channel: All"];
const REPORT_PREVIEW = [
  { staff: "T. Nguyen", sales: "$5,940", orders: 62, retention: "48%" },
  { staff: "A. Rossi", sales: "$4,820", orders: 51, retention: "44%" },
  { staff: "J. Park", sales: "$2,430", orders: 28, retention: "39%" },
  { staff: "S. Malik", sales: "$3,110", orders: 34, retention: "31%" },
];

const CUSTOM_CHECKLIST = ["Drag & drop analytics builder", "Advanced filters & segments", "Custom metrics & KPIs", "Save and reuse your views"];

const VISUALS = [
  { icon: LayoutGrid, label: "Table" },
  { icon: BarChart3, label: "Line Chart" },
  { icon: BarChart3, label: "Bar Chart" },
  { icon: PieChart, label: "Pie Chart" },
  { icon: BarChart3, label: "Area Chart" },
  { icon: PieChart, label: "Donut Chart" },
];

const DELIVERY_STEPS = [
  { icon: CalendarCheck, title: "Schedule", description: "Set frequency: daily, weekly, monthly or custom." },
  { icon: Send, title: "Deliver", description: "Get insights on WhatsApp, Email, Slack or other channels." },
  { icon: FileSpreadsheet, title: "Formats", description: "PDF, Excel, CSV and Google Sheets — your choice." },
  { icon: Bell, title: "Never Miss", description: "Always stay updated with automated insights." },
];

const CLOSING_CHECKLIST = ["Real transaction data", "Retention, automatically", "Segment by staff or channel", "Trend over time", "Share with anyone", "Zero manual setup"];

export default function AnalyticsPage() {
  return (
    <div data-theme="light" className="flex min-h-dvh flex-col bg-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="px-5 pb-8 pt-8 sm:px-7 sm:pb-10">
          <div className="mx-auto flex max-w-[1320px] flex-wrap items-start gap-x-14 gap-y-12">
            <div className="min-w-[280px] max-w-[440px] flex-1 basis-[400px]">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#e3fbf1] px-3.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#0b7a4c]">
                <LineChart className="h-3.5 w-3.5" aria-hidden /> Analytics
              </div>
              <h1 className="text-balance font-display text-[38px] font-bold leading-[1.1] tracking-tight text-fg sm:text-[46px]">
                {page.h1Lead} <span className="text-accent">{page.h1Highlight}</span>
              </h1>
              <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-fg-muted">{page.subhead}</p>

              <div className="mt-5 flex flex-col gap-2.5">
                {page.withList.slice(0, 3).map((item) => (
                  <div key={item} className="flex items-center gap-2.5 text-[13.5px] text-fg">
                    <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[#e3fbf1]">
                      <Check className="h-3 w-3 text-accent" aria-hidden />
                    </span>
                    {item}
                  </div>
                ))}
              </div>

              <div className="mt-7 flex flex-nowrap items-center gap-2 sm:gap-3">
                <Link
                  href="/book-a-demo"
                  className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3.5 py-2.5 text-[12.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover sm:gap-2 sm:px-6 sm:py-3.5 sm:text-[15px]"
                >
                  Explore Analytics <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                </Link>
                <Link
                  href="#empowers"
                  className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-md border border-border-strong px-3.5 py-2.5 text-[12.5px] font-medium text-fg transition-colors hover:border-accent hover:text-primary sm:gap-2 sm:px-6 sm:py-3.5 sm:text-[15px]"
                >
                  See How It Works <PlayCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                </Link>
              </div>
            </div>

            <div className="min-w-[340px] flex-[1.5] basis-[600px]">
              <div className="flex overflow-hidden rounded-md border border-border-strong bg-white shadow-[0_50px_100px_-45px_rgba(13,21,18,0.35)]">
                <div className="hidden w-[140px] flex-none border-r border-border bg-surface-2 p-3 md:block">
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-fg">
                    <LineChart className="h-3.5 w-3.5 text-accent" aria-hidden /> Analytics
                  </p>
                  <div className="flex flex-col gap-0.5">
                    {NAV_ITEMS.map((item, i) => (
                      <span
                        key={item}
                        className={`truncate rounded-md px-2 py-1.5 text-[10.5px] ${i === 0 ? "bg-white font-medium text-fg shadow-sm" : "text-fg-muted"}`}
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex-1 p-4 sm:p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[14.5px] font-semibold text-fg">Analytics Overview</span>
                    <div className="flex items-center gap-2 text-[10.5px] text-fg-muted">
                      <span className="rounded-md border border-border px-2.5 py-1">May 1 – May 31, 2025 ⌄</span>
                      <span className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1">
                        <Filter className="h-3 w-3" aria-hidden /> Filter
                      </span>
                    </div>
                  </div>

                  <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    {STAT_TILES.map((s) => (
                      <div key={s.label} className="rounded-md border border-border p-2.5">
                        <p className="text-[9.5px] leading-tight text-fg-faint">{s.label}</p>
                        <p className="mt-1 font-display text-[15px] font-bold text-fg">{s.value}</p>
                        <p className="text-[8.5px] text-accent">{s.delta}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.3fr_1fr]">
                    <div className="rounded-md border border-border p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-[11.5px] font-semibold text-fg">Revenue Trend</p>
                        <span className="flex items-center gap-2 text-[9px] text-fg-faint">
                          <span className="flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> This Month
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-border-strong" /> Last Month
                          </span>
                        </span>
                      </div>
                      <TrendChart />
                      <div className="mt-1 flex justify-between text-[8.5px] text-fg-faint">
                        {TREND_LABELS.map((l) => (
                          <span key={l}>{l}</span>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-md border border-border p-3">
                      <p className="mb-2 text-[11.5px] font-semibold text-fg">Revenue by Channel</p>
                      <div className="flex items-center gap-3">
                        <div className="relative h-16 w-16 flex-none rounded-full" style={{ background: donutGradient(REVENUE_CHANNELS) }}>
                          <div className="absolute inset-2 flex flex-col items-center justify-center rounded-full bg-white text-center">
                            <span className="text-[10px] font-bold text-fg">$48,750</span>
                            <span className="text-[6px] leading-tight text-fg-faint">Total Revenue</span>
                          </div>
                        </div>
                        <div className="flex flex-1 flex-col gap-1 text-[9px]">
                          {REVENUE_CHANNELS.map((s) => (
                            <div key={s.label} className="flex items-center gap-1 truncate text-fg-muted">
                              <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: s.color }} />
                              <span className="truncate">
                                {s.label} <span className="text-fg-faint">{s.value}</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-3 rounded-md border border-border bg-surface-2 p-3">
                    <LineChart className="h-6 w-6 flex-none text-accent" aria-hidden />
                    <div>
                      <p className="text-[11.5px] font-semibold text-fg">Analytics update in real-time</p>
                      <p className="text-[10px] text-fg-muted">Every breakdown reflects your latest transactions as they happen.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Empowers */}
        <section id="empowers" className="bg-surface-deep px-5 py-10 sm:px-7 sm:py-12">
          <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-10 gap-y-8">
            <div className="min-w-[220px] max-w-[280px] flex-none">
              <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-on-deep">Analytics that empowers</p>
              <h2 className="text-balance font-display text-[22px] font-bold leading-[1.25] tracking-tight text-fg-on-deep sm:text-[26px]">
                From data to decisions. From decisions to growth.
              </h2>
            </div>

            <div className="grid min-w-[320px] flex-1 grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
              {EMPOWERS.map((e) => (
                <div key={e.title} className="flex flex-col items-center text-center">
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
                    <e.icon className="h-5 w-5 text-accent-on-deep" aria-hidden />
                  </span>
                  <p className="mb-1 text-[13px] font-semibold text-fg-on-deep">{e.title}</p>
                  <p className="text-[11px] leading-relaxed text-fg-on-deep-muted">{e.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Built for every question */}
        <section className="px-5 py-8 sm:px-7">
          <div className="mx-auto max-w-[1320px]">
            <div className="mb-10 flex flex-wrap items-start gap-x-14 gap-y-6">
              <div className="min-w-[220px] max-w-[280px] flex-1">
                <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">Built for every question</p>
                <h2 className="text-balance font-display text-[24px] font-bold leading-[1.2] tracking-tight text-fg">
                  The right breakdown for every part of your business.
                </h2>
              </div>
              <p className="min-w-[220px] max-w-[46ch] flex-1 text-[13.5px] leading-relaxed text-fg-muted">
                Whether you need a quick retention check or a full staff performance comparison, Noxtill Analytics has
                you covered. Track trends, spot what&apos;s working and stay in control.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {/* Revenue Analytics — mini bar chart */}
              <div className="rounded-md border border-border bg-white p-5">
                <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#e3fbf1]">
                  <BarChart3 className="h-5 w-5 text-accent" aria-hidden />
                </span>
                <p className="mb-1.5 text-[15px] font-semibold text-fg">Revenue Analytics</p>
                <p className="mb-3 text-[12.5px] leading-relaxed text-fg-muted">Track revenue by product, channel, staff and time period.</p>
                <div className="mb-3 flex h-16 items-end gap-1.5">
                  {REVENUE_WEEKS.map((w) => (
                    <div key={w.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                      <div className="w-full rounded-t-sm bg-accent" style={{ height: `${w.pct}%` }} />
                      <span className="text-[8px] text-fg-faint">{w.label}</span>
                    </div>
                  ))}
                </div>
                <Link href="/book-a-demo" className="text-[12.5px] font-medium text-primary hover:underline">
                  View Sample →
                </Link>
              </div>

              {/* Customer Analytics — mini retention ring */}
              <div className="rounded-md border border-border bg-white p-5">
                <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#e3fbf1]">
                  <Users className="h-5 w-5 text-accent" aria-hidden />
                </span>
                <p className="mb-1.5 text-[15px] font-semibold text-fg">Customer Analytics</p>
                <p className="mb-3 text-[12.5px] leading-relaxed text-fg-muted">Retention, repeat-visit rate, lifetime value and churn.</p>
                <div className="mb-3 flex items-center gap-3">
                  <div className="relative h-14 w-14 flex-none rounded-full" style={{ background: `conic-gradient(#0ea86a 0% 42.6%, #eceeed 42.6% 100%)` }}>
                    <div className="absolute inset-1.5 flex items-center justify-center rounded-full bg-white">
                      <span className="text-[11px] font-bold text-fg">43%</span>
                    </div>
                  </div>
                  <div className="text-[11px] text-fg-muted">
                    <p>
                      <span className="font-semibold text-fg">Repeat customers</span>
                    </p>
                    <p className="text-fg-faint">Returning vs new, this month</p>
                  </div>
                </div>
                <Link href="/book-a-demo" className="text-[12.5px] font-medium text-primary hover:underline">
                  View Sample →
                </Link>
              </div>

              {/* Staff Performance — mini horizontal bars */}
              <div className="rounded-md border border-border bg-white p-5">
                <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#e3fbf1]">
                  <Award className="h-5 w-5 text-accent" aria-hidden />
                </span>
                <p className="mb-1.5 text-[15px] font-semibold text-fg">Staff Performance</p>
                <p className="mb-3 text-[12.5px] leading-relaxed text-fg-muted">Compare sales, commission and productivity by staff member.</p>
                <div className="mb-3 flex flex-col gap-1.5">
                  {STAFF_MINI.map((s) => (
                    <div key={s.name} className="flex items-center gap-2 text-[10px]">
                      <span className="w-16 flex-none truncate text-fg-muted">{s.name}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${s.pct}%` }} />
                      </div>
                      <span className="w-10 flex-none text-right font-medium text-fg">{s.sales}</span>
                    </div>
                  ))}
                </div>
                <Link href="/book-a-demo" className="text-[12.5px] font-medium text-primary hover:underline">
                  View Sample →
                </Link>
              </div>

              {/* Channel Breakdown — mini segmented bar */}
              <div className="rounded-md border border-border bg-white p-5">
                <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#e3fbf1]">
                  <Share2 className="h-5 w-5 text-accent" aria-hidden />
                </span>
                <p className="mb-1.5 text-[15px] font-semibold text-fg">Channel Breakdown</p>
                <p className="mb-3 text-[12.5px] leading-relaxed text-fg-muted">See exactly which channel is carrying the business.</p>
                <div className="mb-2 flex h-3 w-full overflow-hidden rounded-full">
                  {REVENUE_CHANNELS.map((c) => (
                    <span key={c.label} style={{ width: `${c.pct}%`, backgroundColor: c.color }} />
                  ))}
                </div>
                <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[9.5px] text-fg-muted">
                  {REVENUE_CHANNELS.map((c) => (
                    <span key={c.label} className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.color }} /> {c.label}
                    </span>
                  ))}
                </div>
                <Link href="/book-a-demo" className="text-[12.5px] font-medium text-primary hover:underline">
                  View Sample →
                </Link>
              </div>

              {/* Cohort Analysis — mini heatmap */}
              <div className="rounded-md border border-border bg-white p-5">
                <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#e3fbf1]">
                  <LineChart className="h-5 w-5 text-accent" aria-hidden />
                </span>
                <p className="mb-1.5 text-[15px] font-semibold text-fg">Cohort Analysis</p>
                <p className="mb-3 text-[12.5px] leading-relaxed text-fg-muted">Track how each customer group behaves over time.</p>
                <div className="mb-3 grid grid-cols-6 gap-1">
                  {COHORT_GRID.map((row, ri) =>
                    row.map((v, ci) => (
                      <span key={`${ri}-${ci}`} className="h-3.5 rounded-sm" style={{ backgroundColor: `rgba(14,168,106,${v})` }} />
                    )),
                  )}
                </div>
                <Link href="/book-a-demo" className="text-[12.5px] font-medium text-primary hover:underline">
                  View Sample →
                </Link>
              </div>

              {/* Product Analytics — mini top products */}
              <div className="rounded-md border border-border bg-white p-5">
                <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#e3fbf1]">
                  <PackageCheck className="h-5 w-5 text-accent" aria-hidden />
                </span>
                <p className="mb-1.5 text-[15px] font-semibold text-fg">Product Analytics</p>
                <p className="mb-3 text-[12.5px] leading-relaxed text-fg-muted">Best sellers, margins and slow movers, side by side.</p>
                <div className="mb-3 flex flex-col gap-1.5">
                  {PRODUCT_MINI.map((p) => (
                    <div key={p.name} className="flex items-center gap-2 text-[10px]">
                      <span className="w-20 flex-none truncate text-fg-muted">{p.name}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${p.pct}%` }} />
                      </div>
                      <span className="w-8 flex-none text-right font-medium text-fg">{p.sold}</span>
                    </div>
                  ))}
                </div>
                <Link href="/book-a-demo" className="text-[12.5px] font-medium text-primary hover:underline">
                  View Sample →
                </Link>
              </div>
            </div>

            <div className="mt-8 text-center">
              <Link
                href="/book-a-demo"
                className="inline-flex items-center gap-2 rounded-md border border-border-strong bg-white px-6 py-3 text-[14px] font-medium text-fg hover:border-accent hover:text-primary"
              >
                <LayoutGrid className="h-4 w-4" aria-hidden /> Explore All Analytics
              </Link>
            </div>
          </div>
        </section>

        {/* Custom analytics */}
        <section className="px-5 pb-8 sm:px-7">
          <div className="mx-auto max-w-[1320px] rounded-md border border-border bg-surface-2 p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-x-10 gap-y-8">
              <div className="min-w-[220px] max-w-[280px] flex-1">
                <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">Create what you need</p>
                <h2 className="mb-3 text-balance font-display text-[24px] font-bold leading-[1.2] tracking-tight text-fg">Custom analytics. Your way.</h2>
                <p className="mb-4 text-[13px] leading-relaxed text-fg-muted">
                  Build custom breakdowns with our easy analytics builder. Choose your data, segment it, add metrics
                  and visualize the way you want.
                </p>
                <div className="mb-5 flex flex-col gap-2">
                  {CUSTOM_CHECKLIST.map((item) => (
                    <div key={item} className="flex items-center gap-2.5 text-[12.5px] text-fg">
                      <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[#e3fbf1]">
                        <Check className="h-3 w-3 text-accent" aria-hidden />
                      </span>
                      {item}
                    </div>
                  ))}
                </div>
                <Link
                  href="/book-a-demo"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-primary-foreground hover:bg-primary-hover"
                >
                  Create Custom View <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </div>

              <div className="grid min-w-[280px] flex-[2] grid-cols-1 gap-0 overflow-hidden rounded-md bg-white shadow-[0_20px_50px_-35px_rgba(13,21,18,0.3)] sm:grid-cols-[100px_1fr_120px]">
                <div className="border-b border-border p-3 sm:border-b-0 sm:border-r">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.04em] text-fg-faint">Data Source</p>
                  <div className="flex flex-col gap-1.5">
                    {DATA_SOURCES.map((d) => (
                      <span key={d.label} className="flex items-center gap-1.5 text-[10px] text-fg-muted">
                        <d.icon className="h-3 w-3 flex-none text-fg-faint" aria-hidden /> {d.label}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="border-b border-border p-3 sm:border-b-0 sm:border-r">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.04em] text-fg-faint">Analytics Builder</p>
                  <p className="mb-1 text-[9.5px] text-fg-faint">Metrics</p>
                  <div className="mb-2 flex flex-wrap gap-1">
                    {REPORT_COLUMNS.map((c) => (
                      <span key={c} className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[9px] text-fg-muted">
                        {c} ×
                      </span>
                    ))}
                  </div>
                  <p className="mb-1 text-[9.5px] text-fg-faint">Filters</p>
                  <div className="mb-2 flex flex-wrap gap-1">
                    {REPORT_FILTERS.map((f) => (
                      <span key={f} className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[9px] text-fg-muted">
                        {f} ×
                      </span>
                    ))}
                    <span className="rounded-full border border-dashed border-border-strong px-2 py-0.5 text-[9px] text-fg-faint">+ Add Filter</span>
                  </div>
                  <p className="mb-1 text-[9.5px] text-fg-faint">Preview — By Staff</p>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[280px] text-[9px]">
                      <thead>
                        <tr className="text-left text-fg-faint">
                          <th className="pb-1 pr-2 font-normal">Staff</th>
                          <th className="pb-1 pr-2 font-normal">Sales</th>
                          <th className="pb-1 pr-2 font-normal">Orders</th>
                          <th className="pb-1 font-normal">Retention %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {REPORT_PREVIEW.map((r) => (
                          <tr key={r.staff} className="border-t border-border">
                            <td className="py-1 pr-2 text-fg">{r.staff}</td>
                            <td className="py-1 pr-2 text-fg-muted">{r.sales}</td>
                            <td className="py-1 pr-2 text-fg-muted">{r.orders}</td>
                            <td className="py-1 text-fg">{r.retention}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="p-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.04em] text-fg-faint">Visualize</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {VISUALS.map((v, i) => (
                      <span
                        key={v.label + i}
                        className={`flex flex-col items-center gap-1 rounded-md border p-2 text-center ${i === 1 ? "border-accent bg-[#e3fbf1]" : "border-border"}`}
                      >
                        <v.icon className={`h-3.5 w-3.5 ${i === 1 ? "text-accent" : "text-fg-muted"}`} aria-hidden />
                        <span className="text-[7.5px] leading-tight text-fg-muted">{v.label}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Automated delivery */}
        <section className="px-5 pb-8 sm:px-7">
          <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-14 gap-y-10">
            <div className="flex min-w-[260px] flex-1 basis-[320px] items-center justify-center gap-10">
              <div className="relative w-[210px] flex-none rounded-[34px] border-[6px] border-[#1a1a1a] bg-[#1a1a1a] p-1.5 shadow-[0_30px_70px_-30px_rgba(13,21,18,0.4)]">
                <span className="absolute left-1/2 top-1.5 z-10 h-3.5 w-16 -translate-x-1/2 rounded-full bg-[#1a1a1a]" aria-hidden />
                <div className="overflow-hidden rounded-[26px] bg-surface-deep p-3.5 pt-6">
                  <div className="mb-2.5 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/10">
                      <LineChart className="h-3.5 w-3.5 text-accent-on-deep" aria-hidden />
                    </span>
                    <div>
                      <p className="text-[10px] font-semibold text-fg-on-deep">Noxtill Analytics</p>
                      <p className="text-[8px] text-fg-on-deep-faint">Weekly Insight</p>
                    </div>
                  </div>
                  <p className="mb-2 text-[9.5px] text-fg-on-deep-muted">Hi Ahmed,</p>
                  <p className="mb-3 text-[9.5px] leading-snug text-fg-on-deep-muted">Here is your weekly analytics breakdown.</p>
                  <div className="mb-3 flex flex-col gap-1.5 rounded-md border border-white/10 p-2.5">
                    <div className="flex justify-between text-[9px]">
                      <span className="text-fg-on-deep-faint">Retention Rate</span>
                      <span className="font-semibold text-fg-on-deep">42.6%</span>
                    </div>
                    <div className="flex justify-between text-[9px]">
                      <span className="text-fg-on-deep-faint">Top Channel</span>
                      <span className="font-semibold text-fg-on-deep">In-store</span>
                    </div>
                    <div className="flex justify-between text-[9px]">
                      <span className="text-fg-on-deep-faint">Repeat Customers</span>
                      <span className="font-semibold text-fg-on-deep">62%</span>
                    </div>
                    <div className="flex justify-between text-[9px]">
                      <span className="text-fg-on-deep-faint">Revenue</span>
                      <span className="font-semibold text-fg-on-deep">$48,750</span>
                    </div>
                  </div>
                  <p className="text-[9px] font-medium text-accent-on-deep">View full breakdown →</p>
                  <p className="mt-2 text-[8px] text-fg-on-deep-faint">noxtill.app/analytics/weekly</p>
                </div>
              </div>

              <div className="hidden flex-none flex-col justify-between gap-10 py-6 sm:flex">
                {[Mail, FileSpreadsheet, MessageSquare].map((Icon, i) => (
                  <div key={i} className="relative flex items-center">
                    <span className="absolute right-full top-1/2 h-px w-8 -translate-y-1/2 border-t border-dashed border-border-strong" aria-hidden />
                    <span className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-white shadow-[0_10px_25px_-15px_rgba(13,21,18,0.3)]">
                      <Icon className="h-4 w-4 text-fg-muted" aria-hidden />
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="min-w-[260px] flex-[1.4]">
              <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">Automated insight delivery</p>
              <h2 className="mb-4 text-balance font-display text-[26px] font-bold leading-[1.2] tracking-tight text-fg sm:text-[30px]">
                Automated. Delivered. <span className="text-accent">Always on time.</span>
              </h2>
              <p className="mb-6 max-w-[50ch] text-[13.5px] leading-relaxed text-fg-muted">
                Schedule breakdowns to be delivered on WhatsApp, Email, Slack or download them in PDF, Excel or CSV
                formats.
              </p>

              <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
                {DELIVERY_STEPS.map((s) => (
                  <div key={s.title} className="text-center sm:text-left">
                    <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[#e3fbf1] sm:mx-0">
                      <s.icon className="h-4 w-4 text-accent" aria-hidden />
                    </span>
                    <p className="mb-1 text-[12.5px] font-semibold text-fg">{s.title}</p>
                    <p className="text-[10.5px] leading-relaxed text-fg-muted">{s.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="relative mt-10 overflow-hidden bg-surface-deep px-5 py-7 sm:px-7 sm:py-8">
          <div className="relative mx-auto flex max-w-[1320px] flex-wrap items-center gap-10">
            <div className="min-w-[260px] flex-1 basis-[380px]">
              <h2 className="mb-3 text-balance font-display text-[26px] font-bold leading-[1.15] tracking-tight text-fg-on-deep sm:text-[30px]">
                See what&apos;s really driving growth. <span className="text-accent-on-deep">Not just how much you made.</span>
              </h2>
              <p className="mb-6 max-w-[46ch] text-[13.5px] leading-relaxed text-fg-on-deep-muted">
                Noxtill Analytics gives you the visibility behind the number, so you can act on what&apos;s actually
                happening.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/book-a-demo"
                  className="inline-flex items-center gap-2 rounded-md bg-white px-5.5 py-3 text-[14px] font-semibold text-[#053b2a] transition-colors hover:bg-[#e6f5ee]"
                >
                  Explore Analytics <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link
                  href="/book-a-demo"
                  className="inline-flex items-center rounded-md border border-border-on-deep px-5.5 py-3 text-[14px] font-medium text-fg-on-deep transition-colors hover:border-fg-on-deep-muted"
                >
                  Book a Demo
                </Link>
              </div>
            </div>

            <div className="min-w-[260px] flex-1 basis-[300px] rounded-md border border-white/10 bg-white/5 p-5">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {CLOSING_CHECKLIST.map((item) => (
                  <div key={item} className="flex items-center gap-2 text-[12.5px] text-fg-on-deep">
                    <Check className="h-3.5 w-3.5 flex-none text-accent-on-deep" aria-hidden />
                    {item}
                  </div>
                ))}
              </div>
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

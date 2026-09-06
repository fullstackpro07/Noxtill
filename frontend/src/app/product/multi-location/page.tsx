import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeftRight,
  ArrowRight,
  BarChart3,
  Boxes,
  Building2,
  Check,
  Columns3,
  LayoutDashboard,
  ListChecks,
  PlayCircle,
  Receipt,
  Repeat,
  Settings2,
  ShieldCheck,
  TrendingDown,
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

const page = findProductDetailPage("multi-location")!;

export const metadata: Metadata = {
  title: page.metaTitle,
  description: page.metaDescription,
  alternates: { canonical: "https://noxtill.com/product/multi-location/" },
  openGraph: {
    type: "website",
    url: "https://noxtill.com/product/multi-location/",
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
        { "@type": "ListItem", position: 3, name: "Multi-location", item: "https://noxtill.com/product/multi-location/" },
      ],
    },
    {
      "@type": "Article",
      headline: page.metaTitle,
      description: page.metaDescription,
      url: "https://noxtill.com/product/multi-location/",
    },
  ],
};

const STAT_TILES = [
  { label: "Total Branches", value: "6", caption: "All Locations" },
  { label: "Combined Revenue", value: "$84,230", caption: "This Month" },
  { label: "Branches On Target", value: "4", caption: "Ahead of Plan" },
  { label: "Needs Attention", value: "2", caption: "Below Target", danger: true },
];

const TREND_LABELS = ["May 1", "May 7", "May 14", "May 21", "May 28"];
const TREND_VALUES = [58000, 66000, 71000, 84230, 79000];
const TREND_HIGHLIGHT_INDEX = 3;

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
          <rect x={hl.x - 32} y={hl.y - 26} width="64" height="20" rx="4" fill="#053b2a" />
          <text x={hl.x} y={hl.y - 12} fontSize="9" fill="white" textAnchor="middle">
            $84,230
          </text>
        </g>
      ) : null}
    </svg>
  );
}

const BRANCH_HEALTH = [
  { label: "On Target", value: "4 (66.7%)", pct: 66.7, color: "#10b981" },
  { label: "Needs Attention", value: "1 (16.7%)", pct: 16.7, color: "#f59e0b" },
  { label: "Critical", value: "1 (16.7%)", pct: 16.7, color: "#ef4444" },
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

const FOOTER_STATS = [
  { label: "Avg. Health Score", value: "78%" },
  { label: "Stock Transfers", value: "14" },
  { label: "Active Overrides", value: "3" },
  { label: "Branches Compared", value: "24" },
];

const CONTROL_STEPS = [
  { icon: LayoutDashboard, title: "Roll-Up Dashboard", description: "See combined sales, profit and performance across every branch." },
  { icon: Columns3, title: "Compare Branches", description: "Side-by-side comparison — sales, profit, staff performance." },
  { icon: ArrowLeftRight, title: "Transfer Stock", description: "Move stock between locations in a few taps." },
  { icon: ShieldCheck, title: "Set Permissions", description: "Managers see their branch. Owners see everything." },
  { icon: Settings2, title: "Override Settings", description: "Apply everywhere at once, or override just one branch." },
];

const TOP_BRANCHES = [
  { name: "Riverside", sub: "Manager: T. Nguyen", sold: "$5,940", staff: 7, status: "On Target" },
  { name: "Downtown", sub: "Manager: A. Rossi", sold: "$4,820", staff: 6, status: "On Target" },
  { name: "Airport", sub: "Manager: J. Park", sold: "$2,430", staff: 3, status: "On Target" },
  { name: "Uptown", sub: "Manager: S. Malik", sold: "$3,110", staff: 4, status: "Needs Attention" },
  { name: "Harbor", sub: "Manager: unassigned", sold: "$1,180", staff: 2, status: "Critical" },
];

const STATUS_STYLES: Record<string, string> = {
  "On Target": "text-emerald-600",
  "Needs Attention": "text-amber-600",
  Critical: "text-red-600",
};

const ATTENTION_LIST = [
  { name: "Uptown", note: "Sales down 22% vs last month, health score 58%" },
  { name: "Harbor", note: "No manager assigned, health score 41%" },
];

const TRANSFERS = [
  { route: "Riverside → Uptown", item: "Wireless Headphones", qty: 24, date: "Today" },
  { route: "Warehouse A → Airport", item: "Phone Cases", qty: 60, date: "Yesterday" },
  { route: "Downtown → Harbor", item: "USB-C Cables", qty: 40, date: "2 days ago" },
  { route: "Riverside → Downtown", item: "Smart Watches", qty: 12, date: "3 days ago" },
];

const KEY_INSIGHTS = ["Stock moves to where it's needed", "Managers see their branch only", "Owners see everything, always", "Override any setting, per branch"];

const INSIGHT_CARDS = [
  { icon: TrendingDown, tint: "bg-amber-50", color: "text-amber-600", title: "Spot Underperformers Instantly", description: "See which branch needs attention before it becomes a bigger problem." },
  { icon: Repeat, tint: "bg-orange-50", color: "text-orange-600", title: "Balance Stock Automatically", description: "Move stock from an overstocked branch to one running low, in a few taps." },
  { icon: ShieldCheck, tint: "bg-violet-50", color: "text-violet-600", title: "Right Access, Right People", description: "Managers see their branch. Owners see everything, always." },
  { icon: Settings2, tint: "bg-[#e3fbf1]", color: "text-accent", title: "Consistent, With Room to Differ", description: "Apply settings everywhere at once, or override just one branch." },
];

const ECOSYSTEM = [
  { icon: Zap, label: "Fast Sale" },
  { icon: Receipt, label: "Orders" },
  { icon: Boxes, label: "Inventory" },
  { icon: Building2, label: "Multi-Location", active: true },
  { icon: Users, label: "Staff" },
  { icon: Wallet, label: "Payments" },
  { icon: BarChart3, label: "Profit & Loss" },
  { icon: ListChecks, label: "Reports" },
];

export default function MultiLocationPage() {
  return (
    <div data-theme="light" className="flex min-h-dvh flex-col bg-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative mt-0 overflow-hidden px-5 pb-7 pt-7 sm:px-7 sm:pb-8">
          <div className="relative mx-auto flex max-w-[1320px] flex-wrap items-start gap-x-14 gap-y-12">
            <div className="min-w-[300px] max-w-[480px] flex-1 basis-[420px]">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#e3fbf1] px-3.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#0b7a4c]">
                <Building2 className="h-3.5 w-3.5" aria-hidden /> Multi-Location
              </div>
              <h1 className="text-balance font-display text-[38px] font-bold leading-[1.1] tracking-tight text-fg sm:text-[46px]">
                {page.h1Lead} <span className="text-accent">{page.h1Highlight}</span>
              </h1>
              <p className="mt-4 max-w-[48ch] text-[15px] leading-relaxed text-fg-muted">{page.subhead}</p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  href="/book-a-demo"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-6.5 py-3.5 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
                >
                  Explore Multi-Location <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link
                  href="#control"
                  className="inline-flex items-center gap-2 rounded-md border border-border-strong px-6 py-3.5 text-[15px] font-medium text-fg transition-colors hover:border-accent hover:text-primary"
                >
                  See How It Works <PlayCircle className="h-4 w-4" aria-hidden />
                </Link>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {page.benefits.map((b) => (
                  <div
                    key={b.label}
                    className="flex flex-col items-center gap-2 rounded-md border border-border bg-white px-2 py-4 text-center shadow-[0_2px_10px_-4px_rgba(13,21,18,0.08)]"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e3fbf1]">
                      <b.icon className="h-5 w-5 text-accent" aria-hidden />
                    </span>
                    <span className="text-[12px] font-medium leading-tight text-fg">{b.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="min-w-[340px] flex-1 basis-[560px]">
              <div className="rounded-md border border-border-strong bg-white p-4 shadow-[0_50px_100px_-45px_rgba(13,21,18,0.35)] sm:p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[14.5px] font-semibold text-fg">Locations Overview</span>
                  <div className="flex items-center gap-2 text-[10.5px] text-fg-muted">
                    <span className="rounded-md border border-border px-2.5 py-1">All Branches ⌄</span>
                    <span className="rounded-md border border-border px-2.5 py-1">This Month ⌄</span>
                  </div>
                </div>

                <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {STAT_TILES.map((s) => (
                    <div key={s.label} className="rounded-md border border-border p-2.5">
                      <p className="text-[9.5px] leading-tight text-fg-faint">{s.label}</p>
                      <p className={`mt-1 font-display text-[15px] font-bold ${s.danger ? "text-red-600" : "text-fg"}`}>{s.value}</p>
                      <p className={`text-[8.5px] ${s.danger ? "font-medium text-red-600" : "text-fg-faint"}`}>{s.caption}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.3fr_1fr]">
                  <div className="rounded-md border border-border p-3">
                    <p className="mb-2 text-[11.5px] font-semibold text-fg">Combined Revenue Trend</p>
                    <TrendChart />
                    <div className="mt-1 flex justify-between text-[8.5px] text-fg-faint">
                      {TREND_LABELS.map((l) => (
                        <span key={l}>{l}</span>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-md border border-border p-3">
                    <p className="mb-2 text-[11.5px] font-semibold text-fg">Branch Health</p>
                    <div className="flex items-center gap-3">
                      <div className="relative h-16 w-16 flex-none rounded-full" style={{ background: donutGradient(BRANCH_HEALTH) }}>
                        <div className="absolute inset-2 flex flex-col items-center justify-center rounded-full bg-white text-center">
                          <span className="text-[10px] font-bold text-fg">6</span>
                          <span className="text-[6px] leading-tight text-fg-faint">Branches</span>
                        </div>
                      </div>
                      <div className="flex flex-1 flex-col gap-1 text-[9px]">
                        {BRANCH_HEALTH.map((s) => (
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

                <div className="mt-3 grid grid-cols-2 gap-2 rounded-md border border-border bg-surface-2 p-3 text-center sm:grid-cols-4">
                  {FOOTER_STATS.map((s) => (
                    <div key={s.label}>
                      <p className="text-[9.5px] text-fg-faint">{s.label}</p>
                      <p className="text-[13px] font-bold text-fg">{s.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Complete Multi-Location Control */}
        <section id="control" className="bg-surface-deep px-5 py-7 sm:px-7 sm:py-8">
          <div className="mx-auto max-w-[1320px]">
            <h2 className="mb-10 text-center font-display text-[26px] font-bold tracking-tight text-fg-on-deep sm:text-[30px]">Complete Multi-Location Control</h2>

            <div className="relative grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-5 sm:gap-y-0">
              <div className="absolute left-[10%] right-[10%] top-[26px] hidden border-t border-dashed border-border-on-deep sm:block" aria-hidden />
              {CONTROL_STEPS.map((s) => (
                <div key={s.title} className="relative flex flex-col items-center text-center">
                  <span className="relative z-10 mb-3 flex h-14 w-14 items-center justify-center rounded-full border-4 border-surface-deep bg-[#0c4433]">
                    <s.icon className="h-6 w-6 text-accent-on-deep" aria-hidden />
                  </span>
                  <div className="mb-1 text-[13.5px] font-semibold text-fg-on-deep">{s.title}</div>
                  <p className="max-w-[160px] text-[11.5px] leading-relaxed text-fg-on-deep-muted">{s.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Tables */}
        <section className="px-5 py-8 sm:px-7">
          <div className="mx-auto grid max-w-[1320px] grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="rounded-md border border-border bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-[14px] font-semibold text-fg">Top Performing Branches</p>
                <Link href="#control" className="text-[11.5px] font-medium text-primary hover:underline">
                  View All →
                </Link>
              </div>
              <div className="flex flex-col divide-y divide-border text-[11.5px]">
                <div className="grid grid-cols-[1.6fr_0.7fr_0.7fr_0.9fr] gap-1.5 pb-2 text-[9.5px] font-semibold uppercase tracking-[0.03em] text-fg-faint">
                  <span>Branch</span>
                  <span>Sales</span>
                  <span>Staff</span>
                  <span>Status</span>
                </div>
                {TOP_BRANCHES.map((p) => (
                  <div key={p.name} className="grid grid-cols-[1.6fr_0.7fr_0.7fr_0.9fr] items-center gap-1.5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-fg">{p.name}</p>
                      <p className="truncate text-[10px] text-fg-faint">{p.sub}</p>
                    </div>
                    <span className="text-fg-muted">{p.sold}</span>
                    <span className="text-fg-muted">{p.staff}</span>
                    <span className={`font-medium ${STATUS_STYLES[p.status]}`}>{p.status}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-border bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-[14px] font-semibold text-fg">Branches Needing Attention</p>
                <Link href="#control" className="text-[11.5px] font-medium text-primary hover:underline">
                  View All →
                </Link>
              </div>
              <div className="flex flex-col gap-3">
                {ATTENTION_LIST.map((p) => (
                  <div key={p.name} className="flex items-start gap-2.5">
                    <span className="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-amber-50">
                      <TrendingDown className="h-4 w-4 text-amber-600" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium text-fg">{p.name}</p>
                      <p className="text-[10px] text-fg-faint">{p.note}</p>
                    </div>
                    <span className="flex-none rounded-full bg-amber-50 px-2 py-0.5 text-[9.5px] font-medium text-amber-700">Review Suggested</span>
                  </div>
                ))}
              </div>
              <Link href="#control" className="mt-4 inline-block text-[11.5px] font-medium text-primary hover:underline">
                Manage Alerts →
              </Link>
            </div>

            <div className="rounded-md border border-border bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-[14px] font-semibold text-fg">Recent Stock Transfers</p>
                <Link href="#control" className="text-[11.5px] font-medium text-primary hover:underline">
                  View All →
                </Link>
              </div>
              <div className="flex flex-col divide-y divide-border text-[11.5px]">
                <div className="grid grid-cols-[1.6fr_1fr_0.5fr] gap-1.5 pb-2 text-[9.5px] font-semibold uppercase tracking-[0.03em] text-fg-faint">
                  <span>Route</span>
                  <span>Item</span>
                  <span>Qty</span>
                </div>
                {TRANSFERS.map((t) => (
                  <div key={t.route + t.item} className="grid grid-cols-[1.6fr_1fr_0.5fr] items-center gap-1.5 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-fg">{t.route}</p>
                      <p className="truncate text-[10px] text-fg-faint">{t.date}</p>
                    </div>
                    <span className="truncate text-fg-muted">{t.item}</span>
                    <span className="text-fg-muted">{t.qty}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between rounded-md border border-border bg-surface-2 p-3">
                <div>
                  <p className="text-[10px] text-fg-faint">Stock Transfers This Month</p>
                  <p className="font-display text-[16px] font-bold text-fg">14</p>
                </div>
                <ArrowLeftRight className="h-5 w-5 flex-none text-accent" aria-hidden />
              </div>
            </div>
          </div>
        </section>

        {/* Smarter decisions */}
        <section className="px-5 pb-8 sm:px-7">
          <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-10 gap-y-10">
            <div className="relative aspect-[4/3] min-w-[240px] flex-1 basis-[320px] overflow-hidden rounded-md">
              <Image
                src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=700&q=80&auto=format&fit=crop"
                alt="Business owner reviewing branch performance"
                fill
                sizes="(min-width: 1024px) 30vw, 45vw"
                className="object-cover"
              />
            </div>

            <div className="min-w-[260px] flex-1 basis-[320px]">
              <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">Smart multi-location insights</p>
              <h2 className="mb-3 text-balance font-display text-[24px] font-bold leading-[1.15] tracking-tight text-fg">Make Smarter Multi-Location Decisions</h2>
              <p className="mb-4 text-[13.5px] leading-relaxed text-fg-muted">
                Transfer stock between branches when one location is overstocked and another is running low, set
                permissions so managers see only their own branch while you see everything, and apply settings across
                every location at once — or override just one when it needs to be different.
              </p>
              <p className="mb-2 text-[12px] font-semibold text-fg">Key Insights</p>
              <div className="flex flex-col gap-2">
                {KEY_INSIGHTS.map((item) => (
                  <div key={item} className="flex items-center gap-2.5 text-[13px] text-fg">
                    <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[#e3fbf1]">
                      <Check className="h-3 w-3 text-accent" aria-hidden />
                    </span>
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid min-w-[280px] flex-1 basis-[380px] grid-cols-1 gap-3 sm:grid-cols-2">
              {INSIGHT_CARDS.map((c) => (
                <div key={c.title} className="rounded-md border border-border bg-white p-4">
                  <span className={`mb-3 flex h-10 w-10 items-center justify-center rounded-full ${c.tint}`}>
                    <c.icon className={`h-5 w-5 ${c.color}`} aria-hidden />
                  </span>
                  <p className="mb-1 text-[13px] font-semibold text-fg">{c.title}</p>
                  <p className="text-[11.5px] leading-relaxed text-fg-muted">{c.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <EcosystemStrip heading="Part of Your Connected Business" items={ECOSYSTEM} />

        {/* Closing CTA */}
        <section className="relative mt-10 overflow-hidden bg-surface-deep px-5 py-7 sm:px-7 sm:py-8">
          <Building2 className="pointer-events-none absolute -right-4 bottom-0 h-40 w-40 text-accent-on-deep/10 sm:h-52 sm:w-52" aria-hidden strokeWidth={1} />

          <div className="relative mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-6">
            <div className="min-w-[280px] flex-1 basis-[400px]">
              <h2 className="mb-3 text-balance font-display text-[26px] font-bold leading-[1.15] tracking-tight text-fg-on-deep sm:text-[30px]">
                One Dashboard. <span className="text-accent-on-deep">Every Branch.</span>
              </h2>
              <p className="max-w-[50ch] text-[13.5px] leading-relaxed text-fg-on-deep-muted">
                See every location clearly, compare them directly, and grow with confidence — all from one account.
              </p>
            </div>
            <div className="flex flex-none flex-wrap gap-3">
              <Link
                href="/book-a-demo"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-6.5 py-3.5 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
              >
                Explore Multi-Location <ArrowRight className="h-4 w-4" aria-hidden />
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

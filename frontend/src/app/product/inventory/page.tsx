import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  Boxes,
  Check,
  Clock,
  DollarSign,
  ListChecks,
  MapPin,
  Package,
  PlayCircle,
  Receipt,
  RefreshCw,
  ShoppingCart,
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

const page = findProductDetailPage("inventory")!;

export const metadata: Metadata = {
  title: page.metaTitle,
  description: page.metaDescription,
  alternates: { canonical: "https://noxtill.com/product/inventory/" },
  openGraph: {
    type: "website",
    url: "https://noxtill.com/product/inventory/",
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
        { "@type": "ListItem", position: 3, name: "Inventory", item: "https://noxtill.com/product/inventory/" },
      ],
    },
    {
      "@type": "Article",
      headline: page.metaTitle,
      description: page.metaDescription,
      url: "https://noxtill.com/product/inventory/",
    },
  ],
};

const STAT_TILES = [
  { label: "Total Products", value: "1,250", caption: "All Products" },
  { label: "Total Stock Value", value: "$215,430", caption: "Current Value" },
  { label: "Low Stock Items", value: "28", caption: "Need Attention" },
  { label: "Out of Stock Items", value: "6", caption: "Out of Stock", danger: true },
];

const TREND_LABELS = ["May 1", "May 7", "May 14", "May 21", "May 28"];
const TREND_VALUES = [95000, 130000, 160000, 215430, 195000];
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
            $215,430
          </text>
        </g>
      ) : null}
    </svg>
  );
}

const STOCK_STATUS = [
  { label: "In Stock", value: "892 (71.4%)", pct: 71.4, color: "#10b981" },
  { label: "Low Stock", value: "28 (2.2%)", pct: 2.2, color: "#f59e0b" },
  { label: "Out of Stock", value: "6 (0.5%)", pct: 0.5, color: "#ef4444" },
  { label: "Overstock", value: "324 (25.9%)", pct: 25.9, color: "#3b82f6" },
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
  { label: "Stock Turnover", value: "4.2x" },
  { label: "Inventory Accuracy", value: "98.6%" },
  { label: "Dead Stock Value", value: "$12,850" },
  { label: "Reorder Suggested", value: "18 Items" },
];

const CONTROL_STEPS = [
  { icon: Boxes, title: "Track Stock", description: "Monitor stock in real time across all items, variants and locations." },
  { icon: Bell, title: "Set Reorder Points", description: "Define minimum stock levels and get notified automatically." },
  { icon: ShoppingCart, title: "Purchase & Receive", description: "Create purchase orders and receive stock with ease." },
  { icon: RefreshCw, title: "Stock Movement", description: "Manage transfers, adjustments and returns seamlessly." },
  { icon: BarChart3, title: "Analyze & Optimize", description: "Understand trends and optimize inventory for better performance." },
];

const TOP_SELLING = [
  { name: "Wireless Headphones", sku: "WH-1000XM5", sold: 256, stock: 48, status: "Low Stock" },
  { name: "Smart Watch", sku: "SW-200", sold: 189, stock: 32, status: "Low Stock" },
  { name: "Phone Case", sku: "iPhone 15 Pro", sold: 324, stock: 159, status: "In Stock" },
  { name: "USB-C Cable", sku: "1m", sold: 512, stock: 0, status: "Out of Stock" },
  { name: "Wall Charger", sku: "20W", sold: 278, stock: 76, status: "In Stock" },
];

const STATUS_STYLES: Record<string, string> = {
  "In Stock": "text-emerald-600",
  "Low Stock": "text-amber-600",
  "Out of Stock": "text-red-600",
};

const LOW_STOCK = [
  { name: "Wireless Headphones", sku: "WH-1000XM5", current: 48, reorder: 50 },
  { name: "Smart Watch", sku: "SW-200", current: 32, reorder: 40 },
  { name: "Bluetooth Speaker", sku: "BS-300", current: 5, reorder: 10 },
  { name: "Laptop Stand", sku: "LS-100", current: 3, reorder: 8 },
];

const STOCK_BY_LOCATION = [
  { location: "Head Office", inStock: 892, low: 24, out: 3 },
  { location: "Store - Downtown", inStock: 612, low: 15, out: 1 },
  { location: "Store - Uptown", inStock: 521, low: 12, out: 1 },
  { location: "Warehouse A", inStock: 1230, low: 18, out: 2 },
  { location: "Warehouse B", inStock: 856, low: 9, out: 0 },
];

const KEY_INSIGHTS = ["Fast moving vs slow moving items", "Dead stock identification", "Seasonal demand trends", "Purchase recommendation"];

const INSIGHT_CARDS = [
  { icon: TrendingUp, tint: "bg-[#e3fbf1]", color: "text-accent", title: "Prevent Stockouts", description: "Never miss a sale. Get alerts and reorder suggestions before your stock runs out." },
  { icon: Package, tint: "bg-orange-50", color: "text-orange-600", title: "Avoid Overstocking", description: "Reduce holding costs by keeping only the right amount of stock that you need." },
  { icon: Clock, tint: "bg-violet-50", color: "text-violet-600", title: "Save Time & Money", description: "Automate inventory tasks and reduce manual errors across your supply chain." },
  { icon: DollarSign, tint: "bg-[#e3fbf1]", color: "text-accent", title: "Boost Profitability", description: "Right stock, right time, right price — improve margins and grow your profits." },
];

const ECOSYSTEM = [
  { icon: Zap, label: "Fast Sale" },
  { icon: ShoppingCart, label: "Orders" },
  { icon: Boxes, label: "Inventory", active: true },
  { icon: Receipt, label: "Purchases" },
  { icon: Users, label: "Customers" },
  { icon: Wallet, label: "Payments" },
  { icon: BarChart3, label: "Profit & Loss" },
  { icon: ListChecks, label: "Reports" },
];

export default function InventoryPage() {
  return (
    <div data-theme="light" className="flex min-h-dvh flex-col bg-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />

      <main className="flex-1">
        

        {/* Hero */}
        <section className="relative mt-0 overflow-hidden px-5 pb-8 pt-8 sm:px-7 sm:pb-10">
          

          <div className="relative mx-auto flex max-w-[1320px] flex-wrap items-start gap-x-14 gap-y-12">
            <div className="min-w-[300px] max-w-[480px] flex-1 basis-[420px]">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#e3fbf1] px-3.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#0b7a4c]">
                <Boxes className="h-3.5 w-3.5" aria-hidden /> Inventory
              </div>
              <h1 className="text-balance font-display text-[38px] font-bold leading-[1.1] tracking-tight text-fg sm:text-[46px]">
                {page.h1Lead} <span className="text-accent">{page.h1Highlight}</span>
              </h1>
              <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-fg-muted">{page.subhead}</p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  href="/book-a-demo"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-6.5 py-3.5 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
                >
                  Explore Inventory <ArrowRight className="h-4 w-4" aria-hidden />
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
                  <span className="text-[14.5px] font-semibold text-fg">Inventory Overview</span>
                  <div className="flex items-center gap-2 text-[10.5px] text-fg-muted">
                    <span className="rounded-md border border-border px-2.5 py-1">All Locations ⌄</span>
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
                    <p className="mb-2 text-[11.5px] font-semibold text-fg">Stock Value Trend</p>
                    <TrendChart />
                    <div className="mt-1 flex justify-between text-[8.5px] text-fg-faint">
                      {TREND_LABELS.map((l) => (
                        <span key={l}>{l}</span>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-md border border-border p-3">
                    <p className="mb-2 text-[11.5px] font-semibold text-fg">Stock Status</p>
                    <div className="flex items-center gap-3">
                      <div className="relative h-16 w-16 flex-none rounded-full" style={{ background: donutGradient(STOCK_STATUS) }}>
                        <div className="absolute inset-2 flex flex-col items-center justify-center rounded-full bg-white text-center">
                          <span className="text-[10px] font-bold text-fg">1,250</span>
                          <span className="text-[6px] leading-tight text-fg-faint">Total Products</span>
                        </div>
                      </div>
                      <div className="flex flex-1 flex-col gap-1 text-[9px]">
                        {STOCK_STATUS.map((s) => (
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

        {/* Complete Inventory Control */}
        <section id="control" className="bg-surface-2 px-5 py-7 sm:px-7 sm:py-8">
          <div className="mx-auto max-w-[1320px]">
            <h2 className="mb-10 text-center font-display text-[26px] font-bold tracking-tight text-fg sm:text-[30px]">Complete Inventory Control</h2>

            <div className="relative grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-5 sm:gap-y-0">
              <div className="absolute left-[10%] right-[10%] top-[26px] hidden border-t border-dashed border-border-strong sm:block" aria-hidden />
              {CONTROL_STEPS.map((s) => (
                <div key={s.title} className="relative flex flex-col items-center text-center">
                  <span className="relative z-10 mb-3 flex h-14 w-14 items-center justify-center rounded-full border-4 border-surface-2 bg-[#e3fbf1]">
                    <s.icon className="h-6 w-6 text-accent" aria-hidden />
                  </span>
                  <div className="mb-1 text-[13.5px] font-semibold text-fg">{s.title}</div>
                  <p className="max-w-[160px] text-[11.5px] leading-relaxed text-fg-muted">{s.description}</p>
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
                <p className="text-[14px] font-semibold text-fg">Top Selling Products</p>
                <Link href="#control" className="text-[11.5px] font-medium text-primary hover:underline">
                  View All →
                </Link>
              </div>
              <div className="flex flex-col divide-y divide-border text-[11.5px]">
                <div className="grid grid-cols-[1.6fr_0.7fr_0.7fr_0.9fr] gap-1.5 pb-2 text-[9.5px] font-semibold uppercase tracking-[0.03em] text-fg-faint">
                  <span>Product</span>
                  <span>Sold</span>
                  <span>Stock</span>
                  <span>Status</span>
                </div>
                {TOP_SELLING.map((p) => (
                  <div key={p.name} className="grid grid-cols-[1.6fr_0.7fr_0.7fr_0.9fr] items-center gap-1.5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-fg">{p.name}</p>
                      <p className="truncate text-[10px] text-fg-faint">{p.sku}</p>
                    </div>
                    <span className="text-fg-muted">{p.sold}</span>
                    <span className="text-fg-muted">{p.stock}</span>
                    <span className={`font-medium ${STATUS_STYLES[p.status]}`}>{p.status}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-border bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-[14px] font-semibold text-fg">Low Stock Alerts</p>
                <Link href="#control" className="text-[11.5px] font-medium text-primary hover:underline">
                  View All →
                </Link>
              </div>
              <div className="flex flex-col gap-3">
                {LOW_STOCK.map((p) => (
                  <div key={p.name} className="flex items-start gap-2.5">
                    <span className="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-amber-50">
                      <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium text-fg">{p.name}</p>
                      <p className="text-[10px] text-fg-faint">
                        Current Stock: {p.current} · Reorder Point: {p.reorder}
                      </p>
                    </div>
                    <span className="flex-none rounded-full bg-amber-50 px-2 py-0.5 text-[9.5px] font-medium text-amber-700">Reorder Suggested</span>
                  </div>
                ))}
              </div>
              <Link href="#control" className="mt-4 inline-block text-[11.5px] font-medium text-primary hover:underline">
                Manage Alerts →
              </Link>
            </div>

            <div className="rounded-md border border-border bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-[14px] font-semibold text-fg">Stock by Location</p>
                <Link href="#control" className="text-[11.5px] font-medium text-primary hover:underline">
                  View All →
                </Link>
              </div>
              <div className="flex flex-col divide-y divide-border text-[11.5px]">
                <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr] gap-1.5 pb-2 text-[9.5px] font-semibold uppercase tracking-[0.03em] text-fg-faint">
                  <span>Location</span>
                  <span>In Stock</span>
                  <span>Low Stock</span>
                  <span>Out of Stock</span>
                </div>
                {STOCK_BY_LOCATION.map((l) => (
                  <div key={l.location} className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr] items-center gap-1.5 py-2">
                    <span className="truncate font-medium text-fg">{l.location}</span>
                    <span className="text-fg-muted">{l.inStock.toLocaleString()}</span>
                    <span className="text-fg-muted">{l.low}</span>
                    <span className="text-fg-muted">{l.out}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between rounded-md border border-border bg-surface-2 p-3">
                <div>
                  <p className="text-[10px] text-fg-faint">Total Stock Value Across All Locations</p>
                  <p className="font-display text-[16px] font-bold text-fg">$215,430</p>
                </div>
                <MapPin className="h-5 w-5 flex-none text-accent" aria-hidden />
              </div>
            </div>
          </div>
        </section>

        {/* Smarter decisions */}
        <section className="px-5 pb-8 sm:px-7">
          <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-10 gap-y-10">
            <div className="relative aspect-[4/3] min-w-[240px] flex-1 basis-[320px] overflow-hidden rounded-md">
              <Image
                src="https://images.unsplash.com/photo-1764795849885-e226e3cabe87?w=700&q=80&auto=format&fit=crop"
                alt="Warehouse worker checking inventory with a tablet"
                fill
                sizes="(min-width: 1024px) 30vw, 45vw"
                className="object-cover"
              />
            </div>

            <div className="min-w-[260px] flex-1 basis-[320px]">
              <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">Smart inventory insights</p>
              <h2 className="mb-3 text-balance font-display text-[24px] font-bold leading-[1.15] tracking-tight text-fg">Make Smarter Inventory Decisions</h2>
              <p className="mb-4 text-[13.5px] leading-relaxed text-fg-muted">
                Noxtill Inventory gives you the insights you need to reduce costs, increase availability and keep your
                business running smoothly.
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
          <Boxes className="pointer-events-none absolute -right-4 bottom-0 h-40 w-40 text-accent-on-deep/10 sm:h-52 sm:w-52" aria-hidden strokeWidth={1} />

          <div className="relative mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-6">
            <div className="min-w-[280px] flex-1 basis-[400px]">
              <h2 className="mb-3 text-balance font-display text-[26px] font-bold leading-[1.15] tracking-tight text-fg-on-deep sm:text-[30px]">
                Better Inventory. <span className="text-accent-on-deep">Stronger Business.</span>
              </h2>
              <p className="max-w-[50ch] text-[13.5px] leading-relaxed text-fg-on-deep-muted">
                Take control of your stock, reduce costs and increase profit with Noxtill Inventory.
              </p>
            </div>
            <div className="flex flex-none flex-wrap gap-3">
              <Link
                href="/book-a-demo"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-6.5 py-3.5 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
              >
                Explore Inventory <ArrowRight className="h-4 w-4" aria-hidden />
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

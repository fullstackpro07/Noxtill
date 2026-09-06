import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Bell,
  Box,
  Calendar,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  FileText,
  Gauge,
  HandCoins,
  MapPin,
  MessageSquare,
  Package,
  PlayCircle,
  Sparkles,
  ShoppingCart,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { DetailRelated } from "@/components/site/detail-page-sections";
import { EcosystemStrip } from "@/components/site/ecosystem-strip";
import { findProductDetailPage } from "@/lib/marketing/product-detail-content";

const page = findProductDetailPage("orders")!;

export const metadata: Metadata = {
  title: page.metaTitle,
  description: page.metaDescription,
  alternates: { canonical: "https://noxtill.com/product/orders/" },
  openGraph: {
    type: "website",
    url: "https://noxtill.com/product/orders/",
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
        { "@type": "ListItem", position: 3, name: "Orders", item: "https://noxtill.com/product/orders/" },
      ],
    },
    {
      "@type": "Article",
      headline: page.metaTitle,
      description: page.metaDescription,
      url: "https://noxtill.com/product/orders/",
    },
  ],
};

// Mirrors the real order board's 4 live columns (frontend/src/lib/orders.ts — Cancelled is a
// drag-only terminal state with no column of its own, so it isn't shown here).
const BOARD_COLUMNS = [
  {
    status: "Pending",
    orders: [
      { no: "1042", customer: "Alex Morgan", items: "Wireless Headphones, Phone Case", total: "$74.00", method: Wallet, invoice: false },
      { no: "1040", customer: "Priya Nair", items: "Charging Cable", total: "$12.00", method: CreditCard, invoice: false },
    ],
  },
  {
    status: "Confirmed",
    orders: [
      { no: "1041", customer: "Jamie Lee", items: "Smart Watch", total: "$129.00", method: CreditCard, invoice: false },
      { no: "1038", customer: "Ravi Shah", items: "Screen Protector", total: "$8.00", method: Wallet, invoice: false },
    ],
  },
  {
    status: "In Progress",
    orders: [
      { no: "1039", customer: "Sam Wilson", items: "Bluetooth Speaker", total: "$45.00", method: HandCoins, invoice: false },
      { no: "1037", customer: "Dana Reyes", items: "Wireless Headphones", total: "$59.00", method: Wallet, invoice: false },
    ],
  },
  {
    status: "Completed",
    orders: [
      { no: "1036", customer: "Taylor Smith", items: "Charging Cable, Screen Protector", total: "$20.00", method: Wallet, invoice: true },
      { no: "1034", customer: "Chris Bell", items: "Smart Watch", total: "$129.00", method: CreditCard, invoice: true },
    ],
  },
];

const JOURNEY_STEPS = [
  { icon: ShoppingCart, title: "Order Created", description: "New orders come in from any channel.", iconBg: "bg-blue-50", iconColor: "text-blue-600" },
  { icon: ClipboardCheck, title: "Confirmed", description: "Verify order details and availability.", iconBg: "bg-emerald-50", iconColor: "text-emerald-600" },
  { icon: Package, title: "Packed", description: "Pick items, pack with care.", iconBg: "bg-amber-50", iconColor: "text-amber-600" },
  { icon: Truck, title: "Shipped", description: "Hand over to carrier and start tracking.", iconBg: "bg-violet-50", iconColor: "text-violet-600" },
  { icon: MapPin, title: "Out for Delivery", description: "On the way to your customer.", iconBg: "bg-blue-50", iconColor: "text-blue-600" },
  { icon: CheckCircle2, title: "Delivered", description: "Order completed. Customer happy.", iconBg: "bg-emerald-50", iconColor: "text-emerald-600" },
];

const FULFILLMENT_ROWS = [
  { order: "ORD-4587", customer: "Alex Morgan", status: "Packed", priority: "High", checked: true },
  { order: "ORD-4586", customer: "Jamie Lee", status: "Picked", priority: "Medium", checked: false },
  { order: "ORD-4585", customer: "Sam Wilson", status: "Confirmed", priority: "Medium", checked: false },
  { order: "ORD-4584", customer: "Taylor Smith", status: "Pending", priority: "Low", checked: false },
  { order: "ORD-4583", customer: "Casey Brown", status: "Shipped", priority: "High", checked: false },
];

const STATUS_COLORS: Record<string, string> = {
  Packed: "text-emerald-600",
  Picked: "text-blue-600",
  Confirmed: "text-blue-600",
  Pending: "text-fg-faint",
  Shipped: "text-violet-600",
};

const PRIORITY_COLORS: Record<string, string> = {
  High: "text-red-600",
  Medium: "text-amber-600",
  Low: "text-fg-faint",
};

const TRACKING_STEPS = [
  { label: "Confirmed", time: "May 8, 10:20 AM", icon: Check, final: false, tracking: null as string | null },
  { label: "Packed", time: "May 8, 2:15 PM", icon: Package, final: false, tracking: null as string | null },
  { label: "Shipped", time: "May 8, 6:40 PM", icon: Truck, final: false, tracking: "Tracking #12999AA10123456784" as string | null },
  { label: "Out for Delivery", time: "May 9, 9:10 AM", icon: MapPin, final: false, tracking: null as string | null },
  { label: "Delivered", time: "May 9, 3:45 PM", icon: CheckCircle2, final: true, tracking: null as string | null },
];

const EXCEPTIONS = [
  { icon: AlertCircle, title: "Delivery Delay", order: "Order #ORD-4575", severity: "High", time: "2h ago", color: "text-red-600", bg: "bg-red-50" },
  { icon: Wallet, title: "Payment Failed", order: "Order #ORD-4571", severity: "Medium", time: "5h ago", color: "text-amber-600", bg: "bg-amber-50" },
  { icon: MapPin, title: "Address Issue", order: "Order #ORD-4569", severity: "Low", time: "1d ago", color: "text-fg-muted", bg: "bg-surface-2" },
];

const BENEFITS = [
  { icon: Gauge, title: "Save Time", description: "One board instead of three separate apps to check." },
  { icon: Bell, title: "Live Status", description: "The whole team sees the same order state, instantly." },
  { icon: Users, title: "Happy Customers", description: "Faster answers because history is one tap away." },
  { icon: TrendingUp, title: "Better Insights", description: "One profit report across every channel." },
  { icon: Sparkles, title: "Built to Scale", description: "Handles more orders and channels with ease." },
];

const ECOSYSTEM = [
  { icon: Zap, label: "Fast Sale" },
  { icon: Box, label: "Inventory" },
  { icon: Users, label: "Customers" },
  { icon: Wallet, label: "Payments" },
  { icon: Calendar, label: "Bookings" },
  { icon: MessageSquare, label: "Unified Inbox" },
  { icon: BarChart3, label: "Reports" },
];

export default function OrdersPage() {
  return (
    <div data-theme="light" className="flex min-h-dvh flex-col bg-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />

      <main className="flex-1">
        

        {/* Hero */}
        <section className="relative mt-5 overflow-hidden px-5 pb-8 pt-0 sm:px-7 sm:pb-10 sm:pt-0">
          <div className="relative mx-auto flex max-w-[1320px] flex-wrap items-start gap-x-14 gap-y-12">
            <div className="min-w-[300px] max-w-[520px] flex-1 basis-[440px]">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#e3fbf1] px-3.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#0b7a4c]">
                <ClipboardList className="h-3.5 w-3.5" aria-hidden /> Orders
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
                  Manage Orders Smarter <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link
                  href="#board"
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

            {/* Complete order board — mirrors the real app's live Pending/Confirmed/In Progress/Completed board, shown in full on the right */}
            <div className="relative min-w-[320px] flex-1 basis-[460px]">
              <div
                className="pointer-events-none absolute -right-10 -top-16 h-[260px] w-[260px] rotate-12 text-accent/10"
                style={{
                  backgroundImage: "radial-gradient(currentColor 1.5px, transparent 1.5px)",
                  backgroundSize: "16px 16px",
                }}
                aria-hidden
              />

              <div className="relative rounded-md border border-border-strong bg-white p-5 shadow-[0_50px_100px_-45px_rgba(13,21,18,0.35)] sm:p-6">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-[16px] font-semibold text-fg">Orders</span>
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] text-fg-faint">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden /> Live board
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {BOARD_COLUMNS.map((col) => (
                    <div key={col.status} className="rounded-md border border-border bg-surface-2 p-2.5">
                      <div className="mb-2.5 flex items-center justify-between">
                        <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-fg-faint">{col.status}</span>
                        <span className="rounded-full bg-white px-1.5 text-[9.5px] font-medium text-fg-muted">{col.orders.length}</span>
                      </div>
                      <div className="flex flex-col gap-2">
                        {col.orders.map((o) => (
                          <div key={o.no} className="rounded-md border border-border bg-white p-2.5">
                            <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold text-fg">
                              <o.method className="h-3 w-3 flex-none text-accent" aria-hidden />#{o.no}
                            </div>
                            <div className="truncate text-[9.5px] text-fg-muted">{o.customer}</div>
                            <div className="truncate text-[9px] text-fg-faint">{o.items}</div>
                            <div className="mt-1.5 flex items-center justify-between">
                              <span className="text-[10px] font-semibold text-fg">{o.total}</span>
                              {o.invoice ? <FileText className="h-3 w-3 text-accent" aria-hidden /> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* The order journey, made simple */}
        <section id="board" className="mt-10 px-5 sm:px-7">
          <div className="mx-auto max-w-[1320px] rounded-md border border-[#efe6d3] bg-[#f8f3e8] p-6 sm:p-8">
            <div className="flex flex-wrap items-start gap-x-14 gap-y-8">
              <div className="w-full max-w-[300px] flex-none">
                <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">The order journey, made simple</p>
                <h2 className="mb-3 text-balance font-display text-[26px] font-bold leading-[1.15] tracking-tight text-fg">
                  From Order to Delivery — We&apos;ve Got It Covered.
                </h2>
                <p className="mb-4 text-[13.5px] leading-relaxed text-fg-muted">
                  Noxtill Orders gives you complete visibility and control across the entire lifecycle of every order.
                  Stay organized, work faster and deliver a better experience to your customers.
                </p>
                <p className="text-[13px] font-medium text-fg-muted">
                  <Link href="#experience" className="text-primary hover:underline">
                    Explore the full journey:
                  </Link>
                </p>
              </div>

              <div className="min-w-[280px] flex-1">
                <div className="relative mb-3 hidden items-center justify-between px-[8%] sm:flex">
                  <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-[#d8cba8]" aria-hidden />
                  {JOURNEY_STEPS.map((s) => (
                    <span key={s.title} className="relative z-10 h-2 w-2 rounded-full bg-primary" />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {JOURNEY_STEPS.map((s) => (
                    <div key={s.title} className="flex flex-col items-center rounded-md border border-[#efe6d3] bg-white px-2 py-4 text-center">
                      <span className={`mb-3 flex h-11 w-11 items-center justify-center rounded-full ${s.iconBg}`}>
                        <s.icon className={`h-5 w-5 ${s.iconColor}`} aria-hidden />
                      </span>
                      <div className="mb-1 text-[13px] font-semibold text-fg">{s.title}</div>
                      <p className="text-[10.5px] leading-snug text-fg-muted">{s.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="experience" className="px-5 pt-8 sm:px-7 sm:pt-10">
          <div className="mx-auto max-w-[1320px]">
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              {/* Fulfillment board */}
              <div className="rounded-md border border-border bg-white p-5">
                <p className="mb-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-primary">Fulfillment board</p>
                <h3 className="mb-2 text-balance font-display text-[19px] font-bold leading-[1.2] text-fg">Plan. Pack. Ship. All on One Board.</h3>
                <p className="mb-4 text-[12.5px] leading-relaxed text-fg-muted">
                  Use the fulfillment board to manage all your orders in one place. Filter, prioritize and fulfill
                  faster.
                </p>

                <div className="rounded-md border border-border">
                  <div className="border-b border-border px-3 py-2.5">
                    <p className="mb-2 text-[12px] font-semibold text-fg">Fulfillment Board</p>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="rounded-md border border-border px-2 py-1 text-[10px] text-fg-muted">All Locations</span>
                      <span className="rounded-md border border-border px-2 py-1 text-[10px] text-fg-muted">All Status</span>
                      <span className="rounded-md border border-border px-2 py-1 text-[10px] text-fg-muted">Today</span>
                    </div>
                  </div>
                  <div className="divide-y divide-border text-[10.5px]">
                    <div className="grid grid-cols-[16px_1fr_1fr_1fr_1fr] items-center gap-1.5 px-3 py-1.5 text-[9.5px] font-medium text-fg-faint">
                      <span />
                      <span>Order</span>
                      <span>Customer</span>
                      <span>Status</span>
                      <span>Priority</span>
                    </div>
                    {FULFILLMENT_ROWS.map((r) => (
                      <div key={r.order} className="grid grid-cols-[16px_1fr_1fr_1fr_1fr] items-center gap-1.5 px-3 py-1.5">
                        <input type="checkbox" readOnly checked={r.checked} className="h-3 w-3 accent-accent" />
                        <span className="truncate text-fg">{r.order}</span>
                        <span className="truncate text-fg-muted">{r.customer}</span>
                        <span className={`truncate font-medium ${STATUS_COLORS[r.status]}`}>{r.status}</span>
                        <span className={`truncate font-medium ${PRIORITY_COLORS[r.priority]}`}>{r.priority}</span>
                      </div>
                    ))}
                  </div>
                  <div className="px-3 py-2.5">
                    <Link href="#" className="text-[11px] font-medium text-primary hover:underline">
                      View All Orders →
                    </Link>
                  </div>
                </div>
              </div>

              {/* Real-time tracking */}
              <div className="rounded-md border border-border bg-white p-5">
                <p className="mb-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-primary">Delivery states</p>
                <h3 className="mb-2 text-balance font-display text-[19px] font-bold leading-[1.2] text-fg">Real-Time Tracking at Every Step.</h3>
                <p className="mb-4 text-[12.5px] leading-relaxed text-fg-muted">
                  Know exactly where every order is with clear status updates and real-time tracking.
                </p>

                <div className="rounded-md border border-border p-3">
                  <div className="flex flex-col gap-3">
                    {TRACKING_STEPS.map((t, i) => (
                      <div key={t.label} className="relative flex gap-2.5">
                        {i < TRACKING_STEPS.length - 1 ? <span className="absolute left-[9px] top-5 h-full w-px bg-border" aria-hidden /> : null}
                        <span
                          className={`relative z-10 flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full ${
                            t.final ? "bg-emerald-500" : "border border-border bg-surface-2"
                          }`}
                        >
                          <t.icon className={`h-2.5 w-2.5 ${t.final ? "text-white" : "text-fg-muted"}`} aria-hidden />
                        </span>
                        <div className="pb-1">
                          <p className={`text-[11.5px] font-semibold ${t.final ? "text-emerald-600" : "text-fg"}`}>{t.label}</p>
                          <p className="text-[10px] text-fg-faint">{t.time}</p>
                          {t.tracking ? (
                            <span className="mt-1 inline-block rounded-md bg-blue-50 px-2 py-0.5 text-[9.5px] font-medium text-blue-700">
                              {t.tracking}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Exception recovery */}
              <div className="rounded-md border border-border bg-white p-5">
                <p className="mb-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-primary">Exception recovery</p>
                <h3 className="mb-2 text-balance font-display text-[19px] font-bold leading-[1.2] text-fg">Catch Issues Early. Solve Them Fast.</h3>
                <p className="mb-4 text-[12.5px] leading-relaxed text-fg-muted">
                  Identify delays, failed deliveries, returns and other exceptions and take action before customers
                  notice.
                </p>

                <div className="rounded-md border border-border p-3">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-[12px] font-semibold text-fg">Exceptions</span>
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                      {EXCEPTIONS.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {EXCEPTIONS.map((e) => (
                      <div key={e.title} className="flex items-start gap-2">
                        <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-full ${e.bg}`}>
                          <e.icon className={`h-3 w-3 ${e.color}`} aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11.5px] font-semibold text-fg">{e.title}</p>
                          <p className="truncate text-[10px] text-fg-faint">{e.order}</p>
                        </div>
                        <div className="flex-none text-right">
                          <p className={`text-[10.5px] font-semibold ${e.color}`}>{e.severity}</p>
                          <p className="text-[9.5px] text-fg-faint">{e.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 border-t border-border pt-2.5">
                    <Link href="#" className="text-[11px] font-medium text-primary hover:underline">
                      View All Exceptions →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Why teams love it */}
        <section className="mt-10 px-5 sm:px-7">
          <div className="mx-auto max-w-[1320px] rounded-md border border-border bg-surface-2 p-8 sm:p-10">
            <div className="flex flex-wrap items-center gap-x-10 gap-y-8">
              <div className="max-w-[280px] flex-none">
                <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">Built for growing businesses</p>
                <h2 className="mb-3 text-balance font-display text-[26px] font-bold leading-[1.15] tracking-tight text-fg">
                  Why Teams Love <span className="text-accent">Noxtill Orders</span>
                </h2>
                <p className="text-[13.5px] leading-relaxed text-fg-muted">
                  Streamline operations, reduce errors and deliver a better experience at every step.
                </p>
              </div>

              <div className="flex flex-1 flex-wrap divide-x divide-border">
                {BENEFITS.map((b) => (
                  <div key={b.title} className="flex min-w-[140px] flex-1 flex-col items-center gap-2 px-4 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#e3fbf1]">
                      <b.icon className="h-5 w-5 text-accent" aria-hidden />
                    </span>
                    <div className="text-[13.5px] font-semibold text-fg">{b.title}</div>
                    <p className="text-[11.5px] leading-relaxed text-fg-muted">{b.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <EcosystemStrip subheading="Orders connect with every part of your business." items={ECOSYSTEM} />

        {/* Closing CTA */}
        <section className="relative mt-10 overflow-hidden bg-surface-deep px-5 py-7 sm:px-7 sm:py-8">
          
          <div className="relative mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-14 gap-y-10">
            <div className="min-w-[300px] flex-1 basis-[420px]">
              <p className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-on-deep">From order to loyal customer</p>
              <h2 className="mb-4 text-balance font-display text-[30px] font-bold leading-[1.15] tracking-tight text-fg-on-deep sm:text-[36px]">
                One Board. Every Order. <span className="text-accent-on-deep">Zero Chaos.</span>
              </h2>
              <p className="mb-7 max-w-[48ch] text-[15px] leading-relaxed text-fg-on-deep-muted">{page.pullQuote}</p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/book-a-demo"
                  className="inline-flex items-center gap-2 rounded-md bg-white px-6.5 py-3.5 text-[15px] font-semibold text-[#053b2a] transition-colors hover:bg-[#e6f5ee]"
                >
                  Manage Orders Smarter <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link
                  href="/book-a-demo"
                  className="inline-flex items-center rounded-md border border-border-on-deep px-6 py-3.5 text-[15px] font-medium text-fg-on-deep transition-colors hover:border-fg-on-deep-muted"
                >
                  Book a Demo
                </Link>
              </div>
            </div>

            <div className="min-w-[280px] flex-1 basis-[340px]">
              <div className="rounded-md border border-white/10 bg-[#03251b] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[12.5px] font-medium text-fg-on-deep">Order #1036</span>
                  <span className="rounded-full bg-accent-on-deep/15 px-2.5 py-1 text-[10.5px] font-medium text-accent-on-deep">Completed</span>
                </div>
                <p className="mb-1 text-[11px] text-fg-on-deep-faint">Taylor Smith · Charging Cable, Screen Protector</p>
                <p className="mb-3 text-[11px] text-fg-on-deep-faint">Paid via Wallet · $20.00</p>
                <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-accent-on-deep">
                  <FileText className="h-3.5 w-3.5" aria-hidden /> Invoice ready
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

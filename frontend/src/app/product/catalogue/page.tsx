import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Boxes,
  Building2,
  CalendarClock,
  CircleCheckBig,
  Clock,
  CreditCard,
  Layers,
  Link2,
  Package,
  PieChart,
  PlayCircle,
  RefreshCw,
  Search,
  ShoppingCart,
  Store,
  Tags,
  Users2,
  Wallet,
  Zap,
} from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { DetailRelated } from "@/components/site/detail-page-sections";
import { EcosystemStrip } from "@/components/site/ecosystem-strip";
import { findProductDetailPage } from "@/lib/marketing/product-detail-content";

const page = findProductDetailPage("catalogue")!;

export const metadata: Metadata = {
  title: page.metaTitle,
  description: page.metaDescription,
  alternates: { canonical: "https://noxtill.com/product/catalogue/" },
  openGraph: {
    type: "website",
    url: "https://noxtill.com/product/catalogue/",
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
        { "@type": "ListItem", position: 3, name: "Products & Services", item: "https://noxtill.com/product/catalogue/" },
      ],
    },
    {
      "@type": "Article",
      headline: page.metaTitle,
      description: page.metaDescription,
      url: "https://noxtill.com/product/catalogue/",
    },
  ],
};

const ORBIT_ITEMS = [
  { icon: ShoppingCart, label: "Fast Sale" },
  { icon: Package, label: "Orders" },
  { icon: CalendarClock, label: "Bookings" },
  { icon: BarChart3, label: "Profit & Loss" },
  { icon: PieChart, label: "Analytics" },
  { icon: Boxes, label: "Inventory" },
  { icon: CreditCard, label: "Customer Credit" },
];

const FEATURE_CARDS = [
  { icon: Wallet, tint: "bg-[#e3fbf1]", color: "text-accent", title: "Price & True Cost", description: "One place to store both the selling price and the real cost behind every item." },
  { icon: PieChart, tint: "bg-blue-50", color: "text-blue-600", title: "Real Margins", description: "Margin is calculated automatically from cost and price — a fact, not a guess." },
  { icon: Layers, tint: "bg-violet-50", color: "text-violet-600", title: "Products & Services, Both", description: "Physical items and bookable services live in the same catalogue, priced the same way." },
  { icon: Tags, tint: "bg-pink-50", color: "text-pink-600", title: "Categories & Variants", description: "Organize by category, size, color or option — without duplicating item records." },
  { icon: RefreshCw, tint: "bg-orange-50", color: "text-orange-600", title: "Update Once, Everywhere", description: "Change a price once and it updates on the till, online and in every report instantly." },
  { icon: BarChart3, tint: "bg-sky-50", color: "text-sky-600", title: "Feeds Profit & Loss", description: "Every sale carries its real margin straight into your reports — no re-entry." },
  { icon: AlertTriangle, tint: "bg-rose-50", color: "text-rose-600", title: "Low-Margin Alerts", description: "Know which items are actually worth the shelf space before they quietly cost you money." },
  { icon: Clock, tint: "bg-red-50", color: "text-red-600", title: "Service Duration & Staff", description: "Set how long a service takes and who can perform it — feeds straight into Bookings." },
  { icon: Search, tint: "bg-amber-50", color: "text-amber-600", title: "Searchable Catalogue", description: "Find any product or service instantly by name, category, barcode or SKU." },
  { icon: Link2, tint: "bg-teal-50", color: "text-teal-600", title: "Connected Everywhere", description: "The same catalogue record powers Fast Sale, Orders, Bookings and Inventory at once." },
];

const PLATFORM_CHECKLIST = ["True cost stored per item, margin calculated automatically", "Real performance visible per product or service", "Change a price once, it updates everywhere"];

const NETWORK_ITEMS = [
  { icon: ShoppingCart, label: "Fast Sale" },
  { icon: Package, label: "Orders" },
  { icon: CalendarClock, label: "Bookings" },
  { icon: Boxes, label: "Inventory" },
  { icon: BarChart3, label: "Profit & Loss" },
  { icon: PieChart, label: "Analytics" },
  { icon: CreditCard, label: "Credit" },
  { icon: Wallet, label: "Reports" },
];

const BUSINESS_TYPES = [
  { icon: Store, title: "Retail Stores", description: "Price every item with its real cost, not a guess at the counter." },
  { icon: Users2, title: "Service Businesses", description: "Services priced and timed just like products — ready for Bookings." },
  { icon: ShoppingCart, title: "E-commerce Brands", description: "One catalogue for online and in-store, always in sync." },
  { icon: Layers, title: "Multi-location Businesses", description: "Shared pricing and margins across every branch, no duplication." },
  { icon: Building2, title: "Growing Teams", description: "A catalogue that scales as new products and services get added." },
];

const SUITE_STATS = [
  { label: "Single Source", value: "1", caption: "Price & cost record" },
  { label: "Margin Visibility", value: "100%", caption: "Of sales priced with real margin" },
  { label: "Price Updates", value: "Instant", caption: "Everywhere at once" },
];

function OrbitDiagram() {
  const radius = 42;
  const count = ORBIT_ITEMS.length;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[480px]">
      <svg className="absolute inset-0 h-full w-full" aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none">
        {ORBIT_ITEMS.map((_, i) => {
          const angle = (360 / count) * i - 90;
          const rad = (angle * Math.PI) / 180;
          const x2 = 50 + radius * Math.cos(rad);
          const y2 = 50 + radius * Math.sin(rad);
          return <line key={i} x1="50" y1="50" x2={x2} y2={y2} stroke="var(--color-border)" strokeWidth="0.3" strokeDasharray="1.5 1.5" />;
        })}
      </svg>

      <div className="absolute left-1/2 top-1/2 flex h-[140px] w-[140px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-surface-deep text-center shadow-[0_30px_60px_-30px_rgba(5,59,42,0.6)]">
        <span className="relative mb-1.5 h-9 w-9">
          <Image src="/brand/noxtill-logo1.png" alt="" fill sizes="36px" className="object-contain" />
        </span>
        <span className="font-display text-[15px] font-bold leading-tight text-fg-on-deep">Products</span>
        <span className="font-display text-[15px] font-bold leading-tight text-fg-on-deep">& Services</span>
      </div>

      {ORBIT_ITEMS.map((item, i) => {
        const angle = (360 / count) * i - 90;
        const rad = (angle * Math.PI) / 180;
        const x = 50 + radius * Math.cos(rad);
        const y = 50 + radius * Math.sin(rad);
        return (
          <div
            key={item.label}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 text-center"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <span className="flex h-13 w-13 items-center justify-center rounded-full border border-border bg-white shadow-[0_10px_30px_-15px_rgba(13,21,18,0.3)]">
              <item.icon className="h-5 w-5 text-accent" aria-hidden />
            </span>
            <span className="max-w-[80px] text-[11px] font-medium leading-tight text-fg">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function NetworkDiagram() {
  return (
    <div className="relative overflow-hidden rounded-md border border-white/10 bg-[#050b09] p-6 sm:p-8">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{ backgroundImage: "radial-gradient(circle at 50% 50%, rgba(16,185,129,0.25), transparent 60%)" }}
        aria-hidden
      />
      <div className="relative mx-auto grid max-w-[560px] grid-cols-4 gap-x-4 gap-y-10">
        {NETWORK_ITEMS.slice(0, 4).map((item) => (
          <div key={item.label} className="flex flex-col items-center gap-2 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-emerald-500/30 bg-[#0a1712]">
              <item.icon className="h-4.5 w-4.5 text-accent-on-deep" aria-hidden />
            </span>
            <span className="text-[11px] font-medium text-fg-on-deep-muted">{item.label}</span>
          </div>
        ))}
        <div className="relative col-span-4 -my-6 flex justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-primary shadow-[0_0_40px_rgba(16,185,129,0.5)]">
            <Package className="h-7 w-7 text-white" aria-hidden />
          </span>
        </div>
        {NETWORK_ITEMS.slice(4).map((item) => (
          <div key={item.label} className="flex flex-col items-center gap-2 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-emerald-500/30 bg-[#0a1712]">
              <item.icon className="h-4.5 w-4.5 text-accent-on-deep" aria-hidden />
            </span>
            <span className="text-[11px] font-medium text-fg-on-deep-muted">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CataloguePage() {
  return (
    <div data-theme="light" className="flex min-h-dvh flex-col bg-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />

      <main className="flex-1">
        

        {/* Hero */}
        <section className="px-5 pb-8 pt-8 sm:px-7 sm:pb-10">
          <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-14 gap-y-12">
            <div className="min-w-[300px] max-w-[520px] flex-1 basis-[440px]">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#e3fbf1] px-3.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#0b7a4c]">
                <Package className="h-3.5 w-3.5" aria-hidden /> Products & Services
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
                  Manage Your Catalogue <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link
                  href="#connected"
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

            <div className="min-w-[300px] flex-1 basis-[440px]">
              <OrbitDiagram />
            </div>
          </div>
        </section>

        {/* Everything you need */}
        <section className="px-5 pb-8 sm:px-7">
          <div className="mx-auto max-w-[1320px]">
            <div className="mb-2 text-center">
              <h2 className="font-display text-[28px] font-bold tracking-tight text-fg sm:text-[32px]">Everything Your Catalogue Needs.</h2>
              <div className="mx-auto mt-3 h-[3px] w-10 rounded-full bg-accent" />
              <p className="mt-3 text-[14.5px] text-fg-muted">Real prices. Real costs. Real margins.</p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
              {FEATURE_CARDS.map((card) => (
                <div key={card.title} className="flex flex-col items-center rounded-md border border-border bg-white p-5 text-center">
                  <span className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full ${card.tint}`}>
                    <card.icon className={`h-6 w-6 ${card.color}`} aria-hidden />
                  </span>
                  <h3 className="mb-2 text-[15px] font-semibold text-fg">{card.title}</h3>
                  <p className="text-[12.5px] leading-relaxed text-fg-muted">{card.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* One connected platform */}
        <section id="connected" className="px-5 pb-8 sm:px-7">
          <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-14 gap-y-10">
            <div className="min-w-[280px] max-w-[380px] flex-1">
              <p className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-[0.1em] text-primary">One record, every module</p>
              <h2 className="mb-4 text-balance font-display text-[28px] font-bold leading-[1.15] tracking-tight text-fg sm:text-[32px]">
                One Catalogue. <span className="text-accent">Every Sale.</span>
              </h2>
              <p className="mb-5 text-[14.5px] leading-relaxed text-fg-muted">
                Every product and service lives in one record — priced once, costed once — and every module that
                touches a sale reads from that same source.
              </p>
              <div className="flex flex-col gap-2.5">
                {PLATFORM_CHECKLIST.map((item) => (
                  <div key={item} className="flex items-center gap-2.5 text-[13.5px] text-fg">
                    <CircleCheckBig className="h-4 w-4 flex-none text-accent" aria-hidden />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="min-w-[320px] flex-[2]">
              <NetworkDiagram />
            </div>
          </div>
        </section>

        {/* Solutions for every business */}
        <section className="px-5 pb-8 sm:px-7">
          <div className="mx-auto max-w-[1320px]">
            <div className="mb-8 text-center">
              <h2 className="font-display text-[24px] font-bold tracking-tight text-fg">Priced Right, for Every Type of Business</h2>
              <p className="mt-2 text-[13.5px] text-fg-muted">Whether you sell products, services or both, Noxtill prices it the same way.</p>
            </div>

            <div className="flex flex-wrap items-stretch gap-5">
              <div className="grid min-w-[280px] flex-[3] grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {BUSINESS_TYPES.map((t) => (
                  <div key={t.title} className="rounded-md border border-border bg-white p-4 text-center">
                    <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#e3fbf1]">
                      <t.icon className="h-5 w-5 text-accent" aria-hidden />
                    </span>
                    <div className="mb-1 text-[13px] font-semibold text-fg">{t.title}</div>
                    <p className="text-[11px] leading-relaxed text-fg-muted">{t.description}</p>
                  </div>
                ))}
              </div>

              <div className="flex min-w-[220px] flex-1 flex-col gap-4 rounded-md border border-border bg-surface-2 p-5">
                {SUITE_STATS.map((s) => (
                  <div key={s.label}>
                    <p className="text-[11px] font-medium text-fg-faint">{s.label}</p>
                    <p className="font-display text-[22px] font-bold text-fg">
                      {s.value} <span className="text-[12px] font-normal text-fg-muted">{s.caption}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

    

        {/* Closing CTA */}
        <section className="relative overflow-hidden bg-surface-deep px-5 py-7 sm:px-7 sm:py-8">
          <div
            className="pointer-events-none absolute -right-16 bottom-0 h-[220px] w-[320px] opacity-30"
            style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.14) 1.5px, transparent 1.5px)", backgroundSize: "18px 18px" }}
            aria-hidden
          />
          <div className="relative mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-6">
            <div className="min-w-[280px] flex-1 basis-[420px]">
              <p className="text-[12px] font-medium uppercase tracking-[0.1em] text-fg-on-deep-muted">Busy isn&apos;t the same as profitable</p>
              <h2 className="mt-1 text-balance font-display text-[26px] font-bold leading-[1.15] tracking-tight text-fg-on-deep sm:text-[30px]">
                Price It Once. <span className="text-accent-on-deep">Profit Every Time.</span>
              </h2>
              <p className="mt-2 max-w-[52ch] text-[13.5px] leading-relaxed text-fg-on-deep-muted">{page.pullQuote}</p>
            </div>
            <div className="flex flex-none flex-wrap gap-3">
              <Link
                href="/book-a-demo"
                className="inline-flex items-center gap-2 rounded-md bg-white px-6.5 py-3.5 text-[15px] font-semibold text-[#053b2a] transition-colors hover:bg-[#e6f5ee]"
              >
                Manage Your Catalogue <ArrowRight className="h-4 w-4" aria-hidden />
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

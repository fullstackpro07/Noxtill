import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Banknote,
  Box,
  Check,
  ClipboardList,
  CreditCard,
  Gauge,
  HandCoins,
  Minus,
  MoreHorizontal,
  Package,
  PackageCheck,
  Pause,
  Pill,
  PlayCircle,
  Plus,
  Receipt as ReceiptIcon,
  ScanLine,
  Search,
  ShoppingBasket,
  ShoppingCart,
  Store,
  Tag,
  Timer,
  Trash2,
  UtensilsCrossed,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { DetailRelated } from "@/components/site/detail-page-sections";
import { EcosystemStrip } from "@/components/site/ecosystem-strip";
import { findProductDetailPage } from "@/lib/marketing/product-detail-content";

const page = findProductDetailPage("fast-sale")!;

export const metadata: Metadata = {
  title: page.metaTitle,
  description: page.metaDescription,
  alternates: { canonical: "https://noxtill.com/product/fast-sale/" },
  openGraph: {
    type: "website",
    url: "https://noxtill.com/product/fast-sale/",
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
        { "@type": "ListItem", position: 3, name: "Fast Sale", item: "https://noxtill.com/product/fast-sale/" },
      ],
    },
    {
      "@type": "Article",
      headline: page.metaTitle,
      description: page.metaDescription,
      url: "https://noxtill.com/product/fast-sale/",
    },
  ],
};

const LINE_ITEMS = [
  { name: "Wireless Headphones", price: "$59.00" },
  { name: "Smart Watch", price: "$129.00" },
  { name: "Phone Case", price: "$15.00" },
  { name: "Fast Charging Cable", price: "$12.00" },
];

const PRODUCT_TILES = [
  { name: "Wireless Headphones", price: "$59.00" },
  { name: "Smart Watch", price: "$129.00" },
  { name: "Phone Case", price: "$15.00" },
  { name: "Charging Cable", price: "$12.00" },
  { name: "Bluetooth Speaker", price: "$45.00" },
  { name: "Screen Protector", price: "$8.00" },
];

const CART_LINE_ITEMS = [
  { name: "Wireless Headphones", qty: 1 },
  { name: "Smart Watch", qty: 1 },
];

const PAYMENT_METHODS = [
  { icon: Banknote, label: "Cash" },
  { icon: CreditCard, label: "Card" },
  { icon: Wallet, label: "Wallet" },
  { icon: HandCoins, label: "Credit" },
];

const FEATURES = [
  { icon: Search, title: "Quick Product Search", description: "Find products instantly by name, barcode or SKU." },
  { icon: ShoppingCart, title: "Cart Management", description: "Add, update or remove items with a single tap." },
  { icon: Tag, title: "Discounts & Offers", description: "Apply discounts, promotions and custom offers easily." },
  { icon: CreditCard, title: "Multiple Payment Types", description: "Cash, card, wallet, UPI and more. All in one place." },
  { icon: Pause, title: "Hold & Park Sales", description: "Hold or park sales and resume when ready." },
  { icon: ReceiptIcon, title: "Print & e-Receipt", description: "Print or send digital receipts instantly to customers." },
];

const SPEED_STATS = [
  { icon: Timer, value: "<10s", label: "Average Checkout Time" },
  { icon: Gauge, value: "99.9%", label: "Transaction Accuracy" },
  { icon: Zap, value: "2X", label: "Faster Than Traditional POS" },
];

const CHECKOUT_CHECKLIST = [
  "Clean and intuitive interface",
  "Works offline and syncs when you're back",
  "Supports barcode, QR and manual entry",
  "Perfect for high-traffic environments",
];

const BUSINESS_TYPES = [
  { icon: Store, title: "Retail Stores", description: "Streamline sales and speed up checkout at the counter." },
  { icon: ShoppingBasket, title: "Supermarkets", description: "Handle high volume with ease and accuracy." },
  { icon: Pill, title: "Pharmacies", description: "Quick medicine search and smooth billing." },
  { icon: UtensilsCrossed, title: "Restaurants", description: "Fast billing, table orders and split payments." },
  { icon: PackageCheck, title: "E-commerce Pickups", description: "Generate bills and manage pickup orders quickly." },
  { icon: MoreHorizontal, title: "And Many More", description: "Works for any business that makes sales." },
];

const ECOSYSTEM = [
  { icon: Box, label: "Inventory" },
  { icon: Users, label: "Customers" },
  { icon: Wallet, label: "Payments" },
  { icon: ClipboardList, label: "Orders" },
  { icon: Tag, label: "Discounts" },
  { icon: BarChart3, label: "Reports" },
  { icon: Package, label: "Profit & Analytics" },
];

const CLOSING_CHECKLIST = [
  { title: "Easy to Set Up", description: "Get started in minutes" },
  { title: "No Hardware Lock-in", description: "Use your preferred devices" },
  { title: "24/7 Support", description: "We're here to help you grow" },
];

export default function FastSalePage() {
  return (
    <div data-theme="light" className="flex min-h-dvh flex-col bg-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />

      <main className="flex-1">
       

        {/* Hero */}
        <section className="relative mt-5 overflow-hidden px-5 pb-10 pt-12 sm:px-7 sm:pb-0 sm:pt-10">
          <div className="relative mx-auto flex max-w-[1320px] flex-wrap items-start gap-x-14 gap-y-16">
            <div className="min-w-[300px] max-w-[540px] flex-1 basis-[440px]">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#e3fbf1] px-3.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#0b7a4c]">
                <Zap className="h-3.5 w-3.5" aria-hidden /> Fast Sale
              </div>
              <h1 className="text-balance font-display text-[40px] font-bold leading-[1.1] tracking-tight text-fg sm:text-[50px]">
                {page.h1Lead} <span className="text-accent">{page.h1Highlight}</span>
              </h1>
              <p className="mt-4 max-w-[48ch] text-[16px] leading-relaxed text-fg-muted">{page.subhead}</p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  href="/book-a-demo"
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-6.5 py-3.5 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
                >
                  Start Selling Faster <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link
                  href="#experience"
                  className="inline-flex items-center gap-2 rounded-xl border border-border-strong px-6 py-3.5 text-[15px] font-medium text-fg transition-colors hover:border-accent hover:text-primary"
                >
                  See It In Action <PlayCircle className="h-4 w-4" aria-hidden />
                </Link>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {page.benefits.map((b) => (
                  <div
                    key={b.label}
                    className="flex flex-col items-center gap-2 rounded-lg border border-border bg-white px-2 py-4 text-center shadow-[0_2px_10px_-4px_rgba(13,21,18,0.08)]"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e3fbf1]">
                      <b.icon className="h-5 w-5 text-accent" aria-hidden />
                    </span>
                    <span className="text-[12px] font-medium leading-tight text-fg">{b.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative flex min-w-[300px] flex-1 basis-[440px] justify-center pt-4">
              <div
                className="pointer-events-none absolute -right-10 -top-10 h-[220px] w-[220px] rotate-12 text-accent/10"
                style={{
                  backgroundImage: "radial-gradient(currentColor 1.5px, transparent 1.5px)",
                  backgroundSize: "16px 16px",
                }}
                aria-hidden
              />
              <Zap className="pointer-events-none absolute -right-4 top-6 h-28 w-28 -rotate-12 text-accent/15" aria-hidden strokeWidth={1} />

              <div className="relative w-full max-w-[460px]">
                {/* Fast Sale screen — mirrors the real app's product-grid + cart layout */}
                <div className="rounded-t-2xl border border-border-strong bg-white p-4 shadow-[0_40px_90px_-40px_rgba(13,21,18,0.35)] sm:p-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[14px] font-semibold text-fg">Fast Sale</span>
                    <div className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[10px] text-fg-faint">
                      <ScanLine className="h-3 w-3 flex-none" aria-hidden />
                      Scan or type SKU…
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    {/* Product grid */}
                    <div className="grid flex-1 grid-cols-3 gap-2 sm:grid-cols-2">
                      {PRODUCT_TILES.map((p) => (
                        <div key={p.name} className="rounded-lg border border-border p-2">
                          <div className="truncate text-[10.5px] font-medium text-fg">{p.name}</div>
                          <div className="text-[10px] text-fg-muted">{p.price}</div>
                        </div>
                      ))}
                    </div>

                    {/* Cart panel */}
                    <div className="w-full flex-none rounded-lg border border-border bg-surface-2 p-2.5 sm:w-[168px]">
                      <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.06em] text-fg-faint">Current sale</p>
                      <div className="mb-2 rounded-md border border-border bg-white px-2 py-1.5 text-[9px] text-fg-faint">
                        Customer name or phone
                      </div>

                      <div className="mb-2 flex flex-col gap-1.5">
                        {CART_LINE_ITEMS.map((item) => (
                          <div key={item.name} className="flex items-center justify-between gap-1 text-[9.5px]">
                            <span className="truncate text-fg">{item.name}</span>
                            <div className="flex flex-none items-center gap-1 text-fg-muted">
                              <Minus className="h-2.5 w-2.5" aria-hidden />
                              <span>{item.qty}</span>
                              <Plus className="h-2.5 w-2.5" aria-hidden />
                              <Trash2 className="h-2.5 w-2.5" aria-hidden />
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mb-2 grid grid-cols-4 gap-1">
                        {PAYMENT_METHODS.map((m, i) => (
                          <span
                            key={m.label}
                            className={`flex items-center justify-center rounded-md border p-1.5 ${i === 1 ? "border-accent bg-[#e3fbf1]" : "border-border bg-white"}`}
                          >
                            <m.icon className={`h-3 w-3 ${i === 1 ? "text-accent" : "text-fg-muted"}`} aria-hidden />
                          </span>
                        ))}
                      </div>

                      <div className="mb-2 flex items-center justify-between border-t border-border pt-1.5 text-[12px] font-semibold text-fg">
                        <span>Total</span>
                        <span>$223.45</span>
                      </div>

                      <div className="flex gap-1.5">
                        <span className="flex-1 rounded-md border border-border py-1.5 text-center text-[9.5px] font-medium text-fg-muted">Hold</span>
                        <span className="flex-[2] rounded-md bg-primary py-1.5 text-center text-[9.5px] font-semibold text-primary-foreground">
                          Confirm sale
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mx-auto h-3 w-24 rounded-b-lg bg-border-strong" />
                <div className="mx-auto mt-1 h-2 w-40 rounded-full bg-border" />


              </div>


            </div>
          </div>
        </section>

        {/* Everything you need */}
        <section className="mt-10 bg-surface-deep px-5 py-4 sm:px-7 sm:py-8">
          <div className="mx-auto max-w-[1320px]">
            <div className="mb-0 flex flex-wrap items-start justify-between gap-10">
              <div className="w-full max-w-none sm:max-w-[300px]">
                <p className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-on-deep">Every sale. Every time.</p>
                <h2 className="mb-4 text-balance font-display text-[28px] font-bold leading-[1.15] tracking-tight text-fg-on-deep sm:text-[32px]">
                  Everything You Need to Complete a Sale in Seconds
                </h2>
                <p className="text-[14px] leading-relaxed text-fg-on-deep-muted">
                  Fast Sale brings all the essential tools together in one beautiful, easy-to-use screen so your team can
                  focus on customers, not the system.
                </p>
              </div>

              <div className="grid flex-[2] grid-cols-1 gap-5 sm:grid-cols-3">
                {FEATURES.map((f) => (
                  <div key={f.title} className="rounded-lg border border-white/10 bg-white/5 p-5">
                    <span className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
                      <f.icon className="h-3 w-3 text-accent-on-deep" aria-hidden />
                    </span>
                    <div className="mb-1.5 text-[12px] font-semibold text-fg-on-deep">{f.title}</div>
                    <p className="text-[10px] leading-relaxed text-fg-on-deep-muted">{f.description}</p>
                  </div>
                ))}
              </div>

              <div className="w-full max-w-none flex-none rounded-2xl border border-white/10 bg-white/5 p-6 sm:max-w-[320px]">
                <p className="mb-1 text-[16px] font-semibold text-fg-on-deep">Built for Speed</p>
                <p className="mb-5 text-[13px] leading-relaxed text-fg-on-deep-muted">Optimized for real-world business environments.</p>
                <div className="flex flex-col gap-5">
                  {SPEED_STATS.map((s) => (
                    <div key={s.label} className="flex items-center gap-3.5">
                      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-white/10">
                        <s.icon className="h-5 w-5 text-accent-on-deep" aria-hidden />
                      </span>
                      <div>
                        <p className="font-display text-[20px] font-bold text-fg-on-deep">{s.value}</p>
                        <p className="text-[12.5px] text-fg-on-deep-muted">{s.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Better checkout experience */}
        <section id="experience" className="px-5 pt-12 sm:px-7 sm:pt-14">
          <div className="mx-auto flex max-w-[1320px] flex-wrap items-start gap-x-14 gap-y-10">
            <div className="min-w-[300px] flex-1 basis-[420px]">
              <div className="relative flex justify-center rounded-[20px] border border-border bg-surface-2 p-6 sm:p-10">
                <div
                  className="w-full max-w-[280px] bg-white p-4 shadow-[0_30px_70px_-40px_rgba(13,21,18,0.35)] sm:p-5"
                  style={{
                    clipPath:
                      "polygon(0 0,100% 0,100% 97%,94% 100%,88% 97%,82% 100%,76% 97%,70% 100%,64% 97%,58% 100%,52% 97%,46% 100%,40% 97%,34% 100%,28% 97%,22% 100%,16% 97%,10% 100%,4% 97%,0 100%)",
                  }}
                >
                  <div className="mb-3 text-center">
                    <p className="font-display text-[15px] font-bold text-fg">Noxtill Retail Co.</p>
                    <p className="text-[9px] text-fg-faint">123 Market Street, Springfield</p>
                    <p className="text-[9px] text-fg-faint">Receipt #10432 · May 18, 2025</p>
                  </div>

                  <div className="mb-3 flex flex-col gap-1.5 border-t border-dashed border-border-strong pt-3">
                    {LINE_ITEMS.map((item) => (
                      <div key={item.name} className="flex items-center justify-between text-[10.5px] text-fg">
                        <span>{item.name}</span>
                        <span>{item.price}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mb-3 flex flex-col gap-1 border-t border-dashed border-border-strong pt-3 text-[10.5px]">
                    <div className="flex justify-between text-fg-muted">
                      <span>Subtotal</span>
                      <span>$215.00</span>
                    </div>
                    <div className="flex justify-between text-fg-muted">
                      <span>Discount</span>
                      <span>-$10.00</span>
                    </div>
                    <div className="flex justify-between text-fg-muted">
                      <span>Tax</span>
                      <span>$18.45</span>
                    </div>
                    <div className="mt-1 flex justify-between border-t border-dashed border-border-strong pt-1.5 text-[13.5px] font-bold text-fg">
                      <span>Total</span>
                      <span>$223.45</span>
                    </div>
                  </div>

                  <div className="mb-3 flex justify-between border-t border-dashed border-border-strong pt-3 text-[10.5px] text-fg-muted">
                    <span>Paid via</span>
                    <span className="font-medium text-fg">Card</span>
                  </div>

                  <div className="flex flex-col items-center gap-2 border-t border-dashed border-border-strong pt-3">
                    <div className="flex h-8 w-full items-end gap-[2px]" aria-hidden>
                      {Array.from({ length: 32 }).map((_, i) => (
                        <span key={i} className="flex-1 bg-[#111]" style={{ height: (i * 7) % 5 === 0 ? "100%" : (i * 3) % 4 === 0 ? "55%" : "80%" }} />
                      ))}
                    </div>
                    <p className="text-[9px] text-fg-faint">Thank you for shopping with us!</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="min-w-[300px] max-w-[540px] flex-1 basis-[440px]">
              <p className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-[0.1em] text-primary">Designed for real businesses</p>
              <h2 className="mb-4 text-balance font-display text-[30px] font-bold leading-[1.15] tracking-tight text-fg sm:text-[36px]">
                A Better Checkout Experience for You and Your Customers
              </h2>
              <p className="mb-5 text-[15px] leading-relaxed text-fg-muted">
                A smooth checkout is more than a process — it&apos;s an experience. Fast Sale helps reduce wait times,
                avoid errors and keep your customers coming back.
              </p>
              <div className="mb-8 flex flex-col gap-2.5">
                {CHECKOUT_CHECKLIST.map((item) => (
                  <div key={item} className="flex items-center gap-2.5 text-[13.5px] text-fg">
                    <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[#e3fbf1]">
                      <Check className="h-3 w-3 text-accent" aria-hidden />
                    </span>
                    {item}
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-4 rounded-2xl border border-border bg-white p-4">
                <div className="relative h-16 w-16 flex-none overflow-hidden rounded-xl">
                  <Image
                    src="https://images.unsplash.com/photo-1742836531256-87aa58fd35a9?w=200&q=80&auto=format&fit=crop"
                    alt="Customer paying at a retail checkout"
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                </div>
                <p className="text-[13.5px] leading-snug text-fg-muted">
                  &ldquo;Checkout is so fast now. Our customers love the experience!&rdquo;
                  <span className="mt-1 block text-[12px] font-medium text-fg">— Retail Store Owner</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Business types */}
        <section className="mt-16 px-5 sm:px-7">
          <div className="mx-auto max-w-[1320px]">
            <div className="mb-10 text-center">
              <p className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-[0.1em] text-primary">Built for every industry</p>
              <h2 className="text-balance font-display text-[30px] font-bold leading-[1.15] tracking-tight text-fg sm:text-[36px]">
                Powering Sales for Every Business Type
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {BUSINESS_TYPES.map((type) => (
                <div key={type.title} className="rounded-2xl border border-border bg-white p-4">
                  <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-[#e3fbf1]">
                    <type.icon className="h-[18px] w-[18px] text-accent" aria-hidden />
                  </span>
                  <div className="mb-1 text-[13px] font-semibold text-fg">{type.title}</div>
                  <p className="text-[11.5px] leading-relaxed text-fg-muted">{type.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <EcosystemStrip heading="Works Seamlessly with the Noxtill Ecosystem" items={ECOSYSTEM} />

        {/* Closing CTA */}
        <section className="relative mt-16 overflow-hidden bg-surface-2 px-5 py-4 sm:px-7 sm:py-8">
          <ShoppingCart className="pointer-events-none absolute -right-6 bottom-0 h-40 w-40 text-accent/10 sm:h-52 sm:w-52" aria-hidden strokeWidth={1} />
          <Zap className="pointer-events-none absolute right-24 top-6 h-16 w-16 -rotate-12 text-accent/15 sm:right-40" aria-hidden strokeWidth={1} />

          <div className="relative mx-auto max-w-[1320px]">
            <h2 className="mb-4 max-w-[16ch] text-balance font-display text-[30px] font-bold leading-[1.15] tracking-tight text-fg sm:text-[36px]">
              Faster Checkout. <span className="text-accent">Happier Customers. More Sales.</span>
            </h2>
            <p className="mb-7 max-w-[52ch] text-[15px] leading-relaxed text-fg-muted">
              Noxtill Fast Sale helps you serve more customers in less time with accuracy, speed and a seamless checkout
              experience.
            </p>
            <div className="mb-8 flex flex-wrap gap-3">
              <Link
                href="/book-a-demo"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-6.5 py-3.5 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
              >
                Start Selling Faster <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/book-a-demo"
                className="inline-flex items-center rounded-xl border border-border-strong bg-white px-6 py-3.5 text-[15px] font-medium text-fg transition-colors hover:border-accent hover:text-primary"
              >
                Book a Demo
              </Link>
            </div>
            <div className="flex flex-wrap gap-x-10 gap-y-4">
              {CLOSING_CHECKLIST.map((item) => (
                <div key={item.title} className="max-w-[200px]">
                  <p className="text-[13.5px] font-semibold text-fg">{item.title}</p>
                  <p className="text-[12px] text-fg-muted">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        
      </main>

      <SiteFooter />
    </div>
  );
}

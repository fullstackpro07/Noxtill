import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Check,
  Clock,
  CreditCard,
  FileText,
  Mic,
  PlayCircle,
  ShieldCheck,
  ShoppingCart,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { AI_CAPABILITIES } from "@/lib/marketing/ai-content";

const capability = AI_CAPABILITIES.voiceSales;

export const metadata: Metadata = {
  title: "Voice-Entry Sales — Speak It, Confirm It, Done | Noxtill",
  description: "Say the sale out loud, confirm the details, and Noxtill creates the transaction — no typing every line.",
  alternates: { canonical: "https://noxtill.com/product/voice-sales/" },
  openGraph: {
    type: "website",
    url: "https://noxtill.com/product/voice-sales/",
    title: "Voice-Entry Sales — Speak It, Confirm It, Done | Noxtill",
    description: "Say the sale out loud, confirm the details, and Noxtill creates the transaction — no typing every line.",
  },
  twitter: { card: "summary_large_image", title: "Voice-Entry Sales — Speak It, Confirm It, Done | Noxtill" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://noxtill.com/" },
        { "@type": "ListItem", position: 2, name: "Product", item: "https://noxtill.com/product/" },
        { "@type": "ListItem", position: 3, name: "Voice-Entry Sales", item: "https://noxtill.com/product/voice-sales/" },
      ],
    },
  ],
};

const MINI_BENEFITS = [
  { icon: Zap, label: "Less typing" },
  { icon: Clock, label: "Faster service" },
  { icon: Users, label: "More time for customers" },
];

const WORKFLOW = [
  { icon: Mic, title: "Voice Input", description: "Speak the sale details naturally." },
  { icon: ShoppingCart, title: "Sale Recorded", description: "Transaction created." },
  { icon: Boxes, title: "Inventory Updated", description: "Stock levels adjusted." },
  { icon: UserCheck, title: "Customer History", description: "Purchase record updated." },
  { icon: CreditCard, title: "Payment Processed", description: "Payment method recorded." },
  { icon: BarChart3, title: "Profit Calculated", description: "Margins updated." },
  { icon: FileText, title: "Reporting Updated", description: "Included in business reports." },
];

const USE_CASES = [
  {
    n: "01",
    title: "Quick Sale",
    description: "Describe the essential transaction details and review the structured sale.",
    photo: "1495474472287-4d71bcdd2085",
  },
  {
    n: "02",
    title: "Busy Counter",
    description: "Capture information when stopping to type would interrupt the customer experience.",
    photo: "1521017432531-fbd92d768814",
  },
  {
    n: "03",
    title: "Field Selling",
    description: "Use voice as a natural input method when working away from a traditional checkout screen.",
    photo: "1521737604893-d14cc237f11d",
  },
  {
    n: "04",
    title: "Review Before Save",
    description: "See what Noxtill understood, make corrections and confirm before the record is created.",
    photo: "1556742049-0cfed4f6a45d",
  },
];

const CONTROL_STEPS = [
  { icon: Mic, title: "AI Interprets", description: "Understands your voice." },
  { icon: Check, title: "You Review", description: "Check and edit details." },
  { icon: ShieldCheck, title: "You Confirm", description: "Approve before recording." },
];

export default function VoiceEntrySalesPage() {
  return (
    <div data-theme="light" className="flex min-h-dvh flex-col bg-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden px-5 pb-16 pt-14 sm:px-7 sm:pb-24 sm:pt-16">
          <div className="absolute inset-0 z-0">
            <Image
              src="/marketing/voice entery.jpg"
              alt=""
              fill
              sizes="100vw"
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-[#04120c]/80" />
          </div>

          <div className="relative z-10 mx-auto max-w-[1320px]">
            <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-accent-on-deep">Powered by AI</p>
            <div className="grid grid-cols-1 gap-x-14 gap-y-10 lg:grid-cols-[1fr_0.9fr]">
              <div className="max-w-[46ch]">
                <h1 className="text-balance font-display text-[36px] font-bold leading-[1.1] tracking-tight text-fg-on-deep sm:text-[46px]">
                  Speak the Sale. <span className="text-accent-on-deep">Let Noxtill Structure It.</span>
                </h1>
                <p className="mt-4 max-w-[52ch] text-[14.5px] leading-relaxed text-fg-on-deep-muted">{capability.body}</p>

                <div className="mt-7 flex flex-nowrap items-center gap-2 sm:gap-3">
                  <Link
                    href="/book-a-demo"
                    className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3.5 py-2.5 text-[12.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover sm:gap-2 sm:px-6 sm:py-3.5 sm:text-[15px]"
                  >
                    Try Voice-Entry Sales <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                  </Link>
                  <Link
                    href="#how-it-works"
                    className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-md border border-border-on-deep px-3.5 py-2.5 text-[12.5px] font-medium text-fg-on-deep transition-colors hover:border-fg-on-deep-muted sm:gap-2 sm:px-6 sm:py-3.5 sm:text-[15px]"
                  >
                    See How It Works <PlayCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                  </Link>
                </div>

                <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
                  {MINI_BENEFITS.map((b) => (
                    <div key={b.label} className="flex items-center gap-1.5 text-[12.5px] text-fg-on-deep-muted">
                      <b.icon className="h-3.5 w-3.5 flex-none text-accent-on-deep" aria-hidden />
                      {b.label}
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative">
                <div className="mb-3 ml-auto w-fit max-w-[280px] rounded-md rounded-br-none border border-white/15 bg-white/10 px-4 py-3 text-[12.5px] leading-relaxed text-fg-on-deep backdrop-blur-sm">
                  &ldquo;Add two coffees and one sandwich for Sarah, paid by card.&rdquo;
                </div>

                <div className="ml-auto w-full max-w-[320px] rounded-md border border-border-strong bg-white p-4 shadow-[0_40px_80px_-40px_rgba(0,0,0,0.6)]">
                  <p className="mb-3 flex items-center gap-1.5 text-[12px] font-semibold text-fg">
                    <Mic className="h-3.5 w-3.5 text-accent" aria-hidden /> Create Sale from Voice
                  </p>
                  <div className="mb-2.5 flex items-center justify-between text-[11px]">
                    <span className="text-fg-faint">Customer</span>
                    <span className="font-medium text-fg">Sarah</span>
                  </div>
                  <div className="mb-2.5 flex items-start justify-between text-[11px]">
                    <span className="text-fg-faint">Items</span>
                    <span className="text-right font-medium text-fg">
                      2 × Coffee — $8.00
                      <br />1 × Sandwich — $6.50
                    </span>
                  </div>
                  <div className="mb-2.5 flex items-center justify-between text-[11px]">
                    <span className="text-fg-faint">Payment Method</span>
                    <span className="font-medium text-fg">Card</span>
                  </div>
                  <div className="mb-3 flex items-center justify-between border-t border-border pt-2.5 text-[12.5px]">
                    <span className="font-semibold text-fg">Total</span>
                    <span className="font-bold text-fg">$14.50</span>
                  </div>
                  <span className="flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2.5 text-[12px] font-semibold text-primary-foreground">
                    Review &amp; Confirm <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="px-5 py-8 sm:px-7">
          <div className="mx-auto max-w-[1320px]">
            <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">How it works</p>
            <div className="grid grid-cols-1 gap-x-14 gap-y-10 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <h2 className="mb-3 text-balance font-display text-[26px] font-bold leading-[1.2] tracking-tight text-fg">
                  Speak Naturally. Review Clearly.
                </h2>
                <p className="max-w-[46ch] text-[13.5px] leading-relaxed text-fg-muted">
                  Voice-Entry Sales is designed for moments when speaking is more natural than completing a form. Noxtill
                  interprets supported spoken sales information, organizes it into the appropriate fields, and presents
                  the result for review. The goal is not to remove the person from the transaction, but to make the
                  first step faster.
                </p>
              </div>

              <div className="flex items-center gap-6">
                <div className="min-w-0 flex-1 rounded-md border border-border bg-white p-4 shadow-[0_20px_50px_-35px_rgba(13,21,18,0.3)]">
                  <div className="mb-3 flex items-center gap-2.5">
                    <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#e3fbf1]">
                      <Mic className="h-4 w-4 text-accent" aria-hidden />
                    </span>
                    <p className="text-[12px] leading-snug text-fg">
                      &ldquo;Add two coffees and one sandwich for Sarah, paid by card.&rdquo;
                    </p>
                  </div>
                  <div className="flex h-6 items-end gap-[3px]">
                    {[6, 12, 18, 10, 22, 14, 8, 16, 20, 10, 6, 12, 18, 9, 14].map((h, i) => (
                      <span key={i} className="w-[3px] flex-none rounded-full bg-accent/70" style={{ height: `${h}px` }} />
                    ))}
                  </div>
                </div>

                <div className="hidden min-w-[220px] flex-1 flex-col gap-1.5 sm:flex">
                  {[
                    { icon: Users, label: "Customer", value: "Sarah" },
                    { icon: ShoppingCart, label: "Items", value: "2 × Coffee, 1 × Sandwich" },
                    { icon: CreditCard, label: "Payment", value: "Card" },
                    { icon: BarChart3, label: "Total", value: "$14.50" },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center gap-2 rounded-md border border-border bg-white px-3 py-2">
                      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-[#e3fbf1]">
                        <row.icon className="h-3 w-3 text-accent" aria-hidden />
                      </span>
                      <span className="w-16 flex-none text-[10.5px] text-fg-faint">{row.label}</span>
                      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-fg">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Connected workflow */}
        <section className="bg-surface-deep px-5 py-7 sm:px-7 sm:py-8">
          <div className="mx-auto max-w-[1320px]">
            <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-on-deep">Connected workflow</p>
            <div className="mb-10 grid grid-cols-1 gap-x-14 gap-y-4 lg:grid-cols-[0.8fr_1.2fr]">
              <h2 className="text-balance font-display text-[26px] font-bold leading-[1.2] tracking-tight text-fg-on-deep">
                From Voice to Connected Business Data.
              </h2>
              <p className="max-w-[60ch] text-[13.5px] leading-relaxed text-fg-on-deep-muted">
                The value of voice entry goes beyond reducing typing. Once an approved sale becomes part of Noxtill, the
                relevant transaction can continue through the connected business workflow. Depending on the configured
                business setup, inventory, customer history, payments, reporting, profit calculations and other
                automations can reflect the transaction.
              </p>
            </div>

            <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-8">
              {WORKFLOW.map((s, i) => (
                <div key={s.title} className="flex flex-1 items-start justify-center gap-2">
                  <div className="flex w-[110px] flex-none flex-col items-center gap-3 text-center">
                    <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-accent-on-deep/50 bg-transparent">
                      <s.icon className="h-7 w-7 text-accent-on-deep" aria-hidden />
                    </span>
                    <div>
                      <p className="text-[12.5px] font-semibold text-fg-on-deep">{s.title}</p>
                      <p className="mt-0.5 text-[10.5px] leading-tight text-fg-on-deep-muted">{s.description}</p>
                    </div>
                  </div>
                  {i < WORKFLOW.length - 1 ? <ArrowRight className="mt-7 h-4 w-4 flex-none text-fg-on-deep-faint" aria-hidden /> : null}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Use cases */}
        <section className="px-5 py-8 sm:px-7">
          <div className="mx-auto max-w-[1320px]">
            <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">Use it your way</p>
            <h2 className="mb-8 text-balance font-display text-[26px] font-bold leading-[1.2] tracking-tight text-fg">
              Voice Entry, Built for Real Business Moments.
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {USE_CASES.map((u) => (
                <div key={u.title} className="relative aspect-[3/4] overflow-hidden rounded-md">
                  <Image
                    src={`https://images.unsplash.com/photo-${u.photo}?w=500&q=80&auto=format&fit=crop`}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 22vw, 45vw"
                    className="object-cover"
                  />
                  <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(4,18,12,0.92), rgba(4,18,12,0.15) 55%, transparent 75%)" }} />
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <p className="mb-1 font-display text-[26px] font-bold text-white/25">{u.n}</p>
                    <p className="mb-1 text-[14px] font-semibold text-white">{u.title}</p>
                    <p className="text-[11.5px] leading-relaxed text-white/70">{u.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* AI assists, you stay in control */}
        <section className="bg-surface-deep px-5 py-7 sm:px-7 sm:py-8">
          <div className="mx-auto max-w-[1320px]">
            <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-on-deep">Human control</p>
            <div className="grid grid-cols-1 gap-x-10 gap-y-10 lg:grid-cols-[0.8fr_1fr_0.8fr]">
              <div>
                <h2 className="mb-3 text-balance font-display text-[26px] font-bold leading-[1.2] tracking-tight text-fg-on-deep">
                  AI Assists. You Stay in Control.
                </h2>
                <p className="max-w-[42ch] text-[13px] leading-relaxed text-fg-on-deep-muted">
                  Voice interpretation can sometimes be uncertain when information is incomplete, unclear or spoken
                  differently from how it&apos;s stored in the business system. Noxtill makes the interpreted information
                  visible and editable before an important transaction is finalized. AI makes the entry easier; the
                  authorized person remains responsible for confirming what gets recorded.
                </p>
              </div>

              <div className="rounded-md border border-white/10 bg-white/[0.04] p-5">
                <p className="mb-3 text-[12px] font-semibold text-fg-on-deep">Review Sale Details</p>
                <div className="mb-2.5 flex items-center justify-between text-[11px]">
                  <span className="text-fg-on-deep-faint">Customer</span>
                  <span className="font-medium text-fg-on-deep">Sarah</span>
                </div>
                <div className="mb-2.5 flex items-start justify-between text-[11px]">
                  <span className="text-fg-on-deep-faint">Items</span>
                  <span className="text-right font-medium text-fg-on-deep">
                    2 × Coffee — $8.00
                    <br />1 × Sandwich — $6.50
                  </span>
                </div>
                <div className="mb-3 flex items-center justify-between text-[11px]">
                  <span className="text-fg-on-deep-faint">Payment Method</span>
                  <span className="font-medium text-fg-on-deep">Card</span>
                </div>
                <div className="mb-4 flex items-center justify-between border-t border-white/10 pt-3 text-[12.5px]">
                  <span className="font-semibold text-fg-on-deep">Total</span>
                  <span className="font-bold text-fg-on-deep">$14.50</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-md border border-white/15 px-3 py-1.5 text-[11px] font-medium text-fg-on-deep-muted">Cancel</span>
                  <span className="rounded-md border border-white/15 px-3 py-1.5 text-[11px] font-medium text-fg-on-deep-muted">Edit Details</span>
                  <span className="rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground">Review &amp; Confirm →</span>
                </div>
              </div>

              <div className="flex flex-col gap-5">
                {CONTROL_STEPS.map((s) => (
                  <div key={s.title} className="flex items-start gap-3">
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white/10">
                      <s.icon className="h-4 w-4 text-accent-on-deep" aria-hidden />
                    </span>
                    <div>
                      <p className="text-[13px] font-semibold text-fg-on-deep">{s.title}</p>
                      <p className="text-[11.5px] text-fg-on-deep-muted">{s.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Closing waveform banner */}
        <section className="px-5 py-8 text-center sm:px-7">
          <div className="mx-auto flex max-w-[1320px] items-center justify-center gap-6">
            <div className="hidden h-10 flex-1 items-end justify-end gap-[3px] sm:flex">
              {[8, 14, 20, 12, 26, 16, 10, 22, 14, 8, 18, 12, 24, 10, 16, 20, 8, 14].map((h, i) => (
                <span key={i} className="w-[3px] flex-none rounded-full bg-accent/50" style={{ height: `${h}px` }} />
              ))}
            </div>
            <div className="min-w-[280px] max-w-[640px]">
              <h2 className="mb-2 text-balance font-display text-[22px] font-bold leading-[1.3] tracking-tight text-fg sm:text-[26px]">
                Your voice can start the transaction. You decide what gets recorded.
              </h2>
              <p className="mb-6 text-[13px] leading-relaxed text-fg-muted">
                Use voice to reduce repetitive entry while keeping important business information visible, reviewable
                and connected.
              </p>
              <Link
                href="/book-a-demo"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-[14px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
              >
                Explore Voice-Entry Sales <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            <div className="hidden h-10 flex-1 items-end gap-[3px] sm:flex">
              {[14, 8, 22, 12, 18, 26, 10, 16, 8, 20, 12, 24, 14, 8, 18, 10, 22, 14].map((h, i) => (
                <span key={i} className="w-[3px] flex-none rounded-full bg-accent/50" style={{ height: `${h}px` }} />
              ))}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

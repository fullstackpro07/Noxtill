import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Ban,
  Coins,
  Eye,
  Lock,
  PlayCircle,
  Send,
  Settings2,
  ShieldCheck,
  Star,
  User,
} from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { AI_PROMISE } from "@/lib/marketing/ai-content";

export const metadata: Metadata = {
  title: "What Our AI Never Does — Trust & Transparency | Noxtill",
  description: "No invented numbers, honest uncertainty, and human approval before anything sensitive happens.",
  alternates: { canonical: "https://noxtill.com/product/ai-promise/" },
  openGraph: {
    type: "website",
    url: "https://noxtill.com/product/ai-promise/",
    title: "What Our AI Never Does — Trust & Transparency | Noxtill",
    description: "No invented numbers, honest uncertainty, and human approval before anything sensitive happens.",
  },
  twitter: { card: "summary_large_image", title: "What Our AI Never Does — Trust & Transparency | Noxtill" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://noxtill.com/" },
        { "@type": "ListItem", position: 2, name: "Product", item: "https://noxtill.com/product/" },
        { "@type": "ListItem", position: 3, name: "What Our AI Never Does", item: "https://noxtill.com/product/ai-promise/" },
      ],
    },
  ],
};

const MINI_BADGES = [
  { icon: ShieldCheck, label: "Your data, your control" },
  { icon: Lock, label: "Privacy by design" },
  { icon: ShieldCheck, label: "Responsible AI, real value" },
];

const NEVER_LIST = [
  { icon: BarChart3, text: "Never guesses or makes up numbers." },
  { icon: Settings2, text: "Never takes business-critical actions without your approval." },
  { icon: Coins, text: "Never shares your data with third parties without permission." },
  { icon: Send, text: "Never sends messages or campaigns without your consent." },
  { icon: User, text: "Never makes decisions that you can't review or control." },
];

const PRINCIPLE_CARDS = [
  { icon: Eye, title: "Transparent", description: "You always know what the AI is doing and why." },
  { icon: User, title: "Human Control", description: "You stay in charge of important decisions." },
  { icon: Lock, title: "Data Privacy", description: "Your business data stays secure and is never misused." },
  { icon: Star, title: "Focused on Value", description: "Our AI works to create real, practical benefits for your business." },
];

const CONCERNS = [
  { icon: BarChart3, question: "“Will it invent fake data?”", answer: "Never. It only uses your real business data." },
  { icon: Settings2, question: "“Will it take actions on its own?”", answer: "No. Business-critical actions always need your approval." },
  { icon: Coins, question: "“Will my data be shared?”", answer: "No. Your data is private and never shared without your permission." },
  { icon: User, question: "“Will it replace my team?”", answer: "No. It's designed to support your team, not replace them." },
];

export default function AiPromisePage() {
  return (
    <div data-theme="light" className="flex min-h-dvh flex-col bg-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative px-5 pb-8 pt-10 sm:px-7 sm:pb-10 sm:pt-10">
          <div className="mx-auto max-w-[1320px]">
            <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">Trusted. Transparent. Built for you.</p>
            <div className="grid grid-cols-1 gap-x-14 gap-y-10 lg:grid-cols-[0.8fr_0.7fr_0.9fr]">
              <div className="max-w-[42ch]">
                <h1 className="text-balance font-display text-[36px] font-bold leading-[1.1] tracking-tight text-fg sm:text-[46px]">
                  What Our AI <span className="text-accent">Never Does.</span>
                </h1>
                <p className="mt-4 max-w-[46ch] text-[14px] leading-relaxed text-fg-muted">
                  Powerful AI should make your business easier, not create new risks. Here&apos;s what Noxtill&apos;s AI
                  will never do — because your trust, data and control always come first.
                </p>

                <div className="mt-7 flex flex-nowrap items-center gap-2 sm:gap-3">
                  <Link
                    href="#principles"
                    className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3.5 py-2.5 text-[12.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover sm:gap-2 sm:px-6 sm:py-3.5 sm:text-[15px]"
                  >
                    See How It Works <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                  </Link>
                  <Link href="#principles" className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap text-[12.5px] font-medium text-fg">
                    <PlayCircle className="h-4 w-4 flex-none text-accent" aria-hidden /> Watch Our AI Principles <span className="text-fg-faint">(1 min)</span>
                  </Link>
                </div>

                <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
                  {MINI_BADGES.map((b) => (
                    <div key={b.label} className="flex items-center gap-1.5 text-[12px] text-fg-muted">
                      <b.icon className="h-3.5 w-3.5 flex-none text-accent" aria-hidden />
                      {b.label}
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative mx-auto flex items-center justify-center">
                <div className="absolute -top-6 left-1/2 z-10 hidden w-[160px] -translate-x-[85%] -rotate-6 text-center font-serif text-[14px] italic leading-snug text-accent sm:block">
                  AI that works for you. Not against you.
                </div>
                <div className="relative h-[300px] w-[220px] flex-none">
                  <Image src="/marketing/image-Photoroom.png" alt="Noxtill AI mascot holding a shield that reads Your Business, Our Commitment" fill sizes="220px" className="object-contain" priority />
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                {NEVER_LIST.map((n) => (
                  <div key={n.text} className="flex items-center gap-3 rounded-md bg-rose-50/70 p-3">
                    <span className="relative flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white">
                      <n.icon className="h-4 w-4 text-fg" aria-hidden />
                      <Ban className="absolute inset-0 h-9 w-9 text-rose-500" aria-hidden strokeWidth={1.75} />
                    </span>
                    <p className="text-[12.5px] leading-snug text-fg">{n.text}</p>
                  </div>
                ))}
                <p className="mt-1 rotate-[-2deg] text-right font-serif text-[15px] italic leading-snug text-rose-500">
                  Your trust
                  <br />
                  comes first.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Principles */}
        <section id="principles" className="bg-surface-deep px-5 py-7 sm:px-7 sm:py-8">
          <div className="mx-auto max-w-[1320px]">
            <div className="grid grid-cols-1 gap-x-14 gap-y-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
              <div>
                <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-on-deep">Built on principles</p>
                <h2 className="mb-3 text-balance font-display text-[26px] font-bold leading-[1.2] tracking-tight text-fg-on-deep">
                  Responsible AI for Real Businesses.
                </h2>
                <p className="mb-6 max-w-[46ch] text-[13px] leading-relaxed text-fg-on-deep-muted">{AI_PROMISE.body}</p>
                <Link href="/book-a-demo" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground hover:bg-primary-hover">
                  Our AI Principles <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {PRINCIPLE_CARDS.map((c) => (
                  <div key={c.title} className="rounded-md bg-white/[0.06] p-4">
                    <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-accent">
                      <c.icon className="h-5 w-5 text-white" aria-hidden />
                    </span>
                    <p className="mb-1 text-[14px] font-semibold text-fg-on-deep">{c.title}</p>
                    <p className="text-[12px] leading-relaxed text-fg-on-deep-muted">{c.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* We hear you */}
        <section className="relative px-5 py-8 sm:px-7">
          <p className="absolute left-5 top-8 hidden -rotate-2 text-left font-serif text-[17px] italic leading-snug text-accent sm:left-7 lg:block">
            Smarter AI.
            <br />
            Safer business.
            <br />A better you.
          </p>

          <div className="mx-auto max-w-[1320px]">
            <div className="mb-10 text-center">
              <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">Common concerns</p>
              <h2 className="mb-2 text-balance font-display text-[26px] font-bold leading-[1.2] tracking-tight text-fg">We Hear You.</h2>
              <p className="mx-auto max-w-[60ch] text-[13.5px] leading-relaxed text-fg-muted">
                Here are some common concerns business owners have about AI — and how Noxtill is different.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {CONCERNS.map((c) => (
                <div key={c.question} className="rounded-md border border-border bg-white p-5 text-center">
                  <span className="relative mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50">
                    <c.icon className="h-5 w-5 text-fg" aria-hidden />
                    <Ban className="absolute inset-0 h-12 w-12 text-rose-500" aria-hidden strokeWidth={1.75} />
                  </span>
                  <p className="mb-3 text-[14px] font-semibold text-fg">{c.question}</p>
                  <p className="rounded-md bg-[#e3fbf1] p-2.5 text-[12px] leading-relaxed text-fg-muted">{c.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Closing */}
        <section className="relative overflow-hidden px-5 py-8 sm:px-7 sm:py-10">
          <div className="absolute inset-0 z-0">
            <Image
              src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1600&q=80&auto=format&fit=crop"
              alt=""
              fill
              sizes="100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-white/10" />
          </div>

          <div className="relative z-10 mx-auto max-w-[1320px]">
            <div className="max-w-[460px] rounded-md bg-white p-6 shadow-[0_30px_70px_-30px_rgba(0,0,0,0.4)]">
              <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">A partner you can trust</p>
              <h2 className="mb-3 text-balance font-display text-[26px] font-bold leading-[1.2] tracking-tight text-fg">Same Goals. A Brighter Future.</h2>
              <p className="mb-5 text-[13.5px] leading-relaxed text-fg-muted">
                Noxtill&apos;s AI is built with one goal — to help you run a stronger, more successful business, with
                complete transparency and control.
              </p>
              <Link
                href="/book-a-demo"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-[14px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
              >
                Get Started with Noxtill <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>

            <p className="mt-8 hidden max-w-[220px] rotate-[3deg] text-right font-serif text-[15px] italic leading-snug text-white drop-shadow sm:block">
              Powerful AI. With boundaries. Just the way it should be.
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

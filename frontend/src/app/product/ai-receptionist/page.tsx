import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  Brain,
  Calendar,
  Camera,
  Check,
  Home,
  Mic,
  PhoneCall,
  PhoneOff,
  Scissors,
  Settings,
  Shirt,
  Stethoscope,
  TrendingUp,
  UtensilsCrossed,
  Volume2,
  Zap,
} from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";

export const metadata: Metadata = {
  title: "AI Phone Receptionist — Never Miss a Call | Noxtill",
  description: "Answers calls, understands intent, gives approved information, captures leads and books appointments.",
  alternates: { canonical: "https://noxtill.com/product/ai-receptionist/" },
  openGraph: {
    type: "website",
    url: "https://noxtill.com/product/ai-receptionist/",
    title: "AI Phone Receptionist — Never Miss a Call | Noxtill",
    description: "Answers calls, understands intent, gives approved information, captures leads and books appointments.",
  },
  twitter: { card: "summary_large_image", title: "AI Phone Receptionist — Never Miss a Call | Noxtill" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://noxtill.com/" },
        { "@type": "ListItem", position: 2, name: "Product", item: "https://noxtill.com/product/" },
        { "@type": "ListItem", position: 3, name: "AI Phone Receptionist", item: "https://noxtill.com/product/ai-receptionist/" },
      ],
    },
  ],
};

const MINI_BENEFITS = [
  { icon: PhoneCall, label: "Never miss a call" },
  { icon: Volume2, label: "Professional & natural" },
  { icon: Zap, label: "Works 24/7" },
];

const CALLER_BUBBLES_LEFT = [
  { icon: PhoneCall, text: "Hi, thanks for calling! How can I help you today?" },
  { icon: Calendar, text: "I'd like to book an appointment." },
  { icon: Camera, text: "Sure! I have availability tomorrow at 10 AM or 2 PM. Which works better for you?" },
];

const CALLER_BUBBLES_RIGHT = [
  { icon: Settings, text: "What are your opening hours?" },
  { icon: Calendar, text: "We're open Monday to Saturday, 9 AM to 7 PM." },
  { icon: PhoneCall, text: "Do you offer refunds?" },
  { icon: Camera, text: "Yes, we do! I can also send you our policy via text message." },
];

const HOW_IT_WORKS = [
  { icon: PhoneCall, title: "1. Forward Your Number", description: "Send your business number to Noxtill." },
  { icon: Settings, title: "2. Set Your Preferences", description: "Tell us your hours, services and key information." },
  { icon: Brain, title: "3. AI Handles the Calls", description: "Answers, books, provides info and captures leads." },
  { icon: TrendingUp, title: "4. See the Results", description: "More customers, more bookings, more growth." },
];

const CONFIDENCE_CHECKLIST = [
  "Answer common questions",
  "Provide business information",
  "Book and manage appointments",
  "Transfer calls when needed",
  "Capture new leads",
  "Speak naturally, in multiple languages",
];

const RESULT_STATS = [
  { icon: PhoneCall, value: "60%", label: "More answered calls" },
  { icon: Calendar, value: "40%", label: "More bookings" },
  { icon: TrendingUp, value: "3x", label: "More customer inquiries" },
];

const INDUSTRIES = [
  { icon: Scissors, label: "Salons & Barbershops", photo: "1521590832167-7bcbfaa6381f" },
  { icon: Stethoscope, label: "Clinics & Healthcare", photo: "1519494026892-80bbd2d6fd0d" },
  { icon: UtensilsCrossed, label: "Restaurants & Cafés", photo: "1414235077428-338989a2e8c0" },
  { icon: Shirt, label: "Retail Stores", photo: "1445205170230-053b83016050" },
  { icon: Home, label: "Home Services", photo: "1581578731548-c64695cc6952" },
  { icon: Boxes, label: "E-commerce", photo: "1607082348824-0a96f2a4b9da" },
];

export default function AiPhoneReceptionistPage() {
  return (
    <div data-theme="light" className="flex min-h-dvh flex-col bg-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden px-5 pb-16 pt-8 sm:px-7 sm:pb-20 sm:pt-10">
          <div className="absolute inset-0 z-0">
            <Image
              src="https://images.unsplash.com/photo-1587614382346-4ec70e388b28?w=1600&q=80&auto=format&fit=crop"
              alt=""
              fill
              sizes="100vw"
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-[#04120c]/85" />
          </div>

          <div className="relative z-10 mx-auto max-w-[1320px]">
            <span className="mb-4 inline-flex items-center rounded-full bg-white/10 px-3.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-accent-on-deep">
              AI Phone Receptionist
            </span>

            <div className="grid grid-cols-1 gap-x-10 gap-y-12 lg:grid-cols-[0.85fr_1.3fr]">
              <div className="max-w-[46ch]">
                <h1 className="text-balance font-display text-[36px] font-bold leading-[1.1] tracking-tight text-fg-on-deep sm:text-[46px]">
                  Your Always-On <span className="text-accent-on-deep">Team Member.</span>
                </h1>
                <p className="mt-2 text-[18px] font-semibold text-fg-on-deep">Answers. Books. Helps. 24/7.</p>
                <p className="mt-4 max-w-[52ch] text-[14.5px] leading-relaxed text-fg-on-deep-muted">
                  Noxtill&apos;s AI Phone Receptionist handles your calls like a real team member — answering questions,
                  booking appointments, providing information and capturing leads, day or night.
                </p>

                <div className="mt-7 flex flex-nowrap items-center gap-2 sm:gap-3">
                  <Link
                    href="/book-a-demo"
                    className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3.5 py-2.5 text-[12.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover sm:gap-2 sm:px-6 sm:py-3.5 sm:text-[15px]"
                  >
                    Get Started <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                  </Link>
                  <Link
                    href="#how-it-works"
                    className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-md border border-border-on-deep px-3.5 py-2.5 text-[12.5px] font-medium text-fg-on-deep transition-colors hover:border-fg-on-deep-muted sm:gap-2 sm:px-6 sm:py-3.5 sm:text-[15px]"
                  >
                    Hear a Sample Call <Volume2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
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

              <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
                <div className="order-2 flex flex-col gap-3 sm:order-1">
                  {CALLER_BUBBLES_LEFT.map((c, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-md border border-white/15 bg-white/10 px-3 py-2.5 text-[12px] leading-snug text-fg-on-deep backdrop-blur-sm">
                      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-accent">
                        <c.icon className="h-3 w-3 text-white" aria-hidden />
                      </span>
                      {c.text}
                    </div>
                  ))}
                </div>

                <div className="relative order-1 mx-auto w-[210px] flex-none rounded-[32px] border-[6px] border-[#1a1a1a] bg-[#0a0a0a] p-2 shadow-[0_50px_100px_-40px_rgba(0,0,0,0.8)] sm:order-2">
                  <span className="absolute left-1/2 top-2 z-10 h-3.5 w-16 -translate-x-1/2 rounded-full bg-[#1a1a1a]" aria-hidden />
                  <div className="overflow-hidden rounded-[24px] bg-gradient-to-b from-[#0d2b21] to-[#04120c] p-4 pt-8 text-center">
                    <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
                      <span className="font-display text-[16px] font-bold text-accent-on-deep">
                        <img src="/brand/noxtill-logo1.png" alt="Noxtill Logo" className="h-6 w-6" />
                      </span>
                    </div>
                    <p className="mb-0.5 text-[13px] font-semibold text-fg-on-deep">Noxtill AI</p>
                    <p className="mb-5 text-[10px] text-fg-on-deep-faint">Speaking with customer…</p>
                    <div className="mb-5 flex h-8 items-end justify-center gap-[3px]">
                      {[6, 12, 18, 10, 22, 14, 8, 16, 20, 10, 6, 14].map((h, i) => (
                        <span key={i} className="w-[3px] flex-none rounded-full bg-accent-on-deep/80" style={{ height: `${h}px` }} />
                      ))}
                    </div>
                    <div className="mb-4 flex items-center justify-center gap-4">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
                        <Mic className="h-4 w-4 text-fg-on-deep" aria-hidden />
                      </span>
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-red-500">
                        <PhoneOff className="h-4.5 w-4.5 text-white" aria-hidden />
                      </span>
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
                        <Volume2 className="h-4 w-4 text-fg-on-deep" aria-hidden />
                      </span>
                    </div>
                    <p className="text-[10px] text-fg-on-deep-faint">00:24</p>
                  </div>
                </div>

                <div className="order-3 flex flex-col gap-3">
                  {CALLER_BUBBLES_RIGHT.map((c, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-md border border-white/15 bg-white/10 px-3 py-2.5 text-[12px] leading-snug text-fg-on-deep backdrop-blur-sm">
                      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-white/15">
                        <c.icon className="h-3 w-3 text-fg-on-deep" aria-hidden />
                      </span>
                      {c.text}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="px-5 py-8 sm:px-7">
          <div className="mx-auto max-w-[1320px]">
            <div className="grid grid-cols-1 gap-x-10 gap-y-10 lg:grid-cols-[1.6fr_1fr]">
              <div>
                <p className="mb-2 text-center font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-primary lg:text-left">How it works</p>
                <h2 className="mb-2 text-balance text-center font-display text-[28px] font-bold leading-[1.2] tracking-tight text-fg lg:text-left">
                  Simple. Smart. Powerful.
                </h2>
                <p className="mb-10 text-center text-[13.5px] leading-relaxed text-fg-muted lg:text-left">
                  Set it up once and let Noxtill handle your calls — just like your best receptionist.
                </p>

                <div className="relative grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-4">
                  <div className="absolute left-[12%] right-[12%] top-[26px] hidden border-t border-dashed border-border-strong sm:block" aria-hidden />
                  {HOW_IT_WORKS.map((s) => (
                    <div key={s.title} className="relative flex flex-col items-center text-center">
                      <span className="relative z-10 mb-3 flex h-14 w-14 items-center justify-center rounded-full border-4 border-bg bg-[#e3fbf1]">
                        <s.icon className="h-6 w-6 text-accent" aria-hidden />
                      </span>
                      <p className="mb-1 text-[13px] font-semibold text-fg">{s.title}</p>
                      <p className="max-w-[140px] text-[11px] leading-relaxed text-fg-muted">{s.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center rounded-md bg-[#e3fbf1] p-6">
                <div>
                  <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-primary">
                    <Zap className="h-4 w-4 text-white" aria-hidden />
                  </span>
                  <p className="mb-5 text-[17px] font-semibold leading-snug text-fg">Set up in minutes. Works for you forever.</p>
                  <Link href="/book-a-demo" className="inline-flex items-center gap-1.5 rounded-md bg-[#04120c] px-4 py-2.5 text-[12.5px] font-semibold text-white hover:bg-black">
                    Start Now <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Handle every call */}
        <section className="bg-surface-deep px-5 py-7 sm:px-7 sm:py-8">
          <div className="mx-auto max-w-[1320px]">
            <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-on-deep">Built for real businesses</p>
            <div className="grid grid-cols-1 gap-x-10 gap-y-10 lg:grid-cols-[1fr_0.8fr_0.7fr]">
              <div>
                <h2 className="mb-3 text-balance font-display text-[26px] font-bold leading-[1.2] tracking-tight text-fg-on-deep">
                  Handle Every Call with Confidence.
                </h2>
                <p className="mb-6 max-w-[46ch] text-[13px] leading-relaxed text-fg-on-deep-muted">
                  Whether you run a salon, clinic, restaurant, retail store or service business, Noxtill&apos;s AI Phone
                  Receptionist adapts to your needs and gives every caller a helpful, professional experience.
                </p>
                <div className="mb-6 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
                  {CONFIDENCE_CHECKLIST.map((item) => (
                    <div key={item} className="flex items-center gap-2.5 text-[13px] text-fg-on-deep">
                      <span className="flex h-4.5 w-4.5 flex-none items-center justify-center rounded-full bg-accent">
                        <Check className="h-2.5 w-2.5 text-white" aria-hidden />
                      </span>
                      {item}
                    </div>
                  ))}
                </div>
                <Link href="/book-a-demo" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground hover:bg-primary-hover">
                  See It in Action <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </div>

              <div className="relative aspect-[4/5] overflow-hidden rounded-md">
                <Image
                  src="https://images.unsplash.com/photo-1573496527892-904f897eb744?w=500&q=80&auto=format&fit=crop"
                  alt="Business owner smiling on the phone"
                  fill
                  sizes="(min-width: 1024px) 24vw, 45vw"
                  className="object-cover"
                />
                <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(4,18,12,0.9), transparent 55%)" }} />
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <p className="mb-2 text-[13px] italic leading-snug text-white">&ldquo;It&apos;s like having a receptionist who never sleeps.&rdquo;</p>
                  <p className="text-[10.5px] text-white/70">— Real Business Owner</p>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {RESULT_STATS.map((s) => (
                  <div key={s.label} className="flex items-center gap-3 rounded-md border border-white/10 bg-white/[0.04] p-4">
                    <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-accent">
                      <s.icon className="h-5 w-5 text-white" aria-hidden />
                    </span>
                    <div>
                      <p className="font-display text-[22px] font-bold text-fg-on-deep">{s.value}</p>
                      <p className="text-[11.5px] text-fg-on-deep-muted">{s.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Industries */}
        <section className="px-5 py-8 sm:px-7">
          <div className="mx-auto max-w-[1320px]">
            <p className="mb-2 text-center font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">Perfect for many industries</p>
            <h2 className="mb-2 text-center text-balance font-display text-[26px] font-bold leading-[1.2] tracking-tight text-fg">Works the Way You Work.</h2>
            <p className="mx-auto mb-8 max-w-[60ch] text-center text-[13.5px] leading-relaxed text-fg-muted">
              From appointments to inquiries, Noxtill&apos;s AI Phone Receptionist fits right into your business.
            </p>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {INDUSTRIES.map((ind) => (
                <div key={ind.label} className="group relative aspect-[4/5] overflow-hidden rounded-md">
                  <Image
                    src={`https://images.unsplash.com/photo-${ind.photo}?w=300&q=80&auto=format&fit=crop`}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 16vw, 45vw"
                    className="object-cover"
                  />
                  <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(4,18,12,0.85), transparent 60%)" }} />
                  <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 p-2.5">
                    <ind.icon className="h-3.5 w-3.5 flex-none text-white" aria-hidden />
                    <p className="text-[11px] font-medium leading-tight text-white">{ind.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Closing */}
        <section className="relative overflow-hidden bg-surface-2 px-5 py-7 sm:px-7 sm:py-8">
          <div className="relative mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-8">
            <div className="min-w-[280px] flex-1 basis-[420px]">
              <h2 className="mb-2 text-balance font-display text-[26px] font-bold leading-[1.2] tracking-tight text-fg sm:text-[30px]">
                Let Your Phone Work Harder for Your Business.
              </h2>
              <p className="max-w-[50ch] text-[13.5px] leading-relaxed text-fg-muted">More answered calls. More opportunities. More growth.</p>
            </div>
            <Link
              href="/book-a-demo"
              className="inline-flex flex-none items-center gap-2 rounded-md bg-primary px-6 py-3.5 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              Get Your AI Receptionist <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

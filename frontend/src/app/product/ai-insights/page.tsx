import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Boxes,
  Calendar,
  CheckCircle2,
  Lightbulb,
  Megaphone,
  Play,
  Search,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  User,
  Wallet,
} from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { AI_CAPABILITIES } from "@/lib/marketing/ai-content";

const capability = AI_CAPABILITIES.insights;

export const metadata: Metadata = {
  title: "AI Insights — What Changed and What to Do Next | Noxtill",
  description: "What changed in the business, why it changed, and what is worth doing about it.",
  alternates: { canonical: "https://noxtill.com/product/ai-insights/" },
  openGraph: {
    type: "website",
    url: "https://noxtill.com/product/ai-insights/",
    title: "AI Insights — What Changed and What to Do Next | Noxtill",
    description: "What changed in the business, why it changed, and what is worth doing about it.",
  },
  twitter: { card: "summary_large_image", title: "AI Insights — What Changed and What to Do Next | Noxtill" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://noxtill.com/" },
        { "@type": "ListItem", position: 2, name: "Product", item: "https://noxtill.com/product/" },
        { "@type": "ListItem", position: 3, name: "AI Insights", item: "https://noxtill.com/product/ai-insights/" },
      ],
    },
  ],
};

const MINI_BENEFITS = ["Real business data", "Actionable insights", "Easy to understand"];

const SIDEBAR = [
  { icon: BarChart3, label: "Dashboard" },
  { icon: TrendingUp, label: "Sales" },
  { icon: User, label: "Customers" },
  { icon: Calendar, label: "Bookings" },
  { icon: Boxes, label: "Inventory" },
  { icon: Wallet, label: "Credit" },
  { icon: BarChart3, label: "Reports" },
  { icon: Sparkles, label: "AI Insights", active: true },
  { icon: Megaphone, label: "Marketing" },
  { icon: Search, label: "Settings" },
];

const STAT_TILES = [
  { label: "Sales", value: "$12,480", delta: "↑ 18%" },
  { label: "Profit", value: "$4,320", delta: "↑ 24%" },
  { label: "New Customers", value: "86", delta: "↑ 14%" },
  { label: "Bookings", value: "24", delta: "" },
];

const TOP_PRODUCTS = [
  { name: "Cappuccino", value: 100 },
  { name: "Haircut", value: 82 },
  { name: "Facial Kit", value: 60 },
  { name: "Shampoo", value: 45 },
  { name: "Beard Oil", value: 32 },
];

const SCOPE_ITEMS = [
  { icon: TrendingUp, title: "Sales", description: "Spot trends and growth", tint: "bg-[#e3fbf1]", color: "text-accent" },
  { icon: User, title: "Customers", description: "Understand behavior and find opportunities", tint: "bg-[#e3fbf1]", color: "text-accent" },
  { icon: Calendar, title: "Bookings", description: "See demand and optimize slots", tint: "bg-violet-50", color: "text-violet-600" },
  { icon: Boxes, title: "Inventory", description: "Identify low stock and top performers", tint: "bg-[#e3fbf1]", color: "text-accent" },
  { icon: Wallet, title: "Credit", description: "Track outstanding balances", tint: "bg-blue-50", color: "text-blue-600" },
  { icon: BarChart3, title: "Profit", description: "Understand margins and improve profitability", tint: "bg-[#e3fbf1]", color: "text-accent" },
  { icon: Megaphone, title: "Marketing", description: "Measure campaign impact", tint: "bg-rose-50", color: "text-rose-600" },
];

const DIRECTION_CHECKLIST = ["Identify trends and opportunities", "Get proactive recommendations", "Spot issues before they grow", "Save time on manual analysis"];

const DIRECTION_CARDS = [
  { icon: TrendingUp, title: "Spot Growth", description: "Find what's working", tint: "bg-[#e3fbf1]", color: "text-accent" },
  { icon: Lightbulb, title: "Discover Opportunities", description: "Find new ways to grow", tint: "bg-amber-50", color: "text-amber-600" },
  { icon: AlertTriangle, title: "Reduce Risks", description: "Get early warnings", tint: "bg-rose-50", color: "text-rose-600" },
  { icon: Target, title: "Make Better Decisions", description: "Turn data into action", tint: "bg-[#e3fbf1]", color: "text-accent" },
];

const QUICK_QUESTIONS = [
  "Why did sales increase this month?",
  "Which products are most profitable?",
  "Which customers have outstanding credit?",
  "What are my busiest days?",
  "How is my inventory performing?",
  "What's my profit margin this month?",
];

export default function AiInsightsPage() {
  return (
    <div data-theme="light" className="flex min-h-dvh flex-col bg-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden px-5 pb-16 pt-10 sm:px-7 sm:pb-20 sm:pt-10">
          <div className="absolute inset-0 z-0">
            <Image
              src="https://images.unsplash.com/photo-1497366216548-37526070297c?w=1600&q=80&auto=format&fit=crop"
              alt=""
              fill
              sizes="100vw"
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-white/82" />
          </div>

          <div className="relative z-10 mx-auto max-w-[1320px]">
            <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">AI Insights</p>
            <div className="grid grid-cols-1 gap-x-14 gap-y-10 lg:grid-cols-[0.85fr_1.15fr]">
              <div className="max-w-[46ch]">
                <h1 className="text-balance font-display text-[36px] font-bold leading-[1.1] tracking-tight text-fg sm:text-[46px]">
                  Turn Your Business Data into <span className="text-accent">Clear Decisions.</span>
                </h1>
                <p className="mt-4 max-w-[52ch] text-[14.5px] leading-relaxed text-fg-muted">{capability.body}</p>

                <div className="mt-7 flex flex-nowrap items-center gap-2 sm:gap-3">
                  <Link
                    href="/book-a-demo"
                    className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3.5 py-2.5 text-[12.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover sm:gap-2 sm:px-6 sm:py-3.5 sm:text-[15px]"
                  >
                    Explore AI Insights <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                  </Link>
                  <Link
                    href="#complete-view"
                    className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-md border border-border-strong px-3.5 py-2.5 text-[12.5px] font-medium text-fg transition-colors hover:border-accent hover:text-primary sm:gap-2 sm:px-6 sm:py-3.5 sm:text-[15px]"
                  >
                    See It in 60 Seconds <Play className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                  </Link>
                </div>

                <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
                  {MINI_BENEFITS.map((b) => (
                    <div key={b} className="flex items-center gap-1.5 text-[12.5px] text-fg-muted">
                      <CheckCircle2 className="h-3.5 w-3.5 flex-none text-accent" aria-hidden />
                      {b}
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative mx-auto w-full max-w-[560px]">
                <div className="rounded-t-md border border-b-0 border-border-strong bg-[#1a1a1a] p-2">
                  <div className="flex overflow-hidden rounded-[6px] bg-white">
                    <div className="hidden w-[120px] flex-none bg-surface-2 p-2.5 md:block">
                      <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold text-fg">
                        <span className="flex h-4 w-4 items-center justify-center rounded-md bg-primary text-white">N</span> Noxtill
                      </p>
                      <div className="flex flex-col gap-0.5">
                        {SIDEBAR.map((s) => (
                          <span
                            key={s.label}
                            className={`flex items-center gap-1.5 truncate rounded-md px-1.5 py-1 text-[9px] ${s.active ? "bg-white font-medium text-fg shadow-sm" : "text-fg-muted"}`}
                          >
                            <s.icon className="h-2.5 w-2.5 flex-none" aria-hidden /> {s.label}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex-1 p-3">
                      <div className="mb-2.5 flex items-center justify-between">
                        <p className="text-[12px] font-semibold text-fg">AI Insights</p>
                        <span className="text-[9px] text-fg-faint">Last 30 days ⌄</span>
                      </div>
                      <p className="mb-2 text-[9px] text-fg-faint">Key insights from your business data</p>

                      <div className="mb-2.5 grid grid-cols-4 gap-1.5">
                        {STAT_TILES.map((s) => (
                          <div key={s.label} className="rounded-md border border-border p-1.5">
                            <p className="text-[8px] text-fg-faint">{s.label}</p>
                            <p className="font-display text-[12px] font-bold text-fg">{s.value}</p>
                            {s.delta ? <p className="text-[7.5px] text-accent">{s.delta}</p> : null}
                          </div>
                        ))}
                      </div>

                      <div className="mb-2.5 grid grid-cols-[1.3fr_1fr] gap-2">
                        <div className="rounded-md border border-border p-2">
                          <p className="mb-1 text-[9px] font-semibold text-fg">Sales Trend</p>
                          <svg viewBox="0 0 200 60" className="w-full" preserveAspectRatio="none" aria-hidden>
                            <path d="M0,45 L33,38 L66,42 L100,28 L133,20 L166,10 L200,6" fill="none" stroke="#0ea86a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <div className="flex justify-between text-[6.5px] text-fg-faint">
                            <span>Jan</span>
                            <span>Feb</span>
                            <span>Mar</span>
                            <span>Apr</span>
                            <span>May</span>
                            <span>Jun</span>
                          </div>
                        </div>
                        <div className="rounded-md border border-border p-2">
                          <p className="mb-1.5 text-[9px] font-semibold text-fg">Top Products</p>
                          <div className="flex flex-col gap-1">
                            {TOP_PRODUCTS.map((p) => (
                              <div key={p.name} className="flex items-center gap-1">
                                <span className="w-9 flex-none truncate text-[7px] text-fg-muted">{p.name}</span>
                                <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
                                  <div className="h-full rounded-full bg-accent" style={{ width: `${p.value}%` }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-start gap-1.5 rounded-md bg-[#e3fbf1] p-2">
                        <Lightbulb className="mt-0.5 h-3 w-3 flex-none text-accent" aria-hidden />
                        <div>
                          <p className="text-[8.5px] font-semibold text-fg">AI Insight</p>
                          <p className="text-[7.5px] leading-relaxed text-fg-muted">
                            Your sales are 18% higher than last month. Cappuccino is your top product and weekend
                            bookings are increasing.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mx-auto h-2.5 w-full rounded-b-[10px] bg-[#1a1a1a]" />
                <div className="mx-auto h-1 w-[70%] rounded-b-md bg-[#0a0a0a]" />
              </div>
            </div>
          </div>
        </section>

        {/* Complete view */}
        <section id="complete-view" className="bg-surface-2 px-5 py-7 sm:px-7 sm:py-8">
          <div className="mx-auto max-w-[1320px] text-center">
            <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">Insights for every area</p>
            <h2 className="mb-2 text-balance font-display text-[26px] font-bold leading-[1.2] tracking-tight text-fg">A Complete View of Your Business.</h2>
            <p className="mx-auto mb-8 max-w-[64ch] text-[13.5px] leading-relaxed text-fg-muted">
              Noxtill AI Insights connects all your business data to help you see what&apos;s working, what needs
              attention, and where the next opportunity is — across every key area of your business.
            </p>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {SCOPE_ITEMS.map((s) => (
                <div key={s.title} className={`rounded-md p-4 text-center ${s.tint}`}>
                  <span className="mx-auto mb-2 flex h-8 w-8 items-center justify-center">
                    <s.icon className={`h-5 w-5 ${s.color}`} aria-hidden />
                  </span>
                  <p className="mb-0.5 text-[13px] font-semibold text-fg">{s.title}</p>
                  <p className="text-[10.5px] leading-tight text-fg-muted">{s.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Move you forward */}
        <section className="bg-surface-deep px-5 py-7 sm:px-7 sm:py-8">
          <div className="mx-auto max-w-[1320px]">
            <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-on-deep">From data to direction</p>
            <div className="grid grid-cols-1 gap-x-10 gap-y-10 lg:grid-cols-[0.8fr_0.7fr_0.5fr_0.8fr]">
              <div>
                <h2 className="mb-3 text-balance font-display text-[26px] font-bold leading-[1.2] tracking-tight text-fg-on-deep">
                  Insights That Move You Forward.
                </h2>
                <p className="mb-6 max-w-[42ch] text-[13px] leading-relaxed text-fg-on-deep-muted">
                  Get clear answers, spot opportunities, and make faster decisions with AI-powered insights — built on
                  your real business data.
                </p>
                <div className="mb-6 flex flex-col gap-2.5">
                  {DIRECTION_CHECKLIST.map((item) => (
                    <div key={item} className="flex items-center gap-2.5 text-[13px] text-fg-on-deep">
                      <CheckCircle2 className="h-4 w-4 flex-none text-accent-on-deep" aria-hidden />
                      {item}
                    </div>
                  ))}
                </div>
                <Link href="/book-a-demo" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground hover:bg-primary-hover">
                  Explore AI Insights <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </div>

              <div className="relative mx-auto w-[190px] flex-none rounded-[28px] border-[5px] border-[#1a1a1a] bg-[#0a0a0a] p-1.5 shadow-[0_40px_80px_-35px_rgba(0,0,0,0.7)]">
                <span className="absolute left-1/2 top-2 z-10 h-2.5 w-14 -translate-x-1/2 rounded-full bg-[#1a1a1a]" aria-hidden />
                <div className="overflow-hidden rounded-[22px] bg-[#0d2b21] p-3 pt-6 pb-30">
                  <div className="mb-2 flex items-center justify-between text-[7px] text-fg-on-deep-faint">
                    <span>9:41</span>
                    <span>●●●</span>
                  </div>
                  <div className="rounded-md bg-white p-2.5">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="flex items-center gap-1 text-[9px] font-semibold text-fg">
                        <span className="flex h-4 w-4 items-center justify-center rounded-md bg-primary text-white">N</span> Noxtill AI
                      </span>
                      <span className="text-[7px] text-fg-faint">now</span>
                    </div>
                    <p className="mb-1 flex items-center gap-1 text-[8px] font-semibold text-fg">
                      <TrendingUp className="h-2.5 w-2.5 text-accent" aria-hidden /> Insight for you
                    </p>
                    <p className="mb-2 text-[7.5px] leading-relaxed text-fg-muted">
                      Your weekend bookings are up 32% compared to last month. Consider running a targeted promotion to
                      convert more bookings into product sales.
                    </p>
                    <span className="block rounded-md bg-primary px-2 py-1.5 text-center text-[7.5px] font-semibold text-primary-foreground">View Details</span>
                  </div>
                </div>
              </div>

              <div className="hidden items-center justify-center sm:flex">
                <p className="rotate-[-4deg] text-center font-serif text-[17px] italic leading-snug text-accent-on-deep">
                  Your data has a story.
                  <br />
                  We help you see it.
                </p>
              </div>

              <div className="flex flex-col justify-center gap-3">
                {DIRECTION_CARDS.map((c) => (
                  <div key={c.title} className="flex items-center gap-3 rounded-md bg-white p-3.5 shadow-[0_10px_25px_-15px_rgba(0,0,0,0.3)]">
                    <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-full ${c.tint}`}>
                      <c.icon className={`h-4 w-4 ${c.color}`} aria-hidden />
                    </span>
                    <div>
                      <p className="text-[13px] font-semibold text-fg">{c.title}</p>
                      <p className="text-[11px] text-fg-muted">{c.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Ask anything */}
        <section className="px-5 py-8 sm:px-7">
          <div className="mx-auto max-w-[1320px]">
            <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">Real questions. Real answers.</p>
                <h2 className="mb-2 text-balance font-display text-[24px] font-bold leading-[1.2] tracking-tight text-fg">
                  Ask Anything About Your Business.
                </h2>
                <p className="mb-6 max-w-[60ch] text-[13.5px] leading-relaxed text-fg-muted">
                  Get instant answers to your business questions — no complex reports, no manual analysis.
                </p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_QUESTIONS.map((q) => (
                    <span key={q} className="flex items-center gap-1.5 rounded-full border border-border-strong bg-white px-3.5 py-1.5 text-[12px] text-fg-muted">
                      <Search className="h-3 w-3 flex-none text-fg-faint" aria-hidden /> {q}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-md border border-border bg-white p-5">
                <p className="mb-3 text-[13px] italic leading-relaxed text-fg">
                  &ldquo;AI Insights saves me hours every week. I get clear answers and can focus on growing my business
                  instead of digging through reports.&rdquo;
                </p>
                <div className="mb-2 flex items-center gap-2.5">
                  <div className="relative h-9 w-9 flex-none overflow-hidden rounded-full">
                    <Image
                      src="https://images.unsplash.com/photo-1705579607707-717fb965145f?w=100&q=80&auto=format&fit=crop"
                      alt="Ahmed R., Business Owner"
                      fill
                      sizes="36px"
                      className="object-cover"
                    />
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold text-fg">Ahmed R.</p>
                    <p className="text-[10.5px] text-fg-faint">Business Owner</p>
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Closing */}
        <section className="relative overflow-hidden px-5 py-8 text-center sm:px-7 sm:py-10">
          <div className="absolute inset-0 z-0">
            <Image
              src="https://images.unsplash.com/photo-1497366216548-37526070297c?w=1600&q=80&auto=format&fit=crop"
              alt=""
              fill
              sizes="100vw"
              className="object-cover"
              style={{ filter: "blur(3px)" }}
            />
            <div className="absolute inset-0 bg-white/80" />
          </div>

          <div className="relative z-10 mx-auto max-w-[720px]">
            <h2 className="mb-2 text-balance font-display text-[26px] font-bold leading-[1.25] tracking-tight text-fg sm:text-[30px]">
              Turn Your Business Data into a Brighter Future.
            </h2>
            <p className="mb-7 max-w-[54ch] mx-auto text-[13.5px] leading-relaxed text-fg-muted">
              See what&apos;s happening, find new opportunities and make smarter decisions with Noxtill AI Insights.
            </p>
            <Link
              href="/book-a-demo"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3.5 text-[14px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              Get Started Today <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

          <div className="pointer-events-none absolute bottom-6 right-6 z-10 hidden w-[150px] rotate-[6deg] rounded-md bg-[#f6efdc] p-3 shadow-[0_20px_45px_-20px_rgba(0,0,0,0.35)] sm:block">
            <div className="absolute -left-1.5 top-3 flex flex-col gap-2.5">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="h-2 w-2 rounded-full border border-[#c9c3ab] bg-white" />
              ))}
            </div>
            <div className="flex flex-col gap-1.5 pl-2 text-left text-[11px] leading-tight text-[#3a3020]">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 flex-none text-accent" aria-hidden /> Better insights
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 flex-none text-accent" aria-hidden /> Smarter decisions
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 flex-none text-accent" aria-hidden /> A stronger business
              </span>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

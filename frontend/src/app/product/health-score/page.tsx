import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUp,
  BarChart3,
  Boxes,
  CalendarClock,
  Check,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  Database,
  DollarSign,
  HeartPulse,
  Megaphone,
  PieChart,
  PlayCircle,
  Quote,
  Search,
  Settings2,
  Shield,
  ShoppingCart,
  Target,
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

const page = findProductDetailPage("health-score")!;

export const metadata: Metadata = {
  title: page.metaTitle,
  description: page.metaDescription,
  alternates: { canonical: "https://noxtill.com/product/health-score/" },
  openGraph: {
    type: "website",
    url: "https://noxtill.com/product/health-score/",
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
        { "@type": "ListItem", position: 3, name: "Business Health Score", item: "https://noxtill.com/product/health-score/" },
      ],
    },
    {
      "@type": "Article",
      headline: page.metaTitle,
      description: page.metaDescription,
      url: "https://noxtill.com/product/health-score/",
    },
  ],
};

const CATEGORY_SCORES = [
  { icon: ShoppingCart, label: "Sales Performance", score: 84, color: "#10b981", status: "Good" },
  { icon: PieChart, label: "Profitability", score: 78, color: "#8b5cf6", status: "Good" },
  { icon: DollarSign, label: "Cash Flow", score: 85, color: "#3b82f6", status: "Very Good" },
  { icon: Users, label: "Customer Health", score: 81, color: "#f59e0b", status: "Good" },
  { icon: Settings2, label: "Operations Efficiency", score: 80, color: "#14b8a6", status: "Good" },
  { icon: TrendingUp, label: "Growth & Momentum", score: 79, color: "#ec4899", status: "Good" },
];

function Ring({ score, color, size = 76 }: { score: number; color: string; size?: number }) {
  const bg = `conic-gradient(${color} ${score * 3.6}deg, #e6eae8 ${score * 3.6}deg)`;
  const inner = size - 12;
  return (
    <div className="relative flex-none" style={{ height: size, width: size, background: bg, borderRadius: "9999px" }}>
      <div
        className="absolute rounded-full bg-white text-center"
        style={{ inset: (size - inner) / 2, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}
      >
        <span className="font-display text-[18px] font-bold text-fg">{score}</span>
        <span className="text-[8px] text-fg-faint">/100</span>
      </div>
    </div>
  );
}

const SIGNALS = [
  { icon: ShoppingCart, tint: "bg-[#e3fbf1]", color: "text-accent", title: "Sales", description: "Revenue trends, order volume, average order value and more." },
  { icon: PieChart, tint: "bg-violet-50", color: "text-violet-600", title: "Profitability", description: "Gross profit, margins, expenses and overall profit performance." },
  { icon: DollarSign, tint: "bg-blue-50", color: "text-blue-600", title: "Cash Flow", description: "Money in, money out, working capital and liquidity position." },
  { icon: Users, tint: "bg-orange-50", color: "text-orange-600", title: "Customers", description: "Retention, repeat purchases, spending behavior and feedback." },
  { icon: Settings2, tint: "bg-slate-100", color: "text-slate-600", title: "Operations", description: "Fulfillment, inventory movement, returns and efficiency." },
  { icon: TrendingUp, tint: "bg-rose-50", color: "text-rose-600", title: "Growth", description: "New customers, new products, expansion and market reach." },
];

const RISK_INDICATORS = ["Declining profit margins", "Slow moving inventory", "Increasing outstanding credit", "Falling customer retention", "High return or refund rate", "Low conversion or order volume"];

const DIAGNOSE_STEPS = [
  { icon: Database, title: "Collect Data" },
  { icon: Search, title: "Analyze & Compare" },
  { icon: HeartPulse, title: "Health Score", big: true },
  { icon: Target, title: "Identify Root Causes" },
  { icon: ClipboardCheck, title: "Recommend Actions" },
];

const ACTION_PLAN = [
  { icon: Users, title: "Reduce outstanding credit by following up with 18 overdue customers.", description: "This will improve your cash flow and reduce risk.", impact: "High Impact" },
  { icon: Boxes, title: "Replenish low stock items to avoid 6 products going out of stock.", description: "This will help you maintain sales and customer satisfaction.", impact: "High Impact" },
  { icon: DollarSign, title: "Improve profit margins by reviewing pricing of 12 low-margin products.", description: "Small changes can significantly increase your overall profit.", impact: "Medium Impact" },
  { icon: Megaphone, title: "Run a win-back campaign for inactive customers.", description: "Re-engage previous customers and increase repeat sales.", impact: "Medium Impact" },
  { icon: ClipboardList, title: "Optimize high return categories to reduce refund rate.", description: "Review product quality, descriptions and customer expectations.", impact: "Low Impact" },
];

const IMPACT_STYLES: Record<string, string> = {
  "High Impact": "bg-emerald-50 text-emerald-700",
  "Medium Impact": "bg-amber-50 text-amber-700",
  "Low Impact": "bg-blue-50 text-blue-700",
};

const TREND_MONTHS = ["Dec '24", "Jan '25", "Feb '25", "Mar '25", "Apr '25", "May '25"];
const TREND_VALUES = [64, 68, 71, 75, 78, 82];

const TREND_AXIS = [100, 75, 50, 25, 0];

function TrendChart() {
  const max = 100;
  const min = 0;
  const w = 500;
  const h = 140;
  const rightMargin = 70;
  const points = TREND_VALUES.map((v, i) => {
    const x = (i / (TREND_VALUES.length - 1)) * w;
    const y = h - ((v - min) / (max - min)) * h;
    return { x, y, v };
  });
  const line = points.map((p) => `${p.x},${p.y}`).join(" ");
  const area = `0,${h} ${line} ${w},${h}`;
  const last = points[points.length - 1];
  return (
    <div className="flex gap-2">
      <div className="flex h-[150px] flex-none flex-col justify-between py-[5px] text-right text-[10px] text-fg-faint">
        {TREND_AXIS.map((v) => (
          <span key={v}>{v}</span>
        ))}
      </div>
      <svg viewBox={`0 0 ${w + rightMargin} ${h + 30}`} className="h-[150px] w-full flex-1" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="healthTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0ea86a" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#0ea86a" stopOpacity="0" />
          </linearGradient>
        </defs>
        {TREND_AXIS.map((v) => {
          const y = h - ((v - min) / (max - min)) * h;
          return <line key={v} x1="0" y1={y} x2={w} y2={y} stroke="#e6eae8" strokeWidth={1} />;
        })}
        <polygon points={area} fill="url(#healthTrendFill)" />
        <polyline points={line} fill="none" stroke="#0ea86a" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={i === points.length - 1 ? 4 : 3} fill="#0ea86a" />
            {i < points.length - 1 ? (
              <text x={p.x} y={p.y - 12} fontSize="10" fontWeight="bold" fill="var(--color-fg)" textAnchor="middle">
                {p.v}
              </text>
            ) : null}
          </g>
        ))}
        {last ? (
          <g>
            <rect x={last.x + 12} y={last.y - 15} width="46" height="30" rx="5" fill="white" stroke="#e6eae8" />
            <text x={last.x + 35} y={last.y - 2} fontSize="11" fontWeight="bold" fill="var(--color-fg)" textAnchor="middle">
              82
            </text>
            <text x={last.x + 35} y={last.y + 10} fontSize="7" fill="var(--color-fg-faint)" textAnchor="middle">
              May '25
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}

const TREND_CHECKLIST = ["Daily score updates", "Historical trends & comparisons", "See what's improving and what's not", "Make data-driven decisions with confidence"];

const INDUSTRIES = [
  { icon: ShoppingCart, label: "Retail", tint: "bg-blue-50", color: "text-blue-600" },
  { icon: Boxes, label: "E-commerce", tint: "bg-orange-50", color: "text-orange-600" },
  { icon: Users, label: "Services", tint: "bg-[#e3fbf1]", color: "text-accent" },
  { icon: HeartPulse, label: "Healthcare", tint: "bg-sky-50", color: "text-sky-600" },
  { icon: CalendarClock, label: "Hospitality", tint: "bg-violet-50", color: "text-violet-600" },
  { icon: Settings2, label: "Manufacturing", tint: "bg-teal-50", color: "text-teal-600" },
];

const ECOSYSTEM = [
  { icon: Zap, label: "Fast Sale" },
  { icon: ShoppingCart, label: "Orders" },
  { icon: CalendarClock, label: "Bookings" },
  { icon: Users, label: "Customers" },
  { icon: Boxes, label: "Inventory" },
  { icon: CreditCard, label: "Customer Credit" },
  { icon: Wallet, label: "Payments" },
  { icon: BarChart3, label: "Reports & Analytics" },
];

export default function HealthScorePage() {
  return (
    <div data-theme="light" className="flex min-h-dvh flex-col bg-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />

      <main className="flex-1">
        

        {/* Hero */}
        <section className="px-5 pb-8 pt-8 sm:px-7 sm:pb-10">
          <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-14 gap-y-12">
            <div className="min-w-[280px] max-w-[420px] flex-1 basis-[380px]">
              <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">Business Health Score</p>
              <h1 className="text-balance font-display text-[36px] font-bold leading-[1.12] tracking-tight text-fg sm:text-[44px]">
                Know the Health of Your Business. <span className="text-accent">Grow with Confidence.</span>
              </h1>
              <p className="mt-4 max-w-[46ch] text-[14.5px] leading-relaxed text-fg-muted">{page.subhead}</p>

              <div className="mt-7 flex flex-nowrap items-center gap-2 sm:gap-3">
                <Link
                  href="/book-a-demo"
                  className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3.5 py-2.5 text-[12.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover sm:gap-2 sm:px-6 sm:py-3.5 sm:text-[15px]"
                >
                  Check Your Business Health <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                </Link>
                <Link
                  href="#diagnose"
                  className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-md border border-border-strong px-3.5 py-2.5 text-[12.5px] font-medium text-fg transition-colors hover:border-accent hover:text-primary sm:gap-2 sm:px-6 sm:py-3.5 sm:text-[15px]"
                >
                  See How It Works <PlayCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                </Link>
              </div>
            </div>

            <div className="flex min-w-[280px] flex-1 basis-[380px] flex-col items-center">
              <div className="relative h-[165px] w-[330px]">
                <svg viewBox="0 0 200 110" className="absolute inset-0 h-full w-full" aria-hidden>
                  <defs>
                    <linearGradient id="healthGaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#ef4444" />
                      <stop offset="35%" stopColor="#f59e0b" />
                      <stop offset="65%" stopColor="#eab308" />
                      <stop offset="100%" stopColor="#10b981" />
                    </linearGradient>
                  </defs>
                  <path d="M 10 100 A 90 90 0 0 1 190 100" fill="none" stroke="url(#healthGaugeGrad)" strokeWidth="16" strokeLinecap="round" />
                </svg>
                <div className="absolute inset-x-0 bottom-0 flex flex-col items-center text-center">
                  <HeartPulse className="mb-1 h-8 w-8 text-accent" aria-hidden />
                  <p className="font-display text-[46px] font-bold leading-none text-fg">
                    82<span className="text-[18px] font-normal text-fg-faint">/100</span>
                  </p>
                  <p className="mt-1.5 text-[14px] font-semibold text-accent">Very Healthy</p>
                </div>
              </div>

              <p className="mt-3 text-[13px] text-fg-muted">Your business is in great shape.</p>
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#e3fbf1] px-3 py-1 text-[12px] font-medium text-accent">
                <ArrowUp className="h-3 w-3" aria-hidden /> 8 pts vs last month
              </span>
            </div>

            <div className="min-w-[240px] flex-1 basis-[280px]">
              <div className="flex flex-col gap-3">
                {CATEGORY_SCORES.map((c) => (
                  <div key={c.label} className="flex items-center justify-between gap-2 text-[12.5px]">
                    <span className="flex items-center gap-2 text-fg-muted">
                      <c.icon className="h-3.5 w-3.5 flex-none" style={{ color: c.color }} aria-hidden />
                      {c.label}
                    </span>
                    <span className="flex items-center gap-1 font-semibold text-fg">
                      {c.score}/100 <ArrowUp className="h-3 w-3 text-accent" aria-hidden />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Every business has signals */}
        <section className="bg-surface-2 px-5 py-7 sm:px-7 sm:py-8">
          <div className="mx-auto flex max-w-[1320px] flex-wrap items-start gap-x-14 gap-y-10">
            <div className="min-w-[240px] max-w-[280px] flex-1">
              <h2 className="mb-3 text-balance font-display text-[24px] font-bold leading-[1.15] tracking-tight text-fg">Every Business Has Signals.</h2>
              <p className="text-[13.5px] leading-relaxed text-fg-muted">
                Behind every number is a story. Noxtill collects and connects the key signals from across your
                business to understand the complete picture.
              </p>
            </div>

            <div className="grid min-w-[320px] flex-[2] grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
              {SIGNALS.map((s) => (
                <div key={s.title} className="flex flex-col items-center text-center">
                  <span className={`mb-3 flex h-11 w-11 items-center justify-center rounded-full ${s.tint}`}>
                    <s.icon className={`h-5 w-5 ${s.color}`} aria-hidden />
                  </span>
                  <div className="mb-1 text-[13px] font-semibold text-fg">{s.title}</div>
                  <p className="text-[10.5px] leading-relaxed text-fg-muted">{s.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Symptoms + diagnose */}
        <section id="diagnose" className="px-5 py-8 sm:px-7">
          <div className="mx-auto grid max-w-[1320px] grid-cols-1 gap-5 lg:grid-cols-2">
            <div
              className="rounded-md border border-red-100 p-6"
              style={{ background: "linear-gradient(135deg, #fef2f2 0%, #fdf7f2 100%)" }}
            >
              <div className="flex flex-wrap items-center gap-x-8 gap-y-6">
                <div className="min-w-[220px] flex-1 basis-[260px]">
                  <h2 className="mb-2 text-balance font-display text-[20px] font-bold leading-[1.2] tracking-tight text-fg">
                    Find the Symptoms Before They Become Problems.
                  </h2>
                  <p className="mb-4 text-[12.5px] leading-relaxed text-fg-muted">
                    Early warning signs help you take action before small issues turn into big losses.
                  </p>
                  <div className="mb-5 flex flex-col gap-2">
                    {RISK_INDICATORS.map((r) => (
                      <div key={r} className="flex items-center gap-2 text-[12px] text-fg">
                        <AlertTriangle className="h-3.5 w-3.5 flex-none text-red-500" aria-hidden />
                        {r}
                      </div>
                    ))}
                  </div>
                  <Link
                    href="/book-a-demo"
                    className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-4 py-2.5 text-[12.5px] font-medium text-red-600 hover:bg-red-50"
                  >
                    View All Risk Indicators <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </div>

                <div className="relative min-w-[200px] flex-1 basis-[220px] self-stretch overflow-hidden rounded-md">
                  <Image
                    src="https://images.unsplash.com/photo-1705579607707-717fb965145f?w=700&q=80&auto=format&fit=crop"
                    alt="Business owner reviewing a concerning report"
                    fill
                    sizes="(min-width: 1024px) 22vw, 90vw"
                    className="object-cover"
                  />
                  <div className="absolute bottom-3 left-3 right-3 rounded-md border border-border-strong bg-white p-3 shadow-lg">
                    <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-red-600">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> High Risk
                    </div>
                    <p className="text-[10.5px] leading-snug text-fg-muted">Outstanding credit is 28% higher than industry average.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-border bg-white p-6">
              <h2 className="mb-2 text-balance font-display text-[22px] font-bold leading-[1.2] tracking-tight text-fg">How We Diagnose Your Business</h2>
              <p className="mb-8 text-[13px] leading-relaxed text-fg-muted">
                Noxtill connects the dots between different areas of your business to find the real reasons behind
                every signal.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-2">
                {DIAGNOSE_STEPS.map((s, i) => (
                  <div key={s.title} className="flex items-center">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <span
                        className={`flex items-center justify-center rounded-full border-2 ${
                          s.big ? "h-16 w-16 border-accent bg-[#e3fbf1]" : "h-11 w-11 border-border bg-surface-2"
                        }`}
                      >
                        <s.icon className={s.big ? "h-7 w-7 text-accent" : "h-4 w-4 text-fg-muted"} aria-hidden />
                      </span>
                      <span className={`max-w-[80px] text-[10.5px] leading-tight ${s.big ? "font-semibold text-fg" : "text-fg-muted"}`}>{s.title}</span>
                    </div>
                    {i < DIAGNOSE_STEPS.length - 1 ? <ArrowRight className="mx-1.5 h-4 w-4 flex-none text-fg-faint" aria-hidden /> : null}
                  </div>
                ))}
              </div>

              <p className="mt-8 text-center text-[13px] font-medium text-accent">One score. Complete clarity.</p>
            </div>
          </div>
        </section>

        {/* What's healthy */}
        <section className="px-5 pb-8 sm:px-7">
          <div
            className="mx-auto max-w-[1320px] rounded-md border border-border p-6 shadow-[0_20px_50px_-35px_rgba(13,21,18,0.25)] sm:p-8"
            style={{ background: "linear-gradient(135deg, #f4f8ff 0%, #f7faf8 100%)" }}
          >
            <div className="flex flex-wrap items-center gap-x-10 gap-y-8">
              <div className="min-w-[220px] max-w-[260px] flex-none">
                <h2 className="mb-2 text-balance font-display text-[22px] font-bold leading-[1.2] tracking-tight text-fg">
                  What&apos;s Healthy. What Needs Attention.
                </h2>
                <p className="mb-4 text-[13px] leading-relaxed text-fg-muted">A simple breakdown that helps you focus on what truly matters right now.</p>
                <Link
                  href="/book-a-demo"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-primary-foreground hover:bg-primary-hover"
                >
                  View Detailed Report <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </div>

              <div className="grid min-w-[280px] flex-1 grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {CATEGORY_SCORES.map((c) => (
                  <div key={c.label} className="flex flex-col items-center rounded-md border border-border bg-white p-4 text-center">
                    <p className="mb-3 text-[11.5px] font-medium text-fg-muted">{c.label}</p>
                    <Ring score={c.score} color={c.color} />
                    <p className="mt-3 text-[11.5px] font-semibold" style={{ color: c.color }}>
                      {c.status}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[11.5px] text-fg-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Healthy (80–100)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-500" /> Needs Attention (60–79)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-red-500" /> Critical (0–59)
              </span>
            </div>
          </div>
        </section>

        {/* Action plan */}
        <section className="px-5 pb-8 sm:px-7">
          <div className="mx-auto flex max-w-[1320px] flex-wrap gap-x-10 gap-y-8">
            <div className="min-w-[220px] max-w-[260px] flex-1">
              <h2 className="mb-3 text-balance font-display text-[22px] font-bold leading-[1.2] tracking-tight text-fg">Your Personalized Action Plan</h2>
              <p className="mb-6 text-[13px] leading-relaxed text-fg-muted">We don&apos;t just show you the score, we tell you what to do next.</p>
              <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#e3fbf1]">
                <ClipboardCheck className="h-9 w-9 text-accent" aria-hidden />
              </span>
            </div>

            <div className="min-w-[280px] flex-[2] rounded-md border border-border bg-white">
              {ACTION_PLAN.map((a, i) => (
                <div
                  key={a.title}
                  className={`flex flex-wrap items-center gap-3 p-4 ${i < ACTION_PLAN.length - 1 ? "border-b border-border" : ""}`}
                >
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#e3fbf1]">
                    <a.icon className="h-4 w-4 text-accent" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-fg">{a.title}</p>
                    <p className="text-[11.5px] text-fg-muted">{a.description}</p>
                  </div>
                  <span className={`flex-none rounded-full px-2.5 py-1 text-[10.5px] font-medium ${IMPACT_STYLES[a.impact]}`}>{a.impact}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Trend */}
        <section className="px-5 pb-8 sm:px-7">
          <div
            className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-14 gap-y-8 rounded-md border border-border p-6 shadow-[0_20px_50px_-35px_rgba(13,21,18,0.25)] sm:p-8"
            style={{ background: "linear-gradient(135deg, #f4f8ff 0%, #f7faf8 100%)" }}
          >
            <div className="min-w-[240px] max-w-[320px] flex-1">
              <h2 className="mb-3 text-balance font-display text-[22px] font-bold leading-[1.2] tracking-tight text-fg">
                Your Business Changes. Your Health Score Changes With It.
              </h2>
              <p className="mb-4 text-[13px] leading-relaxed text-fg-muted">
                Track your progress over time and see the impact of every action you take.
              </p>
              <div className="flex flex-col gap-2">
                {TREND_CHECKLIST.map((item) => (
                  <div key={item} className="flex items-center gap-2.5 text-[12.5px] text-fg">
                    <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[#e3fbf1]">
                      <Check className="h-3 w-3 text-accent" aria-hidden />
                    </span>
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="min-w-[300px] flex-[1.6]">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[14px] font-semibold text-fg">Health Score Trend</p>
                <span className="rounded-md border border-border px-2.5 py-1 text-[10.5px] text-fg-muted">Last 6 Months ⌄</span>
              </div>
              <TrendChart />
              <div className="mt-1 flex justify-between pl-[34px] text-[10px] text-fg-faint">
                {TREND_MONTHS.map((m) => (
                  <span key={m}>{m}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Every industry */}
        <section className="px-5 pb-8 sm:px-7">
          <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-14 gap-y-8">
            <div className="min-w-[220px] max-w-[260px] flex-1">
              <h2 className="mb-2 text-balance font-display text-[20px] font-bold leading-[1.2] tracking-tight text-fg">
                Every Business. Every Industry. One Health Check That Works.
              </h2>
              <p className="text-[12.5px] leading-relaxed text-fg-muted">Noxtill&apos;s Business Health Score is designed for businesses of all sizes and industries.</p>
            </div>

            <div className="flex min-w-0 flex-1 flex-nowrap justify-center gap-3 overflow-x-auto sm:gap-5">
              {INDUSTRIES.map((ind) => (
                <div key={ind.label} className="flex flex-none flex-col items-center gap-2 text-center">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-full sm:h-11 sm:w-11 ${ind.tint}`}>
                    <ind.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${ind.color}`} aria-hidden />
                  </span>
                  <span className="whitespace-nowrap text-[10px] text-fg-muted sm:text-[11px]">{ind.label}</span>
                </div>
              ))}
              <div className="flex flex-none flex-col items-center gap-2 text-center">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-fg-muted sm:h-11 sm:w-11">···</span>
                <span className="whitespace-nowrap text-[10px] text-fg-muted sm:text-[11px]">And More</span>
              </div>
            </div>

            <div className="relative min-w-[260px] max-w-[320px] flex-1 rounded-md border border-border bg-white p-5">
              <Quote className="absolute left-3 top-3 h-6 w-6 text-border-strong" aria-hidden />
              <Quote className="absolute bottom-8 right-3 h-4 w-4 rotate-180 text-border-strong" aria-hidden />
              <p className="relative mb-3 mt-2 text-[13px] italic leading-relaxed text-fg-muted">
                &ldquo;Noxtill showed us what we were missing. We fixed a few key areas and our business health
                improved dramatically.&rdquo;
              </p>
              <div className="mb-3 flex items-center gap-2.5">
                <div className="relative h-9 w-9 flex-none overflow-hidden rounded-full">
                  <Image
                    src="https://images.unsplash.com/photo-1573496527892-904f897eb744?w=120&q=80&auto=format&fit=crop"
                    alt="Sarah Khan, CEO of StyleHub"
                    fill
                    sizes="36px"
                    className="object-cover"
                  />
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-fg">Sarah Khan</p>
                  <p className="text-[10.5px] text-fg-faint">CEO, StyleHub</p>
                </div>
              </div>
              <div className="flex justify-end gap-1.5">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === 0 ? "bg-accent" : "bg-border-strong"}`} />
                ))}
              </div>
            </div>
          </div>
        </section>

        <EcosystemStrip heading="Everything Connected. Everything Matters." items={ECOSYSTEM} />

        {/* Closing CTA */}
        <section className="relative mt-10 overflow-hidden bg-surface-deep px-5 py-7 sm:px-7 sm:py-8">
          <div className="relative mx-auto flex max-w-[1320px] flex-wrap items-center gap-6">
            <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-white/10">
              <Shield className="h-6 w-6 text-accent-on-deep" aria-hidden />
            </span>
            <h2 className="min-w-[240px] flex-1 text-balance font-display text-[19px] font-bold leading-[1.3] text-fg-on-deep">
              Build a Healthier Business. Take the Right Steps. <span className="text-accent-on-deep">Grow with Confidence.</span>
            </h2>
            <div className="flex flex-none flex-wrap gap-3">
              <Link
                href="/book-a-demo"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3.5 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
              >
                Check Your Business Health <ArrowRight className="h-4 w-4" aria-hidden />
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

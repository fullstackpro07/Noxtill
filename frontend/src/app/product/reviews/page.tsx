import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Heart,
  MapPin,
  MessageCircle,
  MessageSquareText,
  MonitorSmartphone,
  PlayCircle,
  Quote,
  Send,
  Shield,
  ShieldCheck,
  Smile,
  Sparkles,
  Star,
  TrendingUp,
  Users,
} from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { DetailRelated } from "@/components/site/detail-page-sections";
import { findProductDetailPage } from "@/lib/marketing/product-detail-content";

const page = findProductDetailPage("reviews")!;

export const metadata: Metadata = {
  title: page.metaTitle,
  description: page.metaDescription,
  alternates: { canonical: "https://noxtill.com/product/reviews/" },
  openGraph: {
    type: "website",
    url: "https://noxtill.com/product/reviews/",
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
        { "@type": "ListItem", position: 3, name: "Reviews & Reputation", item: "https://noxtill.com/product/reviews/" },
      ],
    },
    {
      "@type": "Article",
      headline: page.metaTitle,
      description: page.metaDescription,
      url: "https://noxtill.com/product/reviews/",
    },
  ],
};

function Stars({ rating = 5, size = "h-3 w-3" }: { rating?: number; size?: string }) {
  return (
    <span className="relative inline-flex items-center gap-0.5">
      <span className="inline-flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} className={`${size} text-border-strong`} aria-hidden />
        ))}
      </span>
      <span className="absolute inset-0 flex items-center gap-0.5 overflow-hidden" style={{ width: `${Math.max(0, Math.min(100, (rating / 5) * 100))}%` }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} className={`${size} flex-none fill-amber-400 text-amber-400`} aria-hidden />
        ))}
      </span>
    </span>
  );
}

function FacebookIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" />
    </svg>
  );
}

const PLATFORM_ROW = [
  { logo: "/brand/google.png", label: "Google Business Profile" },
  { facebook: true, label: "Facebook" },
  { logo: "/brand/trustpilot-star.png", label: "Trustpilot" },
  { logo: "/brand/yelp.png", label: "Yelp" },
  {logo: "/brand/sitejabber.png", label: "Sitejabber" },
  { logo: "/brand/tripadvisor.png", label: "Tripadvisor" },
  { icon: MonitorSmartphone, color: "text-fg-muted", bg: "bg-surface-2", label: "And More" },
];

const FEATURE_CARDS = [
  { icon: MessageSquareText, tint: "bg-violet-50", color: "text-violet-600", title: "Collect More Reviews", description: "Automate review requests via WhatsApp, SMS, Email or QR codes at the perfect time." },
  { icon: MonitorSmartphone, tint: "bg-blue-50", color: "text-blue-600", title: "Monitor Everywhere", description: "Track and manage reviews from multiple platforms in real-time with instant alerts." },
  { icon: Smile, tint: "bg-amber-50", color: "text-amber-600", title: "Respond Smarter", description: "Reply to reviews faster with AI suggestions and keep your customers happy." },
  { icon: TrendingUp, tint: "bg-[#e3fbf1]", color: "text-accent", title: "Analyze Sentiment", description: "Understand customer sentiment and identify what matters most to your customers." },
  { icon: Sparkles, tint: "bg-rose-50", color: "text-rose-600", title: "Turn Feedback into Growth", description: "Use insights to improve, showcase your best reviews and win more new customers." },
  { icon: Shield, tint: "bg-violet-50", color: "text-violet-600", title: "Protect Your Brand", description: "Identify and resolve negative feedback early before it impacts your reputation." },
];

const LIVE_FEED = [
  { name: "Sarah Johnson", stars: 5, time: "2 min ago", text: "Amazing service and excellent support. Highly recommend!", tag: "New", tagColor: "bg-emerald-50 text-emerald-700", platform: "google", avatar: "photo-1758876019338-c190822f6ca0" },
  { name: "Mike Smith", stars: 4, time: "15 min ago", text: "Great experience overall. The team was very helpful.", tag: "New", tagColor: "bg-emerald-50 text-emerald-700", platform: "meta", avatar: "photo-1557425747-929b65a39785" },
  { name: "Emily Davis", stars: 2, time: "1 hour ago", text: "The product is good but delivery took longer than expected.", tag: "Needs Attention", tagColor: "bg-amber-50 text-amber-700", platform: "trustpilot", avatar: "photo-1573496527892-904f897eb744" },
  { name: "David Brown", stars: 5, time: "2 hours ago", text: "Professional, fast and reliable. Will definitely come back!", tag: "New", tagColor: "bg-emerald-50 text-emerald-700", platform: "google", avatar: "photo-1705579607707-717fb965145f" },
];

const RESULT_STATS = [
  { icon: Star, value: "4.8", label: "Average Rating", delta: "↑ 0.6 vs last 30 days", color: "text-violet-600" },
  { icon: Users, value: "1,274", label: "Total Reviews", delta: "↑ 18.4% vs last 30 days", color: "text-violet-600" },
  { icon: TrendingUp, value: "612", label: "New Reviews", delta: "↑ 21.7% vs last 30 days", color: "text-accent" },
  { icon: Heart, value: "92%", label: "Positive Reviews", delta: "↑ 8.3% vs last 30 days", color: "text-rose-600" },
];

const BUILD_STEPS = [
  { icon: Send, title: "Request", description: "Automatically send review requests at the right time and place.", color: "text-violet-600", border: "border-violet-200" },
  { icon: MessageSquareText, title: "Collect", description: "Customers leave reviews on their preferred platforms.", color: "text-blue-600", border: "border-blue-200" },
  { icon: MonitorSmartphone, title: "Monitor", description: "Track and manage all reviews from one central dashboard.", color: "text-amber-600", border: "border-amber-200" },
  { icon: TrendingUp, title: "Grow", description: "Improve your reputation and turn feedback into business growth.", color: "text-accent", border: "border-accent/30" },
];

const CLOSING_CHECKLIST = [
  { icon: Send, label: "Auto-timed requests" },
  { icon: Star, label: "Every platform, one view" },
  { icon: MessageCircle, label: "Draft replies ready" },
  { icon: ShieldCheck, label: "You approve, always" },
];

export default function ReviewsReputationPage() {
  return (
    <div data-theme="light" className="flex min-h-dvh flex-col bg-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />

      <main className="flex-1">
       

        {/* Hero */}
        <section className="relative px-5 pb-8 pt-8 sm:px-7 sm:pb-10">
          <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-14 gap-y-12">
            <div className="min-w-[280px] max-w-[440px] flex-1 basis-[400px]">
              <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">Reviews & Reputation</p>
              <h1 className="text-balance font-display text-[38px] font-bold leading-[1.1] tracking-tight text-fg sm:text-[46px]">
                {page.h1Lead} <span className="text-accent">{page.h1Highlight}</span>
              </h1>
              <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-fg-muted">{page.subhead}</p>

              <div className="mt-5 flex flex-col gap-2.5">
                {page.withList.slice(0, 3).map((item) => (
                  <div key={item} className="flex items-center gap-2.5 text-[13.5px] text-fg">
                    <CheckCircle2 className="h-4 w-4 flex-none text-accent" aria-hidden />
                    {item}
                  </div>
                ))}
              </div>

              <div className="mt-7 flex flex-nowrap items-center gap-2 sm:gap-3">
                <Link
                  href="/book-a-demo"
                  className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3.5 py-2.5 text-[12.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover sm:gap-2 sm:px-6 sm:py-3.5 sm:text-[15px]"
                >
                  Start Building Your Reputation <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                </Link>
                <Link
                  href="#feed"
                  className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-md border border-border-strong px-3.5 py-2.5 text-[12.5px] font-medium text-fg transition-colors hover:border-accent hover:text-primary sm:gap-2 sm:px-6 sm:py-3.5 sm:text-[15px]"
                >
                  See How It Works <PlayCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                </Link>
              </div>
            </div>

            <div className="relative min-w-[320px] flex-[1.4] basis-[520px]">
              <div
                className="pointer-events-none absolute inset-0 -z-10"
                style={{ background: "radial-gradient(45% 45% at 50% 45%, rgba(14,168,106,0.1), transparent 70%)" }}
                aria-hidden
              />
              <div className="pointer-events-none absolute -left-6 top-0 -z-10 h-40 w-40 rounded-full bg-[#0ea86a]/10 blur-2xl sm:h-56 sm:w-56" aria-hidden />
              <div className="pointer-events-none absolute -right-6 bottom-0 -z-10 h-44 w-44 rounded-full bg-[#0ea86a]/10 blur-2xl sm:h-60 sm:w-60" aria-hidden />

              <div className="relative mx-auto flex w-full max-w-[560px] items-center justify-center">
                <svg className="pointer-events-none absolute inset-0 hidden h-full w-full md:block" aria-hidden>
                  <line x1="18%" y1="16%" x2="42%" y2="34%" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" className="text-border-strong" />
                  <line x1="18%" y1="84%" x2="42%" y2="66%" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" className="text-border-strong" />
                  <line x1="82%" y1="16%" x2="58%" y2="34%" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" className="text-border-strong" />
                  <line x1="82%" y1="84%" x2="58%" y2="66%" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" className="text-border-strong" />
                </svg>

                <div className="relative z-10 w-[160px] flex-none rounded-[30px] border-[6px] border-[#1a1a1a] bg-[#1a1a1a] p-1.5 shadow-[0_30px_70px_-30px_rgba(13,21,18,0.4)]">
                  <span className="absolute -left-[7px] top-14 h-8 w-[3px] rounded-full bg-[#0a0a0a]" aria-hidden />
                  <span className="absolute -left-[7px] top-28 h-12 w-[3px] rounded-full bg-[#0a0a0a]" aria-hidden />
                  <span className="absolute -right-[7px] top-24 h-14 w-[3px] rounded-full bg-[#0a0a0a]" aria-hidden />
                  
                  <div className="overflow-hidden rounded-[24px] bg-white p-4 pt-6 text-center">
                    <p className="mb-3 text-[12px] font-semibold leading-snug text-fg">How was your experience with us?</p>
                    <div className="mb-3 flex justify-center">
                      <Stars rating={5} size="h-4 w-4" />
                    </div>
                    <p className="mb-2.5 text-[9.5px] text-fg-muted">We&apos;d love your feedback!</p>
                    <span className="mb-3 inline-block rounded-md bg-primary px-3 py-1.5 text-[10px] font-semibold text-primary-foreground">Leave a Review</span>
                    <div className="flex items-center justify-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2">
                        <Image src="/brand/google.png" alt="Google" width={12} height={12} className="object-contain" />
                      </span>
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1877F2]">
                        <FacebookIcon className="h-3 w-3 text-white" />
                      </span>
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2">
                        <Image src="/brand/trustpilot-star.png" alt="Trustpilot" width={12} height={12} className="object-contain" />
                      </span>
                    </div>
                  </div>
                </div>

                <div className="absolute -left-4 top-2 hidden w-[130px] rounded-md border border-border-strong bg-white p-2.5 shadow-[0_20px_45px_-25px_rgba(13,21,18,0.35)] sm:-left-16 md:block">
                  <div className="mb-1 flex items-center gap-1.5">
                    <Image src="/brand/google.png" alt="Google" width={14} height={14} className="object-contain" />
                    <span className="text-[10.5px] font-semibold text-fg">Google</span>
                  </div>
                  <p className="text-[13px] font-bold text-fg">4.8 <Stars rating={4.8} /></p>
                  <p className="text-[9px] text-fg-faint">612 reviews</p>
                </div>

                <div className="absolute -left-4 bottom-2 hidden w-[130px] rounded-md border border-border-strong bg-white p-2.5 shadow-[0_20px_45px_-25px_rgba(13,21,18,0.35)] sm:-left-16 md:block">
                  <div className="mb-1 flex items-center gap-1.5">
                    <Image src="/brand/trustpilot-star.png" alt="Trustpilot" width={14} height={14} className="object-contain" />
                    <span className="text-[10.5px] font-semibold text-fg">Trustpilot</span>
                  </div>
                  <p className="text-[13px] font-bold text-fg">4.7 <Stars rating={4.7} /></p>
                  <p className="text-[9px] text-fg-faint">432 reviews</p>
                </div>

                <div className="absolute -right-4 top-2 hidden w-[130px] rounded-md border border-border-strong bg-white p-2.5 shadow-[0_20px_45px_-25px_rgba(13,21,18,0.35)] sm:-right-16 md:block">
                  <div className="mb-1 flex items-center gap-1.5">
                    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#1877F2]">
                      <FacebookIcon className="h-2 w-2 text-white" />
                    </span>
                    <span className="text-[10.5px] font-semibold text-fg">Facebook</span>
                  </div>
                  <p className="text-[13px] font-bold text-fg">4.9 <Stars rating={4.9} /></p>
                  <p className="text-[9px] text-fg-faint">230 reviews</p>
                </div>

                <div className="absolute -right-4 bottom-2 hidden w-[140px] rounded-md border border-border-strong bg-white p-2.5 shadow-[0_20px_45px_-25px_rgba(13,21,18,0.35)] sm:-right-16 md:block">
                  <p className="mb-1 text-[10px] text-fg-faint">Overall Rating</p>
                  <p className="font-display text-[20px] font-bold text-fg">4.8 <Stars rating={4.8} /></p>
                  <p className="text-[9px] text-fg-faint">1,274 reviews</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Platforms */}
        <section className="px-5 pb-8 sm:px-7">
          <div className="mx-auto max-w-[1320px] rounded-md border border-border bg-surface-2 px-6 py-8 sm:px-10">
            <h2 className="mb-6 text-center text-[14px] font-semibold text-fg">Manage reviews from all major platforms in one place</h2>
            <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
              {PLATFORM_ROW.map((p) => (
                <div key={p.label} className="flex items-center gap-2">
                  {p.logo ? (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white">
                      <Image src={p.logo} alt="" width={16} height={16} className="object-contain" />
                    </span>
                  ) : p.facebook ? (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1877F2]">
                      <FacebookIcon className="h-3.5 w-3.5 text-white" />
                    </span>
                  ) : (
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full ${p.bg}`}>
                      {p.icon ? <p.icon className={`h-3.5 w-3.5 ${p.color}`} aria-hidden /> : null}
                    </span>
                  )}
                  <span className="text-[12.5px] text-fg-muted">{p.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features + live feed */}
        <section id="feed" className="px-5 pb-8 sm:px-7">
          <div className="mx-auto grid max-w-[1320px] grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <h2 className="mb-6 text-balance font-display text-[24px] font-bold leading-[1.2] tracking-tight text-fg">
                Everything you need for a stronger reputation
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {FEATURE_CARDS.map((f) => (
                  <div key={f.title} className="rounded-md border border-border bg-white p-4">
                    <span className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${f.tint}`}>
                      <f.icon className={`h-[18px] w-[18px] ${f.color}`} aria-hidden />
                    </span>
                    <p className="mb-1 text-[13.5px] font-semibold text-fg">{f.title}</p>
                    <p className="text-[11.5px] leading-relaxed text-fg-muted">{f.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-border bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-[14px] font-semibold text-fg">Live Review Feed</p>
                <Link href="/book-a-demo" className="text-[12px] font-medium text-primary hover:underline">
                  View All →
                </Link>
              </div>
              <div className="flex flex-col divide-y divide-border">
                {LIVE_FEED.map((r) => (
                  <div key={r.name} className="flex items-start gap-2.5 py-3 first:pt-0 last:pb-0">
                    {r.platform === "google" ? (
                      <Image src="/brand/google.png" alt="Google" width={22} height={22} className="mt-0.5 flex-none object-contain" />
                    ) : r.platform === "trustpilot" ? (
                      <span className="mt-0.5 flex h-[22px] w-[22px] flex-none items-center justify-center">
                        <Star className="h-4 w-4 fill-[#00b67a] text-[#00b67a]" aria-hidden />
                      </span>
                    ) : (
                      <span className="mt-0.5 flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-[#1877F2]">
                        <FacebookIcon className="h-3 w-3 text-white" />
                      </span>
                    )}
                    <div className="relative h-8 w-8 flex-none overflow-hidden rounded-full">
                      <Image
                        src={`https://images.unsplash.com/${r.avatar}?w=80&q=80&auto=format&fit=crop`}
                        alt={r.name}
                        fill
                        sizes="32px"
                        className="object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                        <span className="text-[12.5px] font-semibold text-fg">{r.name}</span>
                        <span className={`flex-none rounded-full px-2 py-0.5 text-[9.5px] font-medium ${r.tagColor}`}>{r.tag}</span>
                      </div>
                      <div className="mb-1 flex items-center gap-2">
                        <Stars rating={r.stars} />
                        <span className="text-[10px] text-fg-faint">{r.time}</span>
                      </div>
                      <p className="text-[11.5px] leading-snug text-fg-muted">{r.text}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Link href="/book-a-demo" className="mt-3 inline-block text-[12px] font-medium text-primary hover:underline">
                Manage All Reviews →
              </Link>
            </div>
          </div>
        </section>

        {/* Results */}
        <section className="px-5 pb-8 sm:px-7">
          <div className="mx-auto flex max-w-[1320px] flex-wrap gap-x-10 gap-y-8">
            <div className="min-w-[260px] flex-1 basis-[360px]">
              <h2 className="mb-2 text-balance font-display text-[24px] font-bold leading-[1.2] tracking-tight text-fg">Your Reputation. Your Results.</h2>
              <p className="mb-6 max-w-[42ch] text-[13.5px] leading-relaxed text-fg-muted">
                A strong reputation leads to more customers, more sales and long-term loyalty.
              </p>
              <div className="grid grid-cols-4 gap-3">
                {RESULT_STATS.map((s) => (
                  <div key={s.label} className="rounded-md border border-border bg-white p-3.5">
                    <s.icon className={`mb-2 h-4 w-4 ${s.color}`} aria-hidden />
                    <p className="font-display text-[22px] font-bold text-fg">{s.value}</p>
                    <p className="text-[11px] text-fg-muted">{s.label}</p>
                    <p className="mt-1 text-[9.5px] text-accent">{s.delta}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative min-w-[260px] flex-1 basis-[340px] overflow-hidden rounded-md border border-border bg-white p-5">
              <Quote className="absolute left-3 top-3 h-6 w-6 text-border-strong" aria-hidden />
              <p className="relative mb-3 text-[13.5px] italic leading-relaxed text-fg-muted">
                &ldquo;{page.pullQuote}&rdquo;
              </p>
              <div className="mb-3 flex items-center gap-2.5">
                <div className="relative h-9 w-9 flex-none overflow-hidden rounded-full">
                  <Image
                    src="https://images.unsplash.com/photo-1573496527892-904f897eb744?w=120&q=80&auto=format&fit=crop"
                    alt="Jessica Martinez, Marketing Manager at UrbanFit Studio"
                    fill
                    sizes="36px"
                    className="object-cover"
                  />
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-fg">Jessica Martinez</p>
                  <p className="text-[10.5px] text-fg-faint">Marketing Manager, UrbanFit Studio</p>
                </div>
              </div>
              <div className="flex justify-end gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === 1 ? "bg-accent" : "bg-border-strong"}`} />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Build steps */}
        <section className="px-5 pb-8 sm:px-7">
          <div className="mx-auto max-w-[1320px] rounded-md border border-border bg-surface-2 p-6 sm:p-8">
            <h2 className="mb-8 text-center font-display text-[22px] font-bold tracking-tight text-fg">Build a better reputation in 4 simple steps</h2>
            <div className="relative grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="absolute left-[12.5%] right-[12.5%] top-[26px] hidden border-t border-dashed border-border-strong sm:block" aria-hidden />
              {BUILD_STEPS.map((s, i) => (
                <div key={s.title} className="relative flex flex-col items-center text-center">
                  <span className={`relative z-10 mb-3 flex h-14 w-14 items-center justify-center rounded-full border-2 bg-white ${s.border}`}>
                    <s.icon className={`h-6 w-6 ${s.color}`} aria-hidden />
                    <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-surface-deep text-[10px] font-bold text-fg-on-deep">
                      {i + 1}
                    </span>
                  </span>
                  <p className="mb-1 text-[13px] font-semibold text-fg">{s.title}</p>
                  <p className="max-w-[160px] text-[11px] leading-relaxed text-fg-muted">{s.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Showcase */}
        <section className="px-5 pb-8 sm:px-7">
          <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-10 gap-y-8">
            <div className="min-w-[220px] max-w-[300px] flex-1">
              <h2 className="mb-2 text-balance font-display text-[20px] font-bold leading-[1.2] tracking-tight text-fg">Showcase your best reviews anywhere</h2>
              <p className="text-[12.5px] leading-relaxed text-fg-muted">
                Beautiful review widgets to display on your website, landing pages, emails and social media.
              </p>
            </div>

            <div className="flex min-w-[280px] flex-[2] flex-wrap gap-4">
              <div className="min-w-[180px] flex-1 rounded-md border border-border bg-white p-3.5">
                <div className="mb-2 flex items-center gap-1.5">
                  <Image src="/brand/google.png" alt="Google" width={14} height={14} className="object-contain" />
                  <span className="text-[10.5px] text-fg-faint">Google Rating</span>
                </div>
                <p className="mb-1 font-display text-[20px] font-bold text-fg">4.8 <Stars rating={4.8} /></p>
                <p className="text-[9.5px] text-fg-faint">Based on 612 reviews</p>
              </div>

              <div className="min-w-[180px] flex-1 rounded-md border border-border bg-white p-3.5">
                <p className="text-[11.5px] italic leading-snug text-fg-muted">&ldquo;Excellent service and great support! Highly recommended.&rdquo;</p>
                <p className="mt-2 text-[10.5px] font-medium text-fg-muted">— Sarah J.</p>
              </div>

              <div className="min-w-[180px] flex-1 rounded-md border border-border bg-white p-3.5">
                <div className="mb-2 flex items-center gap-1.5">
                  <Image src="/brand/trustpilot-star.png" alt="Trustpilot" width={14} height={14} className="object-contain" />
                  <span className="text-[10.5px] text-fg-faint">Trustpilot</span>
                </div>
                <p className="mb-1 font-display text-[20px] font-bold text-fg">4.7</p>
                <span className="mb-1 inline-flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={i} className="flex h-4 w-4 items-center justify-center rounded-[3px] bg-[#00b67a]">
                      <Star className="h-2.5 w-2.5 fill-white text-white" aria-hidden />
                    </span>
                  ))}
                </span>
                <p className="text-[9.5px] text-fg-faint">Based on 432 reviews</p>
              </div>
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="relative mt-10 overflow-hidden bg-surface-deep px-5 py-7 sm:px-7 sm:py-8">
          <div className="relative mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-8">
            <div className="min-w-[280px] flex-1 basis-[440px]">
              <h2 className="mb-3 text-balance font-display text-[26px] font-bold leading-[1.15] tracking-tight text-fg-on-deep sm:text-[30px]">
                A great reputation brings more than just reviews.
              </h2>
              <p className="mb-6 max-w-[48ch] text-[13.5px] leading-relaxed text-fg-on-deep-muted">
                It brings growth, trust and customers for life. Start building your reputation with Noxtill today.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/book-a-demo"
                  className="inline-flex items-center gap-2 rounded-md bg-white px-5.5 py-3 text-[14px] font-semibold text-[#053b2a] transition-colors hover:bg-[#e6f5ee]"
                >
                  Start Building Your Reputation <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link
                  href="/book-a-demo"
                  className="inline-flex items-center rounded-md border border-border-on-deep px-5.5 py-3 text-[14px] font-medium text-fg-on-deep transition-colors hover:border-fg-on-deep-muted"
                >
                  Book a Demo
                </Link>
              </div>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-3">
              {CLOSING_CHECKLIST.map((c) => (
                <div key={c.label} className="flex items-center gap-2 text-[12.5px] text-fg-on-deep-muted">
                  <c.icon className="h-4 w-4 flex-none text-accent-on-deep" aria-hidden />
                  {c.label}
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

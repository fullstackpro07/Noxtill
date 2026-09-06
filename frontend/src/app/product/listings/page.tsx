import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Flag,
  Globe,
  LayoutDashboard,
  List,
  MapPin,
  MessageSquare,
  MonitorSmartphone,
  Navigation,
  PawPrint,
  Phone,
  PlayCircle,
  Quote,
  RefreshCw,
  Settings,
  Share2,
  ShieldCheck,
  Star,
  Store,
  TrendingUp,
  Users,
} from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { DetailRelated } from "@/components/site/detail-page-sections";
import { findProductDetailPage } from "@/lib/marketing/product-detail-content";

const page = findProductDetailPage("listings")!;

export const metadata: Metadata = {
  title: page.metaTitle,
  description: page.metaDescription,
  alternates: { canonical: "https://noxtill.com/product/listings/" },
  openGraph: {
    type: "website",
    url: "https://noxtill.com/product/listings/",
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
        { "@type": "ListItem", position: 3, name: "Business Listings", item: "https://noxtill.com/product/listings/" },
      ],
    },
    {
      "@type": "Article",
      headline: page.metaTitle,
      description: page.metaDescription,
      url: "https://noxtill.com/product/listings/",
    },
  ],
};

function FacebookIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" />
    </svg>
  );
}

const PLATFORM_ROW = [
  { logo: "/brand/google.png", label: "Google Business Profile" },
  { logo: "/brand/bing.png", label: "Bing Places" },
  { logo: "/brand/applebiz.png", label: "Apple Maps" },
  { facebook: true, label: "Facebook Pages" },
  { logo: "/brand/instagram.png", label: "Instagram Business" },
  { logo: "/brand/yelp.png", label: "Yelp" },
  { logo: "/brand/yellowpages.png", label: "Yellow Pages" },
  {logo: "/brand/foursquare.png", label: "Foursquare" },
  { logo: "/brand/Hotfrog.png", label: "Hotfrog" },
  { icon: MonitorSmartphone, color: "text-fg-muted", bg: "bg-surface-2", label: "And 40+ More" },
];

const WHY_LISTINGS = [
  { icon: MonitorSmartphone, title: "Get Discovered", description: "Help customers find you when they search for products or services you offer." },
  { icon: ShieldCheck, title: "Build Trust & Credibility", description: "Consistent and verified listings make your business look reliable and professional." },
  { icon: TrendingUp, title: "Improve Local SEO", description: "Better listings mean higher rankings on search engines and local maps." },
  { icon: Users, title: "More Leads & Customers", description: "More visibility brings more calls, visits, bookings and sales to your business." },
];

const DASHBOARD_NAV = [
  { icon: LayoutDashboard, label: "Overview", active: true },
  { icon: List, label: "Listings" },
  { icon: RefreshCw, label: "Updates" },
  { icon: Star, label: "Reviews" },
  { icon: MessageSquare, label: "Messages" },
  { icon: BarChart3, label: "Insights" },
  { icon: Settings, label: "Settings" },
];

const DASHBOARD_LISTINGS = [
  { logo: "/brand/google.png", label: "Google Business Profile", status: "Verified", score: "100%", updated: "2 hours ago" },
  { logo: "/brand/bing.png", label: "Bing Places", status: "Verified", score: "95%", updated: "5 hours ago" },
  { logo: "/brand/applebiz.png", label: "Apple Maps", status: "Verified", score: "92%", updated: "1 day ago" },
  { facebook: true, label: "Facebook Pages", status: "Verified", score: "98%", updated: "3 hours ago" },
  { logo: "/brand/yelp.png", label: "Yelp", status: "Verified", score: "90%", updated: "1 day ago" },
];

const TOP_PLATFORMS = [
  { logo: "/brand/google.png", label: "Google Business Profile", value: "12,452", share: "52%" },
  { facebook: true, label: "Facebook Pages", value: "5,632", share: "23%" },
  { logo: "/brand/applebiz.png", label: "Apple Maps", value: "3,218", share: "13%" },
  { logo: "/brand/bing.png", label: "Bing Places", value: "2,184", share: "9%" },
  { logo: "/brand/yelp.png", label: "Yelp", value: "1,032", share: "4%" },
];

const CONSISTENCY_STEPS = [
  { icon: Store, title: "Update Info", description: "Edit your business information in Noxtill." },
  { icon: RefreshCw, title: "Auto Sync", description: "We update your listings everywhere instantly." },
  { icon: CheckCircle2, title: "Stay Consistent", description: "Your NAP stays correct across all platforms." },
  { icon: TrendingUp, title: "Better Results", description: "More visibility. More trust. More customers." },
];

const REVIEW_FEED = [
  { platform: "google", rating: 5.0, time: "2 hours ago", text: "Great experience! The trainers are professional and the environment is amazing." },
  { platform: "facebook", rating: 4.5, time: "5 hours ago", text: "Love this place! Very clean and well equipped." },
  { platform: "yelp", rating: 4.0, time: "1 day ago", text: "Good service. Friendly staff and great classes." },
];

const CLOSING_CHECKLIST = ["50+ platforms", "Real-time sync", "Consistent information", "Better visibility", "More customers"];

export default function BusinessListingsPage() {
  return (
    <div data-theme="light" className="flex min-h-dvh flex-col bg-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />

      <main className="flex-1">
      

        {/* Hero */}
        <section className="relative px-5 pb-8 pt-8 sm:px-7 sm:pb-10">
          <div className="mx-auto flex max-w-[1560px] flex-wrap items-center gap-x-14 gap-y-12">
            <div className="min-w-[280px] max-w-[460px] flex-1 basis-[400px]">
              <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">Business Listings</p>
              <h1 className="text-balance font-display text-[38px] font-bold leading-[1.1] tracking-tight text-fg sm:text-[46px]">
                {page.h1Lead} <span className="text-accent">{page.h1Highlight}</span>
              </h1>
              <p className="mt-4 max-w-[48ch] text-[15px] leading-relaxed text-fg-muted">{page.subhead}</p>

              <div className="mt-5 flex flex-col gap-2.5">
                {page.withList.map((item) => (
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
                  Book a Demo <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                </Link>
                <Link
                  href="#platforms"
                  className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-md border border-border-strong px-3.5 py-2.5 text-[12.5px] font-medium text-fg transition-colors hover:border-accent hover:text-primary sm:gap-2 sm:px-6 sm:py-3.5 sm:text-[15px]"
                >
                  See How It Works <PlayCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                </Link>
              </div>
            </div>

            <div className="relative min-w-[320px] flex-[1.6] basis-[600px]">
              <div
                className="pointer-events-none absolute inset-0 -z-10"
                style={{ background: "radial-gradient(45% 45% at 50% 45%, rgba(14,168,106,0.1), transparent 70%)" }}
                aria-hidden
              />
              <div className="pointer-events-none absolute -left-6 top-4 -z-10 h-40 w-40 rounded-full bg-[#0ea86a]/10 blur-2xl sm:h-56 sm:w-56" aria-hidden />
              <div className="pointer-events-none absolute -right-6 bottom-4 -z-10 h-44 w-44 rounded-full bg-[#0ea86a]/10 blur-2xl sm:h-60 sm:w-60" aria-hidden />

              <div className="relative mx-auto hidden w-full max-w-[720px] py-8 md:block">
                <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
                  <line x1="15%" y1="17%" x2="34%" y2="40%" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" className="text-border-strong" />
                  <line x1="15%" y1="83%" x2="34%" y2="60%" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" className="text-border-strong" />
                  <line x1="85%" y1="12%" x2="66%" y2="32%" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" className="text-border-strong" />
                  <line x1="85%" y1="70%" x2="66%" y2="58%" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" className="text-border-strong" />
                  <line x1="42%" y1="100%" x2="50%" y2="88%" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" className="text-border-strong" />
                </svg>

                <div className="relative z-10 mx-auto w-[420px] max-w-full rounded-md border border-border bg-white p-4 shadow-[0_24px_60px_-30px_rgba(13,21,18,0.4)]">
                  <p className="mb-3 text-[11px] font-semibold text-fg">Your Business Preview</p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1.1fr_1fr]">
                    <div>
                      <div className="mb-2 flex items-center gap-2">
                        <p className="text-[13px] font-semibold text-fg">UrbanFit Studio</p>
                        <span className="rounded-full bg-[#e3fbf1] px-2 py-0.5 text-[8.5px] font-medium text-accent">Verified</span>
                      </div>
                      <p className="mb-2 text-[10.5px] text-fg-faint">Gym & Fitness Center</p>
                      <p className="mb-2 flex items-center gap-1 text-[11px] text-fg">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden /> 4.8 <span className="text-fg-faint">(128 reviews)</span>
                      </p>
                      <p className="mb-1.5 flex items-center gap-1.5 text-[10.5px] text-fg-muted">
                        <Phone className="h-3 w-3 flex-none text-accent" aria-hidden /> +1 555-987-6543
                      </p>
                      <p className="mb-1.5 flex items-center gap-1.5 text-[10.5px] text-fg-muted">
                        <MapPin className="h-3 w-3 flex-none text-accent" aria-hidden /> 123 Fitness St, New York, NY 10001, USA
                      </p>
                      <p className="mb-3 text-[10.5px] text-fg-muted">Open · Closes 9:00 PM</p>
                      <div className="flex items-center gap-3 text-[9px] text-fg-muted">
                        {[
                          { icon: Phone, label: "Call" },
                          { icon: Globe, label: "Website" },
                          { icon: Navigation, label: "Directions" },
                          { icon: Share2, label: "Share" },
                        ].map((a) => (
                          <span key={a.label} className="flex flex-col items-center gap-1">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e3fbf1]">
                              <a.icon className="h-3.5 w-3.5 text-accent" aria-hidden />
                            </span>
                            {a.label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="relative min-h-[150px] overflow-hidden rounded-md bg-[#e9ece9]">
                      <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(#dce1dc 1px, transparent 1px), linear-gradient(90deg, #dce1dc 1px, transparent 1px)", backgroundSize: "18px 18px" }} />
                      <div className="absolute inset-y-0 left-[55%] w-[10%] -skew-x-12 bg-[#f6e7b8]" aria-hidden />
                      <div className="absolute left-[8%] top-[12%] h-8 w-8 rounded-full bg-[#cfe8d6]" aria-hidden />
                      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
                        <MapPin className="h-7 w-7 fill-primary text-primary drop-shadow" aria-hidden />
                        <span className="mt-1 whitespace-nowrap rounded-md bg-white px-2 py-0.5 text-[9px] font-medium text-fg shadow-sm">You&apos;re visible here</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="absolute left-0 top-0 z-10 w-[140px] rounded-md border border-border bg-white p-2.5 shadow-[0_20px_45px_-25px_rgba(13,21,18,0.35)]">
                  <div className="flex items-center gap-2">
                    <Image src="/brand/yelp.png" alt="" width={20} height={20} className="flex-none object-contain" />
                    <span className="text-[11px] font-semibold text-fg">Yelp Listed</span>
                  </div>
                </div>

                <div className="absolute bottom-0 left-0 z-10 w-[140px] rounded-md border border-border bg-white p-2.5 shadow-[0_20px_45px_-25px_rgba(13,21,18,0.35)]">
                  <div className="flex items-center gap-2">
                    <Image src="/brand/bing.png" alt="" width={20} height={20} className="flex-none object-contain" />
                    <span className="text-[11px] font-semibold text-fg">Bing Places Listed</span>
                  </div>
                </div>

                <div className="absolute right-0 top-0 z-10 w-[150px] rounded-md border border-border bg-white p-2.5 shadow-[0_20px_45px_-25px_rgba(13,21,18,0.35)]">
                  <div className="flex items-center gap-2">
                    <Image src="/brand/google.png" alt="" width={20} height={20} className="flex-none object-contain" />
                    <span className="text-[11px] font-semibold text-fg">Google Business Profile</span>
                  </div>
                  <span className="mt-1 inline-block rounded-full bg-[#e3fbf1] px-2 py-0.5 text-[8.5px] font-medium text-accent">Verified</span>
                </div>

                <div className="absolute bottom-0 right-0 z-10 w-[140px] rounded-md border border-border bg-white p-2.5 shadow-[0_20px_45px_-25px_rgba(13,21,18,0.35)]">
                  <div className="flex items-center gap-2">
                    <Image src="/brand/applebiz.png" alt="" width={20} height={20} className="flex-none object-contain" />
                    <span className="text-[11px] font-semibold text-fg">Apple Maps Listed</span>
                  </div>
                </div>

                <div className="absolute -bottom-6 left-1/2 z-10 w-[140px] -translate-x-1/2 rounded-md border border-border bg-white p-2.5 shadow-[0_20px_45px_-25px_rgba(13,21,18,0.35)]">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[#1877F2]">
                      <FacebookIcon className="h-2.5 w-2.5 text-white" />
                    </span>
                    <span className="text-[11px] font-semibold text-fg">Facebook Listed</span>
                  </div>
                </div>
              </div>

              <div className="mx-auto w-full max-w-[420px] rounded-md border border-border bg-white p-4 shadow-[0_24px_60px_-30px_rgba(13,21,18,0.4)] md:hidden">
                <p className="mb-3 text-[11px] font-semibold text-fg">Your Business Preview</p>
                <p className="text-[13px] font-semibold text-fg">UrbanFit Studio</p>
                <p className="text-[10.5px] text-fg-faint">Gym & Fitness Center</p>
              </div>
            </div>
          </div>
        </section>

        {/* Platforms */}
        <section id="platforms" className="px-5 pb-8 sm:px-7">
          <div className="mx-auto max-w-[1560px] rounded-md bg-surface-deep px-6 py-8 sm:px-10">
            <h2 className="mb-1 text-center text-[16px] font-semibold text-fg-on-deep">One Place. All Major Platforms.</h2>
            <p className="mx-auto mb-6 max-w-[52ch] text-center text-[12.5px] text-fg-on-deep-muted">
              List and manage your business on the platforms your customers use every day.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
              {PLATFORM_ROW.map((p) => (
                <div key={p.label} className="flex flex-col items-center gap-2">
                  {p.logo ? (
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white">
                      <Image src={p.logo} alt="" width={22} height={22} className="object-contain" />
                    </span>
                  ) : p.facebook ? (
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1877F2]">
                      <FacebookIcon className="h-5 w-5 text-white" />
                    </span>
                  ) : (
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10">
                      {p.icon ? <p.icon className="h-5 w-5 text-accent-on-deep" aria-hidden /> : null}
                    </span>
                  )}
                  <span className="text-center text-[11.5px] text-fg-on-deep-muted">{p.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Why listings matter + dashboard */}
        <section className="px-5 pb-8 sm:px-7">
          <div className="mx-auto grid max-w-[1560px] grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-md border border-border bg-white p-6">
              <h2 className="mb-2 text-balance font-display text-[22px] font-bold leading-[1.2] tracking-tight text-fg">Why Business Listings Matter</h2>
              <p className="mb-6 max-w-[46ch] text-[13px] leading-relaxed text-fg-muted">
                Accurate listings build trust, improve visibility, and bring more customers to your business.
              </p>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {WHY_LISTINGS.map((w) => (
                  <div key={w.title} className="flex items-start gap-3">
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-md bg-[#e3fbf1]">
                      <w.icon className="h-[17px] w-[17px] text-accent" aria-hidden />
                    </span>
                    <div>
                      <p className="mb-0.5 text-[13px] font-semibold text-fg">{w.title}</p>
                      <p className="text-[11.5px] leading-relaxed text-fg-muted">{w.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-border bg-white p-6">
              <h2 className="mb-1 text-[16px] font-bold text-fg">Manage All Your Listings in One Dashboard</h2>
              <p className="mb-4 text-[12px] text-fg-muted">Update business info, monitor status and keep everything consistent.</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[0.7fr_1.3fr]">
                <div className="flex flex-col gap-0.5 rounded-md border border-border p-2">
                  {DASHBOARD_NAV.map((n) => (
                    <div
                      key={n.label}
                      className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[11.5px] ${n.active ? "bg-[#e3fbf1] font-medium text-accent" : "text-fg-muted"}`}
                    >
                      <n.icon className="h-3.5 w-3.5 flex-none" aria-hidden /> {n.label}
                    </div>
                  ))}
                </div>

                <div className="min-w-0 overflow-x-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead>
                      <tr className="text-fg-faint">
                        <th className="pb-2 font-medium">Platform</th>
                        <th className="pb-2 font-medium">Status</th>
                        <th className="pb-2 font-medium">Listing Score</th>
                        <th className="pb-2 font-medium">Last Updated</th>
                        <th className="pb-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {DASHBOARD_LISTINGS.map((l) => (
                        <tr key={l.label}>
                          <td className="whitespace-nowrap py-2 pr-2">
                            <div className="flex items-center gap-1.5">
                              {l.logo ? (
                                <Image src={l.logo} alt="" width={14} height={14} className="object-contain" />
                              ) : (
                                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#1877F2]">
                                  <FacebookIcon className="h-2 w-2 text-white" />
                                </span>
                              )}
                              <span className="font-medium text-fg">{l.label}</span>
                            </div>
                          </td>
                          <td className="py-2 pr-2">
                            <span className="rounded-full bg-[#e3fbf1] px-2 py-0.5 text-[9.5px] font-medium text-accent">{l.status}</span>
                          </td>
                          <td className="py-2 pr-2 font-medium text-fg">{l.score}</td>
                          <td className="py-2 pr-2 text-fg-faint">{l.updated}</td>
                          <td className="py-2 text-right">
                            <Link href="/book-a-demo" className="font-medium text-primary hover:underline">
                              View
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Link href="/book-a-demo" className="mt-3 inline-block text-[11.5px] font-medium text-primary hover:underline">
                    View All Listings →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Insights row */}
        <section className="px-5 pb-8 sm:px-7">
          <div className="mx-auto grid max-w-[1560px] grid-cols-1 gap-6 lg:grid-cols-[0.8fr_1.4fr_1fr]">
            <div className="rounded-md border border-border bg-white p-5">
              <p className="mb-4 text-[13px] font-semibold text-fg">Listings Overview</p>
              <p className="mb-2 text-[10.5px] text-fg-faint">Overall Listing Score</p>
              <div className="relative mx-auto mb-3 h-24 w-24">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="#eceeed" strokeWidth="10" />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="#0ea86a"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 42 * 0.93} ${2 * Math.PI * 42}`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[20px] font-bold text-fg">93%</span>
                </div>
              </div>
              <p className="mb-3 text-center text-[11px] font-medium text-accent">Excellent — Keep it up!</p>
              <div className="flex flex-col gap-1.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-fg-muted">
                    <span className="h-2 w-2 rounded-full bg-accent" /> Listed
                  </span>
                  <span className="font-medium text-fg">48</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-fg-muted">
                    <span className="h-2 w-2 rounded-full bg-amber-500" /> Needs Attention
                  </span>
                  <span className="font-medium text-fg">3</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-fg-muted">
                    <span className="h-2 w-2 rounded-full bg-rose-500" /> Not Listed
                  </span>
                  <span className="font-medium text-fg">2</span>
                </div>
              </div>
              <Link href="/book-a-demo" className="mt-3 inline-block text-[11.5px] font-medium text-primary hover:underline">
                View Full Report →
              </Link>
            </div>

            <div className="rounded-md border border-border bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-[13px] font-semibold text-fg">Visibility Insights</p>
                <span className="rounded-md border border-border px-2 py-1 text-[10.5px] text-fg-muted">This Month</span>
              </div>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { value: "24,518", label: "Search Impressions", delta: "↑ 18.6%" },
                  { value: "6,752", label: "Profile Views", delta: "↑ 21.4%" },
                  { value: "1,324", label: "Website Clicks", delta: "↑ 15.3%" },
                  { value: "843", label: "Direction Requests", delta: "↑ 12.7%" },
                ].map((s) => (
                  <div key={s.label}>
                    <p className="text-[15px] font-bold text-fg">{s.value}</p>
                    <p className="text-[9.5px] text-fg-faint">{s.label}</p>
                    <p className="mt-0.5 text-[9px] text-accent">{s.delta}</p>
                  </div>
                ))}
              </div>
              <svg viewBox="0 0 300 90" className="w-full" preserveAspectRatio="none" aria-hidden>
                <defs>
                  <linearGradient id="listings-chart-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0ea86a" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#0ea86a" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M0,60 L60,52 L120,55 L180,35 L240,38 L300,20 L300,90 L0,90 Z" fill="url(#listings-chart-fill)" />
                <path d="M0,60 L60,52 L120,55 L180,35 L240,38 L300,20" fill="none" stroke="#0ea86a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="mt-1 flex justify-between text-[9px] text-fg-faint">
                <span>Apr 20</span>
                <span>Apr 27</span>
                <span>May 4</span>
                <span>May 11</span>
                <span>May 18</span>
                <span>May 25</span>
              </div>
            </div>

            <div className="rounded-md border border-border bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-[13px] font-semibold text-fg">Top Performing Platforms</p>
                <span className="rounded-md border border-border px-2 py-1 text-[10.5px] text-fg-muted">This Month</span>
              </div>
              <div className="flex flex-col gap-3">
                {TOP_PLATFORMS.map((t) => (
                  <div key={t.label} className="flex items-center gap-2.5">
                    {t.logo ? (
                      <Image src={t.logo} alt="" width={16} height={16} className="flex-none object-contain" />
                    ) : (
                      <span className="flex h-4 w-4 flex-none items-center justify-center rounded-full bg-[#1877F2]">
                        <FacebookIcon className="h-2 w-2 text-white" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-[11px] text-fg-muted">{t.label}</span>
                    <span className="flex-none text-[11px] font-medium text-fg">{t.value}</span>
                    <span className="w-9 flex-none text-right text-[11px] text-fg-faint">{t.share}</span>
                  </div>
                ))}
              </div>
              <Link href="/book-a-demo" className="mt-3 inline-block text-[11.5px] font-medium text-primary hover:underline">
                View Full Analytics →
              </Link>
            </div>
          </div>
        </section>

        {/* Consistency + reviews */}
        <section className="px-5 pb-8 sm:px-7">
          <div className="mx-auto grid max-w-[1560px] grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-md border border-border bg-white p-6">
              <h2 className="mb-1 text-balance font-display text-[20px] font-bold leading-[1.2] tracking-tight text-fg">
                Always Accurate. Always Consistent.
              </h2>
              <p className="mb-6 max-w-[46ch] text-[13px] leading-relaxed text-fg-muted">
                Update your business information once and Noxtill automatically syncs it across all platforms.
              </p>
              <div className="flex flex-wrap items-start gap-2">
                {CONSISTENCY_STEPS.map((s, i) => (
                  <div key={s.title} className="flex flex-1 items-start gap-2">
                    <div className="flex w-[100px] flex-none flex-col items-center gap-2 text-center">
                      <span className="flex h-11 w-11 items-center justify-center rounded-md bg-[#e3fbf1]">
                        <s.icon className="h-[18px] w-[18px] text-accent" aria-hidden />
                      </span>
                      <p className="text-[12px] font-semibold text-fg">{s.title}</p>
                      <p className="text-[10.5px] leading-relaxed text-fg-muted">{s.description}</p>
                    </div>
                    {i < CONSISTENCY_STEPS.length - 1 ? <ArrowRight className="mt-4 h-3.5 w-3.5 flex-none text-border-strong" aria-hidden /> : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-border bg-white p-6">
              <h2 className="mb-1 text-balance font-display text-[20px] font-bold leading-[1.2] tracking-tight text-fg">
                Monitor Reviews & Reputation
              </h2>
              <p className="mb-5 max-w-[52ch] text-[13px] leading-relaxed text-fg-muted">
                See and respond to reviews from all platforms in one place.
              </p>
              <div className="flex flex-col divide-y divide-border">
                {REVIEW_FEED.map((r) => (
                  <div key={r.text} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start gap-2.5">
                      {r.platform === "google" ? (
                        <Image src="/brand/google.png" alt="" width={18} height={18} className="mt-0.5 flex-none object-contain" />
                      ) : r.platform === "facebook" ? (
                        <span className="mt-0.5 flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-[#1877F2]">
                          <FacebookIcon className="h-2.5 w-2.5 text-white" />
                        </span>
                      ) : (
                        <Image src="/brand/yelp.png" alt="" width={18} height={18} className="mt-0.5 flex-none object-contain" />
                      )}
                      <div className="min-w-0">
                        <div className="mb-1 flex items-center gap-1.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} className={`h-3 w-3 ${i < Math.round(r.rating) ? "fill-amber-400 text-amber-400" : "text-border-strong"}`} aria-hidden />
                          ))}
                          <span className="text-[11px] font-semibold text-fg">{r.rating.toFixed(1)}</span>
                          <span className="text-[10px] text-fg-faint">{r.time}</span>
                        </div>
                        <p className="max-w-[38ch] text-[11.5px] leading-snug text-fg-muted">{r.text}</p>
                      </div>
                    </div>
                    <Link href="/book-a-demo" className="flex-none rounded-md border border-border-strong px-3 py-1.5 text-[10.5px] font-medium text-fg hover:border-accent hover:text-primary">
                      Reply
                    </Link>
                  </div>
                ))}
              </div>
              <Link href="/product/reviews" className="mt-3 inline-block text-[11.5px] font-medium text-primary hover:underline">
                View All Reviews →
              </Link>
            </div>
          </div>
        </section>

        {/* Get listed + testimonial */}
        <section className="px-5 pb-8 sm:px-7">
          <div className="mx-auto flex max-w-[1560px] flex-wrap gap-6">
            <div className="flex min-w-[280px] flex-[1.3] basis-[500px] flex-wrap items-center gap-6 rounded-md border border-border bg-surface-2 p-6">
              <div className="min-w-[220px] flex-1">
                <h2 className="mb-2 text-balance font-display text-[20px] font-bold leading-[1.2] tracking-tight text-fg">
                  Get Your Business Listed Today
                </h2>
                <p className="mb-4 max-w-[42ch] text-[13px] leading-relaxed text-fg-muted">
                  Start listing your business and reach more customers where they search, browse and decide.
                </p>
                <div className="flex flex-col gap-2">
                  {["14-day free trial", "No credit card required", "Cancel anytime"].map((c) => (
                    <div key={c} className="flex items-center gap-2 text-[12.5px] text-fg">
                      <CheckCircle2 className="h-3.5 w-3.5 flex-none text-accent" aria-hidden />
                      {c}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-none items-end gap-2">
                <div className="h-[100px] w-[150px] rounded-t-md border-[5px] border-b-0 border-[#1a1a1a] bg-white p-1.5">
                  <div className="flex items-center gap-1 border-b border-border pb-1">
                    <LayoutDashboard className="h-2 w-2 text-accent" aria-hidden />
                    <span className="text-[6px] font-semibold text-fg">Listings</span>
                  </div>
                  <div className="mt-1 flex flex-col gap-1">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="h-1.5 w-full rounded-sm bg-surface-2" />
                    ))}
                  </div>
                </div>
                <div className="h-[110px] w-[52px] flex-none rounded-[10px] border-[3px] border-[#1a1a1a] bg-white p-1">
                  <MapPin className="mx-auto mt-2 h-4 w-4 text-primary" aria-hidden />
                </div>
              </div>
            </div>

            <div className="relative min-w-[240px] flex-1 basis-[300px] overflow-hidden rounded-md border border-border bg-white p-5">
              <Quote className="absolute left-3 top-3 h-6 w-6 text-border-strong" aria-hidden />
              <p className="relative mb-3 text-[13.5px] italic leading-relaxed text-fg-muted">&ldquo;{page.pullQuote}&rdquo;</p>
              <div className="mb-3 flex items-center gap-2.5">
                <div className="relative h-9 w-9 flex-none overflow-hidden rounded-full">
                  <Image
                    src="https://images.unsplash.com/photo-1705579607707-717fb965145f?w=120&q=80&auto=format&fit=crop"
                    alt="David Smith, Owner at UrbanFit Studio"
                    fill
                    sizes="36px"
                    className="object-cover"
                  />
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-fg">David Smith</p>
                  <p className="text-[10.5px] text-fg-faint">Owner, UrbanFit Studio</p>
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

        {/* Closing CTA */}
        <section className="relative mt-4 overflow-hidden bg-surface-deep px-5 py-7 sm:px-7 sm:py-8">
          <div className="relative mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-8">
            <div className="flex items-start gap-4 min-w-[280px] flex-1 basis-[500px]">
              <span className="flex h-12 w-12 flex-none items-center justify-center rounded-md bg-white/10">
                <Store className="h-6 w-6 text-accent-on-deep" aria-hidden />
              </span>
              <div>
                <h2 className="mb-2 text-balance font-display text-[22px] font-bold leading-[1.2] tracking-tight text-fg-on-deep">
                  Be Everywhere Your Customers Are.
                </h2>
                <p className="mb-4 max-w-[48ch] text-[13px] leading-relaxed text-fg-on-deep-muted">
                  List. Manage. Grow with Noxtill.
                </p>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {CLOSING_CHECKLIST.map((c) => (
                    <div key={c} className="flex items-center gap-2 text-[12px] text-fg-on-deep-muted">
                      <CheckCircle2 className="h-3.5 w-3.5 flex-none text-accent-on-deep" aria-hidden />
                      {c}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/book-a-demo"
                className="inline-flex items-center gap-2 rounded-md bg-white px-5.5 py-3 text-[14px] font-semibold text-[#053b2a] transition-colors hover:bg-[#e6f5ee]"
              >
                List Your Business Now <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/book-a-demo"
                className="inline-flex items-center rounded-md border border-border-on-deep px-5.5 py-3 text-[14px] font-medium text-fg-on-deep transition-colors hover:border-fg-on-deep-muted"
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

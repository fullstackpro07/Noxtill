import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";
import {
  ArrowRight,
  Bell,
  Calendar,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  CalendarSearch,
  Check,
  ClipboardList,
  Palette,
  PlayCircle,
  Scissors,
  Settings,
  Shield,
  Smartphone,
  Sparkles,
  Star,
  RefreshCw,
  TrendingUp,
  User,
  Wallet,
  Zap,
} from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { DetailRelated } from "@/components/site/detail-page-sections";
import { findProductDetailPage } from "@/lib/marketing/product-detail-content";

const page = findProductDetailPage("bookings")!;

export const metadata: Metadata = {
  title: page.metaTitle,
  description: page.metaDescription,
  alternates: { canonical: "https://noxtill.com/product/bookings/" },
  openGraph: {
    type: "website",
    url: "https://noxtill.com/product/bookings/",
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
        { "@type": "ListItem", position: 3, name: "Bookings", item: "https://noxtill.com/product/bookings/" },
      ],
    },
    {
      "@type": "Article",
      headline: page.metaTitle,
      description: page.metaDescription,
      url: "https://noxtill.com/product/bookings/",
    },
  ],
};

const SERVICES = [
  { icon: User, name: "Consultation", duration: "30 min", price: "$30", selected: false },
  { icon: Scissors, name: "Hair Cut", duration: "45 min", price: "$45", selected: true },
  { icon: Palette, name: "Hair Color", duration: "90 min", price: "$90", selected: false },
  { icon: Sparkles, name: "Facial", duration: "60 min", price: "$70", selected: false },
];

const JOURNEY_STEPS = [
  { icon: CalendarSearch, title: "Find Availability", description: "Customers see your real-time availability and choose a time that works for them." },
  { icon: CalendarPlus, title: "Book Instantly", description: "They enter their details and confirm the appointment in just a few clicks." },
  { icon: Bell, title: "Get Reminders", description: "Automated reminders keep customers informed and reduce no-shows." },
  { icon: CalendarCheck, title: "Appointment Day", description: "Everything is ready — your team, notes, and customer history in one place." },
  { icon: Star, title: "Review & Follow Up", description: "Collect feedback, improve service and build long-term relationships." },
];

const SCHEDULE_CHECKLIST = [
  "Multiple staff & service management",
  "Custom working hours & buffer times",
  "Walk-in, waitlist & recurring appointments",
  "Sync with Google Calendar",
  "Mobile-friendly for you and your clients",
];

const CALENDAR_DAYS = ["Mon 12", "Tue 13", "Wed 14", "Thu 15", "Fri 16", "Sat 17", "Sun 18"];
const CALENDAR_HOURS = ["9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM"];

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-emerald-50 border-emerald-200 text-emerald-700",
  progress: "bg-blue-50 border-blue-200 text-blue-700",
  pending: "bg-violet-50 border-violet-200 text-violet-700",
  walkin: "bg-amber-50 border-amber-200 text-amber-700",
};

const APPOINTMENTS = [
  { day: 1, hour: 2, span: 1, label: "Consultation", time: "10:00 AM", who: "Sarah", status: "confirmed" },
  { day: 1, hour: 6, span: 1, label: "Consultation", time: "3:00 AM", who: "Mike", status: "confirmed" },
  { day: 2, hour: 3, span: 1, label: "Hair Cut", time: "11:00 AM", who: "Mike", status: "progress" },
  { day: 2, hour: 5, span: 1, label: "Hair Color", time: "1:00 PM", who: "Mike", status: "progress" },
  { day: 3, hour: 6, span: 1, label: "Massage", time: "2:00 PM", who: "Emma", status: "walkin" },
  { day: 4, hour: 1, span: 1, label: "Facial", time: "9:00 AM", who: "Sarah", status: "pending" },
  { day: 6, hour: 3, span: 1, label: "Hair Cut", time: "11:00 AM", who: "Sarah", status: "confirmed" },
];

const LEGEND = [
  { label: "Confirmed", dot: "bg-emerald-500" },
  { label: "In Progress", dot: "bg-blue-500" },
  { label: "Pending", dot: "bg-violet-500" },
  { label: "Walk-in", dot: "bg-amber-500" },
  { label: "Unavailable", dot: "bg-fg-faint" },
];

const BUSINESS_BENEFITS = [
  { icon: RefreshCw, title: "Save Time", description: "Automate scheduling, reminders and follow-ups so you can focus on serving clients." },
  { icon: Bell, title: "Fewer No-Shows", description: "Smart reminders and easy rescheduling keep your schedule full and your time respected." },
  { icon: TrendingUp, title: "Grow Your Business", description: "More bookings, better reviews and stronger customer relationships drive long-term growth." },
  { icon: Shield, title: "Professional Experience", description: "Give your customers a smooth, modern booking experience that builds trust in your brand." },
  { icon: Smartphone, title: "Access Anywhere", description: "Manage your schedule from any device, anytime, wherever you are." },
  { icon: Settings, title: "Fully Connected", description: "Bookings connect with customers, orders, payments and reports inside Noxtill." },
];

export default function BookingsPage() {
  return (
    <div data-theme="light" className="flex min-h-dvh flex-col bg-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />

      <main className="flex-1">
        

        {/* Hero */}
        <section className="relative mt-5 overflow-hidden px-5 pb-4 pt-0 sm:px-7 sm:pb-5 sm:pt-0">
          <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-14 gap-y-12">
            <div className="min-w-[300px] max-w-[500px] flex-1 basis-[420px]">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#e3fbf1] px-3.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#0b7a4c]">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Bookings
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
                  Start Taking Bookings <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link
                  href="#journey"
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

            <div className="flex min-h-[520px] min-w-[320px] flex-1 basis-[480px] items-center justify-center">
              <div className="w-[280px] rounded-md border border-border-strong bg-white p-4 shadow-[0_30px_70px_-30px_rgba(13,21,18,0.4)] sm:w-[300px]">
                <p className="mb-3 text-[13px] font-semibold text-fg">Book Your Appointment</p>
                <div className="mb-3 flex items-center gap-1 text-[9px] font-medium text-fg-faint">
                  <span className="flex items-center gap-1 text-accent">
                    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-[7px] text-white">1</span> Service
                  </span>
                  <span className="mx-0.5 h-px flex-1 bg-border" />
                  <span className="flex items-center gap-1">
                    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-border text-[7px]">2</span> Time
                  </span>
                  <span className="mx-0.5 h-px flex-1 bg-border" />
                  <span className="flex items-center gap-1">
                    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-border text-[7px]">3</span> Details
                  </span>
                  <span className="mx-0.5 h-px flex-1 bg-border" />
                  <span className="flex items-center gap-1">
                    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-border text-[7px]">4</span> Confirm
                  </span>
                </div>

                <p className="mb-2 text-[10.5px] font-medium text-fg-muted">Select a Service</p>
                <div className="mb-3 flex flex-col gap-1.5">
                  {SERVICES.map((s) => (
                    <div
                      key={s.name}
                      className={`flex items-center gap-2 rounded-md border p-2 ${s.selected ? "border-accent bg-[#e3fbf1]" : "border-border bg-white"}`}
                    >
                      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-white">
                        <s.icon className="h-3 w-3 text-accent" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[10.5px] font-medium text-fg">{s.name}</p>
                        <p className="text-[9px] text-fg-faint">{s.duration}</p>
                      </div>
                      <span className="flex-none text-[10.5px] font-semibold text-fg">{s.price}</span>
                    </div>
                  ))}
                </div>

                <div className="rounded-md bg-primary py-2 text-center text-[11.5px] font-semibold text-primary-foreground">Continue →</div>
              </div>
            </div>
          </div>
        </section>

        {/* The booking journey */}
        <section id="journey" className="px-5 sm:px-7">
          <div className="mx-auto max-w-[1320px] rounded-md border bg-surface-deep p-6 sm:p-8">
            <h2 className="mb-8 text-center font-display text-[24px] font-bold tracking-tight text-white">The Booking Journey</h2>

            <div className="relative">
              <div className="absolute left-[8%] right-[8%] top-[26px] hidden border-t border-dashed border-[#d8cba8] sm:block" aria-hidden />
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                {JOURNEY_STEPS.map((s, i) => (
                  <div key={s.title} className="relative flex flex-col items-center text-center">
                    <span className="relative z-10 mb-3 flex h-14 w-14 items-center justify-center rounded-full border-4 border-[#f8f3e8] bg-[#e3fbf1]">
                      <s.icon className="h-6 w-6 text-accent" aria-hidden />
                    </span>
                    <div className="mb-1 text-[13px] font-semibold text-white">
                      {i + 1}. {s.title}
                    </div>
                    <p className="max-w-[160px] text-[11px] leading-relaxed text-fg-on-deep-muted">{s.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Smarter way to manage schedule */}
        <section className="mt-10 px-5 sm:px-7">
          <div className="mx-auto flex max-w-[1320px] flex-wrap items-start gap-x-14 gap-y-10">
            <div className="min-w-[280px] max-w-[380px] flex-1">
              <h2 className="mb-4 text-balance font-display text-[28px] font-bold leading-[1.15] tracking-tight text-fg sm:text-[32px]">
                A Smarter Way to Manage Your Schedule
              </h2>
              <p className="mb-5 text-[14.5px] leading-relaxed text-fg-muted">
                Noxtill Bookings gives you a clear view of your day, week and month. Easily manage staff, services,
                locations and availability while keeping your calendar organized and stress-free.
              </p>
              <div className="mb-6 flex flex-col gap-2.5">
                {SCHEDULE_CHECKLIST.map((item) => (
                  <div key={item} className="flex items-center gap-2.5 text-[13px] text-fg">
                    <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[#e3fbf1]">
                      <Check className="h-3 w-3 text-accent" aria-hidden />
                    </span>
                    {item}
                  </div>
                ))}
              </div>
              <Link href="/product" className="text-[13.5px] font-medium text-primary hover:underline">
                Explore All Features →
              </Link>
            </div>

            <div className="min-w-[320px] flex-[2]">
              <div className="rounded-md border border-border bg-white p-4 sm:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-fg">
                    <button type="button" className="text-fg-faint">
                      ‹
                    </button>
                    May 12 – May 18, 2025
                    <button type="button" className="text-fg-faint">
                      ›
                    </button>
                  </div>
                  <div className="flex gap-1 rounded-md border border-border p-0.5 text-[10.5px]">
                    <span className="rounded-[4px] px-2 py-1 text-fg-muted">Day</span>
                    <span className="rounded-[4px] bg-surface-2 px-2 py-1 font-medium text-fg">Week</span>
                    <span className="rounded-[4px] px-2 py-1 text-fg-muted">Month</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <div className="grid min-w-[640px] grid-cols-[52px_repeat(7,1fr)] text-[10px]">
                    <div />
                    {CALENDAR_DAYS.map((d) => (
                      <div key={d} className="border-b border-border pb-1.5 text-center font-semibold text-fg">
                        {d}
                      </div>
                    ))}

                    {CALENDAR_HOURS.map((h, hi) => (
                      <Fragment key={h}>
                        <div className="border-b border-border py-2.5 pr-2 text-right text-[9.5px] text-fg-faint">{h}</div>
                        {CALENDAR_DAYS.map((_, di) => {
                          const appt = APPOINTMENTS.find((a) => a.day === di + 1 && a.hour === hi + 1);
                          return (
                            <div key={`c-${hi}-${di}`} className="border-b border-l border-border p-0.5">
                              {appt ? (
                                <div className={`rounded-[4px] border px-1.5 py-1 text-[9px] leading-tight ${STATUS_STYLES[appt.status]}`}>
                                  <p className="truncate font-semibold">{appt.label}</p>
                                  <p className="truncate">{appt.time}</p>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </Fragment>
                    ))}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-3">
                  {LEGEND.map((l) => (
                    <div key={l.label} className="flex items-center gap-1.5 text-[10.5px] text-fg-muted">
                      <span className={`h-2 w-2 rounded-full ${l.dot}`} aria-hidden /> {l.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Built for businesses that value time */}
        <section className="mt-10 px-5 sm:px-7">
          <div className="mx-auto max-w-[1320px] rounded-md border border-[#efe6d3] bg-[#f8f3e8] p-6 sm:p-8">
            <h2 className="mb-8 text-center font-display text-[22px] font-bold tracking-tight text-fg">Built for Businesses That Value Time</h2>
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
              {BUSINESS_BENEFITS.map((b) => (
                <div key={b.title} className="flex flex-col items-center text-center">
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#e3fbf1]">
                    <b.icon className="h-5 w-5 text-accent" aria-hidden />
                  </span>
                  <div className="mb-1 text-[13px] font-semibold text-fg">{b.title}</div>
                  <p className="text-[11px] leading-relaxed text-fg-muted">{b.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="relative mt-10 overflow-hidden bg-surface-deep px-5 py-7 sm:px-7 sm:py-8">
          <div className="relative mx-auto flex max-w-[1320px] flex-wrap items-center gap-10">
            <div className="min-w-[260px] flex-1 basis-[320px]">
              <h2 className="mb-4 text-balance font-display text-[28px] font-bold leading-[1.15] tracking-tight text-fg-on-deep">
                Your Time. Your Business. <span className="text-accent-on-deep">Better Booked.</span>
              </h2>
              <p className="mb-6 max-w-[38ch] text-[14px] leading-relaxed text-fg-on-deep-muted">
                Noxtill Bookings helps you turn every available slot into an opportunity to deliver great service and
                grow your business.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/book-a-demo"
                  className="inline-flex items-center gap-2 rounded-md bg-white px-5.5 py-3 text-[14px] font-semibold text-[#053b2a] transition-colors hover:bg-[#e6f5ee]"
                >
                  Start Taking Bookings <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link
                  href="/book-a-demo"
                  className="inline-flex items-center rounded-md border border-border-on-deep px-5.5 py-3 text-[14px] font-medium text-fg-on-deep transition-colors hover:border-fg-on-deep-muted"
                >
                  Book a Demo
                </Link>
              </div>
            </div>

            <div className="relative min-w-[220px] flex-1 basis-[260px]">
              <div className="relative mx-auto aspect-square w-full max-w-[260px] overflow-hidden rounded-full border-4 border-white/10">
                <Image
                  src="https://images.unsplash.com/photo-1752224543110-35faed040b91?w=600&q=80&auto=format&fit=crop"
                  alt="Cozy desk workspace"
                  fill
                  sizes="260px"
                  className="object-cover"
                />
              </div>
              <div className="absolute -bottom-4 -right-2 w-[170px] rounded-md border border-white/10 bg-[#03251b] p-3 shadow-[0_25px_55px_-25px_rgba(0,0,0,0.6)] sm:right-4">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-on-deep/20">
                    <Check className="h-3 w-3 text-accent-on-deep" aria-hidden />
                  </span>
                  <span className="text-[10.5px] font-semibold text-fg-on-deep">Booking Confirmed!</span>
                </div>
                <p className="text-[9px] text-fg-on-deep-faint">Hair Cut with Sarah</p>
                <p className="mb-2 text-[9px] text-fg-on-deep-faint">Friday, May 16, 2025 · 11:00 AM</p>
                <div className="flex flex-col gap-1">
                  <span className="rounded-[4px] border border-white/15 py-1 text-center text-[9px] font-medium text-fg-on-deep">Add to Calendar</span>
                  <span className="rounded-[4px] bg-accent-on-deep/15 py-1 text-center text-[9px] font-medium text-accent-on-deep">View My Booking</span>
                </div>
              </div>
            </div>

            <div className="min-w-[240px] flex-1 basis-[300px]">
              <p className="mb-4 font-display text-[15px] leading-relaxed text-fg-on-deep">&ldquo;{page.pullQuote}&rdquo;</p>
              <div className="flex items-center gap-3">
                <div className="relative h-10 w-10 flex-none overflow-hidden rounded-full">
                  <Image
                    src="https://images.unsplash.com/photo-1573496527892-904f897eb744?w=120&q=80&auto=format&fit=crop"
                    alt="Emma L., salon owner"
                    fill
                    sizes="40px"
                    className="object-cover"
                  />
                </div>
                <div>
                  <p className="text-[12.5px] font-semibold text-fg-on-deep">— Emma L.</p>
                  <p className="text-[11px] text-fg-on-deep-faint">Salon Owner</p>
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

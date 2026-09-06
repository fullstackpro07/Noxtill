import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock,
  CreditCard,
  Database,
  Inbox,
  Languages,
  MessageCircle,
  Package,
  PlayCircle,
  ShoppingCart,
  Sparkles,
  StickyNote,
  UserCog,
  Users,
  Zap,
} from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { Reveal } from "@/components/site/reveal";
import { DetailRelated } from "@/components/site/detail-page-sections";
import { UnifiedInboxLiveDemo } from "@/components/site/unified-inbox-live-demo";
import { findProductDetailPage } from "@/lib/marketing/product-detail-content";
import { INBOX_CHANNELS } from "@/lib/marketing/home-content";

const page = findProductDetailPage("inbox")!;

export const metadata: Metadata = {
  title: page.metaTitle,
  description: page.metaDescription,
  alternates: { canonical: "https://noxtill.com/product/inbox/" },
  openGraph: {
    type: "website",
    url: "https://noxtill.com/product/inbox/",
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
        { "@type": "ListItem", position: 3, name: "Unified Inbox", item: "https://noxtill.com/product/inbox/" },
      ],
    },
    {
      "@type": "Article",
      headline: page.metaTitle,
      description: page.metaDescription,
      url: "https://noxtill.com/product/inbox/",
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

const CONTEXT_FEATURES = [
  { icon: MessageCircle, title: "Conversation History", description: "All past conversations from any channel." },
  { icon: CreditCard, title: "Outstanding Payments", description: "Check any pending balances or credits." },
  { icon: Package, title: "Order & Purchase History", description: "See orders, returns and customer spending." },
  { icon: Clock, title: "Customer Timeline", description: "View important customer activities in one timeline." },
  { icon: StickyNote, title: "Notes & Tags", description: "Add private notes and tags to stay organized." },
  { icon: Database, title: "Custom Fields", description: "Store and view important customer information." },
];

const TIMELINE = [
  { icon: Package, label: "Order #NXT-4587 Placed", time: "May 8, 2025 · 10:15 AM", tone: "text-blue-600", bg: "bg-blue-50" },
  { icon: CreditCard, label: "Payment of $120 Received", time: "May 8, 2025 · 10:16 AM", tone: "text-accent", bg: "bg-[#e3fbf1]" },
  { icon: MessageCircle, label: "WhatsApp Conversation", time: "May 9, 2025 · 09:20 AM", tone: "text-emerald-600", bg: "bg-emerald-50" },
  { icon: Package, label: "Order #NXT-4587 Shipped", time: "May 9, 2025 · 04:45 PM", tone: "text-blue-600", bg: "bg-blue-50" },
  { icon: MessageCircle, label: "Email Sent (Shipping Update)", time: "May 9, 2025 · 04:46 PM", tone: "text-violet-600", bg: "bg-violet-50" },
];

const REPLY_FEATURES = [
  { icon: Sparkles, title: "AI Reply Suggestions", description: "Get smart reply suggestions based on conversation context." },
  { icon: Languages, title: "Improve & Translate", description: "Improve tone, fix grammar or translate messages in one click." },
  { icon: StickyNote, title: "Saved Replies", description: "Use and manage quick replies for common questions." },
  { icon: Zap, title: "Automations", description: "Auto-assign, auto-reply and more to save hours every week." },
];

const TEAM_CHECKLIST = [
  "Assign conversations to the right team member",
  "Internal notes to discuss without customer seeing",
  "Snooze conversations and never forget",
  "Performance reports to track response times",
];

const CLOSING_CHECKLIST = [
  { icon: Inbox, label: "One inbox, every channel" },
  { icon: Users, label: "Full context per chat" },
  { icon: Zap, label: "Reply from anywhere" },
  { icon: Bell, label: "Nothing gets missed" },
];

export default function UnifiedInboxPage() {
  return (
    <div data-theme="light" className="flex min-h-dvh flex-col bg-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />

      <main className="flex-1">
        

        {/* Hero */}
        <section className="px-5 pb-8 pt-8 sm:px-7 sm:pb-10">
          <div className="mx-auto max-w-[1560px]">
            <div className="flex flex-wrap items-center gap-x-14 gap-y-10">
              <div className="min-w-[300px] max-w-[460px] flex-1 basis-[400px]">
                <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">Unified Inbox</p>
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
                    href="#channels"
                    className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-md border border-border-strong px-3.5 py-2.5 text-[12.5px] font-medium text-fg transition-colors hover:border-accent hover:text-primary sm:gap-2 sm:px-6 sm:py-3.5 sm:text-[15px]"
                  >
                    See How It Works <PlayCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                  </Link>
                </div>
              </div>

              <Reveal delay={0} className="min-w-[320px] flex-1 basis-[660px]">
                <UnifiedInboxLiveDemo />
              </Reveal>
            </div>
          </div>
        </section>

        {/* Channels band */}
        <section id="channels" className="px-5 pb-8 sm:px-7">
          <div className="mx-auto max-w-[1560px] rounded-md border border-border bg-surface-2 px-6 py-8 sm:px-10">
            <h2 className="mb-6 text-center text-[14px] font-semibold text-fg">One Inbox. Every Channel.</h2>
            <p className="mx-auto mb-6 max-w-[52ch] text-center text-[12.5px] text-fg-muted">
              Connect the channels your customers love. Manage them in one powerful workspace.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
              {INBOX_CHANNELS.map((c) => (
                <div key={c.label} className="flex flex-col items-center gap-2">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white">
                    <Image src={c.src} alt={c.label} width={22} height={22} className="object-contain" />
                  </span>
                  <span className="text-[11.5px] text-fg-muted">{c.label}</span>
                </div>
              ))}
              <div className="flex flex-col items-center gap-2">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1877F2]">
                  <FacebookIcon className="h-5 w-5 text-white" />
                </span>
                <span className="text-[11.5px] text-fg-muted">Facebook</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-fg-muted">
                  <UserCog className="h-5 w-5" aria-hidden />
                </span>
                <span className="text-[11.5px] text-fg-muted">And More</span>
              </div>
            </div>
          </div>
        </section>

        {/* Full customer context */}
        <section className="px-5 pb-8 sm:px-7">
          <div className="mx-auto grid max-w-[1560px] grid-cols-1 gap-6 lg:grid-cols-[0.9fr_1.4fr_0.9fr]">
            <div className="rounded-md border border-border bg-white p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="relative h-10 w-10 flex-none overflow-hidden rounded-full">
                    <Image
                      src="https://images.unsplash.com/photo-1573496527892-904f897eb744?w=100&q=80&auto=format&fit=crop"
                      alt="Sarah Johnson"
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-fg">Sarah Johnson</p>
                    <span className="inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-[9.5px] font-medium text-violet-700">VIP Customer</span>
                  </div>
                </div>
              </div>
              <div className="mb-4 flex flex-col gap-1.5 text-[11.5px] text-fg-muted">
                <span>+1 555-123-4567</span>
                <span>sarah.j@example.com</span>
                <span>New York, USA</span>
                <span>Customer since May 2024</span>
              </div>
              <p className="mb-2 text-[12px] font-semibold text-fg">Customer Overview</p>
              <div className="mb-4 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[15px] font-bold text-fg">18</p>
                  <p className="text-[9.5px] text-fg-faint">Total Orders</p>
                </div>
                <div>
                  <p className="text-[15px] font-bold text-fg">$1,246</p>
                  <p className="text-[9.5px] text-fg-faint">Total Spent</p>
                </div>
                <div>
                  <p className="text-[15px] font-bold text-rose-600">$120</p>
                  <p className="text-[9.5px] text-fg-faint">Outstanding</p>
                </div>
              </div>
              <p className="mb-2 text-[12px] font-semibold text-fg">Recent Orders</p>
              <div className="flex flex-col gap-1.5">
                {[
                  { id: "#NXT-4587", date: "May 8, 2025", status: "Shipped" },
                  { id: "#NXT-4432", date: "Apr 21, 2025", status: "Delivered" },
                  { id: "#NXT-4281", date: "Apr 10, 2025", status: "Delivered" },
                ].map((o) => (
                  <div key={o.id} className="flex items-center justify-between text-[11px]">
                    <div>
                      <span className="font-medium text-fg">{o.id}</span> <span className="text-fg-faint">{o.date}</span>
                    </div>
                    <span className="text-accent">{o.status}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="mb-2 text-balance font-display text-[24px] font-bold leading-[1.2] tracking-tight text-fg">
                Full Customer Context Right Where You Need It
              </h2>
              <p className="mb-6 max-w-[52ch] text-[13.5px] leading-relaxed text-fg-muted">
                See everything about your customer without leaving the conversation. Order history, past chats, notes,
                payments and more — all in one place.
              </p>
              <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
                {CONTEXT_FEATURES.map((f) => (
                  <div key={f.title} className="flex items-start gap-3">
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-md bg-[#e3fbf1]">
                      <f.icon className="h-[17px] w-[17px] text-accent" aria-hidden />
                    </span>
                    <div>
                      <p className="mb-0.5 text-[13px] font-semibold text-fg">{f.title}</p>
                      <p className="text-[11.5px] leading-relaxed text-fg-muted">{f.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-border bg-white p-5">
              <p className="mb-4 text-[13px] font-semibold text-fg">Customer Timeline</p>
              <div className="flex flex-col gap-4">
                {TIMELINE.map((t) => (
                  <div key={t.label} className="flex items-start gap-2.5">
                    <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-full ${t.bg}`}>
                      <t.icon className={`h-3.5 w-3.5 ${t.tone}`} aria-hidden />
                    </span>
                    <div>
                      <p className="text-[11.5px] font-medium text-fg">{t.label}</p>
                      <p className="text-[10px] text-fg-faint">{t.time}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Link href="/book-a-demo" className="mt-4 inline-block text-[12px] font-medium text-primary hover:underline">
                View Full Timeline →
              </Link>
            </div>
          </div>
        </section>

        {/* Reply faster */}
        <section className="px-5 pb-8 sm:px-7">
          <div className="relative mx-auto flex max-w-[1560px] flex-wrap items-center gap-x-10 gap-y-10 overflow-hidden rounded-md bg-surface-deep p-6 sm:p-8">
            <div className="relative min-w-[240px] max-w-[300px] flex-1">
              <div className="mb-3 flex items-center gap-3">
                <Image src="/marketing/ai-assistant-robot-cutout-1.png" alt="" width={56} height={68} className="h-[56px] w-[46px] flex-none object-contain" />
                <div className="flex flex-col gap-1 text-[10.5px]">
                  <span className="text-fg-on-deep-faint">
                    Tone: <span className="font-medium text-fg-on-deep">Friendly</span>
                  </span>
                  <span className="text-fg-on-deep-faint">
                    Language: <span className="font-medium text-fg-on-deep">English</span>
                  </span>
                  <span className="text-fg-on-deep-faint">
                    Length: <span className="font-medium text-fg-on-deep">Short</span>
                  </span>
                </div>
              </div>

              <div className="relative rounded-md border border-border bg-white p-4">
                <Sparkles className="absolute -left-2 -top-2 h-4 w-4 text-accent" aria-hidden />
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-fg">AI Suggested Reply</div>
                <p className="mb-3 text-[11.5px] leading-relaxed text-fg-muted">
                  Thanks for reaching out! Yes, we have this product available in size Medium. Would you like me to create the
                  order for you?
                </p>
                <span className="inline-block rounded-md bg-primary px-3 py-1.5 text-[10.5px] font-semibold text-primary-foreground">
                  Insert Reply
                </span>
              </div>
            </div>

            <div className="min-w-[260px] flex-1 basis-[340px]">
              <h2 className="mb-2 text-balance font-display text-[22px] font-bold leading-[1.2] tracking-tight text-fg-on-deep">
                Reply Faster. Write Better.
              </h2>
              <p className="mb-5 max-w-[46ch] text-[13.5px] leading-relaxed text-fg-on-deep-muted">
                Let AI help your team save time and respond with confidence across every conversation.
              </p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {REPLY_FEATURES.map((f) => (
                  <div key={f.title}>
                    <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-md bg-white/10">
                      <f.icon className="h-[17px] w-[17px] text-accent-on-deep" aria-hidden />
                    </span>
                    <p className="mb-1 text-[12px] font-semibold text-fg-on-deep">{f.title}</p>
                    <p className="text-[10.5px] leading-relaxed text-fg-on-deep-muted">{f.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative hidden min-w-[300px] flex-1 basis-[320px] rounded-md bg-white/5 p-5 lg:block">
              <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
                <line x1="50%" y1="27.6%" x2="50%" y2="43.1%" stroke="#a5b4fc" strokeWidth="1.5" />
                <line x1="20%" y1="37%" x2="80%" y2="37%" stroke="#a5b4fc" strokeWidth="1.5" />
                <line x1="20%" y1="27.6%" x2="20%" y2="37%" stroke="#a5b4fc" strokeWidth="1.5" />
                <line x1="80%" y1="27.6%" x2="80%" y2="37%" stroke="#a5b4fc" strokeWidth="1.5" />
                <line x1="50%" y1="63.8%" x2="50%" y2="70.7%" stroke="#a5b4fc" strokeWidth="1.5" />
              </svg>

              <div className="relative mb-9 flex items-center justify-between px-[20%]">
                <span className="flex h-11 w-11 items-center justify-center rounded-md bg-white shadow-sm">
                  <Image src="/brand/whatsapp.png" alt="WhatsApp" width={22} height={22} className="object-contain" />
                </span>
                <span className="flex h-11 w-11 items-center justify-center rounded-md bg-white shadow-sm">
                  <Image src="/brand/instagram.png" alt="Instagram" width={22} height={22} className="object-contain" />
                </span>
                <span className="flex h-11 w-11 items-center justify-center rounded-md bg-white shadow-sm">
                  <Image src="/brand/email.png" alt="Email" width={22} height={22} className="object-contain" />
                </span>
              </div>

              <div className="relative mb-4 flex items-center gap-2.5 rounded-md bg-white px-3.5 py-2.5 shadow-sm">
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-[#e3fbf1]">
                  <ShoppingCart className="h-3.5 w-3.5 text-accent" aria-hidden />
                </span>
                <span className="text-[11.5px] font-semibold text-fg">Auto-assign to Sales Team</span>
              </div>

              <div className="relative flex items-center gap-2.5">
                <div className="flex flex-1 items-center gap-2.5 rounded-md bg-white px-3.5 py-2.5 shadow-sm">
                  <span className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-blue-50">
                    <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" aria-hidden />
                  </span>
                  <span className="text-[11.5px] font-semibold text-fg">Auto-reply Sent</span>
                </div>
                <div className="flex flex-none -space-x-2">
                  {["photo-1758876019338-c190822f6ca0", "photo-1557425747-929b65a39785", "photo-1573496527892-904f897eb744"].map((id) => (
                    <div key={id} className="relative h-7 w-7 overflow-hidden rounded-full ring-2 ring-surface-deep">
                      <Image src={`https://images.unsplash.com/${id}?w=60&q=80&auto=format&fit=crop`} alt="" fill sizes="28px" className="object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Built for teams */}
        <section className="px-5 pb-8 sm:px-7">
          <div className="mx-auto flex max-w-[1560px] flex-wrap items-center gap-x-10 gap-y-8">
            <div className="min-w-[260px] flex-1 basis-[360px]">
              <h2 className="mb-2 text-balance font-display text-[24px] font-bold leading-[1.2] tracking-tight text-fg">
                Built for Teams Who Care About Customers
              </h2>
              <p className="mb-5 max-w-[46ch] text-[13.5px] leading-relaxed text-fg-muted">
                Collaborate seamlessly, stay accountable and deliver outstanding customer experiences together.
              </p>
              <div className="flex flex-col gap-2.5">
                {TEAM_CHECKLIST.map((item) => (
                  <div key={item} className="flex items-center gap-2.5 text-[13.5px] text-fg">
                    <CheckCircle2 className="h-4 w-4 flex-none text-accent" aria-hidden />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex min-w-[280px] flex-[1.6] basis-[620px] flex-wrap gap-4">
              <div className="min-w-[160px] flex-1 basis-[170px] rounded-md border border-border bg-white p-4">
                <p className="mb-3 text-[12px] font-semibold text-fg">Team</p>
                <div className="flex flex-col gap-2.5">
                  {[
                    { name: "John Smith", role: "Sales Team", dot: "bg-accent" },
                    { name: "Lisa Brown", role: "Support Team", dot: "bg-amber-500" },
                    { name: "Mark Wilson", role: "Support Team", dot: "bg-accent" },
                  ].map((m) => (
                    <div key={m.name} className="flex items-center gap-2.5">
                      <span className={`h-2 w-2 flex-none rounded-full ${m.dot}`} aria-hidden />
                      <div className="min-w-0">
                        <p className="truncate text-[11.5px] font-medium text-fg">{m.name}</p>
                        <p className="text-[10px] text-fg-faint">{m.role}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <Link href="/book-a-demo" className="mt-3 inline-block text-[11px] font-medium text-primary hover:underline">
                  + Add Team Member
                </Link>
              </div>

              <div className="min-w-[180px] flex-1 basis-[200px] rounded-md border border-border bg-white p-4">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-fg">
                  <StickyNote className="h-3.5 w-3.5 text-amber-600" aria-hidden /> Internal Note
                </div>
                <p className="mb-3 text-[11.5px] leading-relaxed text-fg-muted">
                  @Lisa Brown Can you please check the order status? Added by John Smith · 10:26 AM
                </p>
                <div className="rounded-md bg-surface-2 p-2.5">
                  <p className="text-[11px] font-medium text-fg">Lisa Brown</p>
                  <p className="text-[10.5px] leading-relaxed text-fg-muted">I&apos;ve checked. It will be delivered tomorrow.</p>
                  <p className="mt-1 text-[9px] text-fg-faint">10:27 AM</p>
                </div>
              </div>

              <div className="min-w-[280px] flex-[1.6] basis-[300px] rounded-md border border-border bg-white p-4">
                <p className="mb-3 text-[12px] font-semibold text-fg">Team Performance (This Month)</p>
                <div className="mb-4 grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-[16px] font-bold text-fg">2m 45s</p>
                    <p className="text-[10px] text-fg-faint">Avg. Response Time</p>
                    <p className="mt-0.5 text-[9.5px] text-accent">↓ 28%</p>
                  </div>
                  <div>
                    <p className="text-[16px] font-bold text-fg">1,247</p>
                    <p className="text-[10px] text-fg-faint">Conversations Closed</p>
                    <p className="mt-0.5 text-[9.5px] text-accent">↑ 18%</p>
                  </div>
                  <div>
                    <p className="text-[16px] font-bold text-fg">4.8 / 5</p>
                    <p className="text-[10px] text-fg-faint">Customer Satisfaction</p>
                    <p className="mt-0.5 text-[9.5px] text-accent">↑ 12%</p>
                  </div>
                </div>
                <svg viewBox="0 0 300 80" className="w-full" preserveAspectRatio="none" aria-hidden>
                  <defs>
                    <linearGradient id="perf-chart-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0ea86a" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#0ea86a" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0,58 L50,52 L100,48 L150,50 L200,30 L250,22 L300,18 L300,80 L0,80 Z"
                    fill="url(#perf-chart-fill)"
                  />
                  <path
                    d="M0,58 L50,52 L100,48 L150,50 L200,30 L250,22 L300,18"
                    fill="none"
                    stroke="#0ea86a"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {[
                    [0, 58],
                    [50, 52],
                    [100, 48],
                    [150, 50],
                    [200, 30],
                    [250, 22],
                    [300, 18],
                  ].map(([x, y]) => (
                    <circle key={x} cx={x} cy={y} r="2.5" fill="#0ea86a" />
                  ))}
                </svg>
                <div className="mt-1 flex justify-between text-[9px] text-fg-faint">
                  <span>May 1</span>
                  <span>May 8</span>
                  <span>May 15</span>
                  <span>May 22</span>
                  <span>May 29</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="relative mt-4 overflow-hidden bg-surface-deep px-5 py-7 sm:px-7 sm:py-8">
          <div className="relative mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-8">
            <div className="min-w-[280px] flex-1 basis-[440px]">
              <h2 className="mb-3 text-balance font-display text-[26px] font-bold leading-[1.15] tracking-tight text-fg-on-deep sm:text-[30px]">
                One Inbox. Happier Customers. Stronger Business.
              </h2>
              <p className="mb-6 max-w-[48ch] text-[13.5px] leading-relaxed text-fg-on-deep-muted">
                Bring all your conversations together with Noxtill Unified Inbox.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/book-a-demo"
                  className="inline-flex items-center gap-2 rounded-md bg-white px-5.5 py-3 text-[14px] font-semibold text-[#053b2a] transition-colors hover:bg-[#e6f5ee]"
                >
                  Book a Demo <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link
                  href="/book-a-demo"
                  className="inline-flex items-center rounded-md border border-border-on-deep px-5.5 py-3 text-[14px] font-medium text-fg-on-deep transition-colors hover:border-fg-on-deep-muted"
                >
                  See How It Works
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

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Calendar,
  CheckCircle2,
  Database,
  FileText,
  MessageCircle,
  Package,
  Settings,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";

export const metadata: Metadata = {
  title: "Business Assistant — Ask Your Business a Question | Noxtill",
  description: "Ask about sales, profit, stock or who owes money and get an answer from your connected data in seconds.",
  alternates: { canonical: "https://noxtill.com/product/assistant/" },
  openGraph: {
    type: "website",
    url: "https://noxtill.com/product/assistant/",
    title: "Business Assistant — Ask Your Business a Question | Noxtill",
    description: "Ask about sales, profit, stock or who owes money and get an answer from your connected data in seconds.",
  },
  twitter: { card: "summary_large_image", title: "Business Assistant — Ask Your Business a Question | Noxtill" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://noxtill.com/" },
        { "@type": "ListItem", position: 2, name: "Product", item: "https://noxtill.com/product/" },
        { "@type": "ListItem", position: 3, name: "Business Assistant", item: "https://noxtill.com/product/assistant/" },
      ],
    },
  ],
};

const QUICK_QUESTIONS = ["How much did we sell today?", "Which products are top performing?", "Who owes us money?", "What bookings are coming tomorrow?", "Show this week's profit"];

const SIDE_MODULES = [
  { icon: TrendingUp, label: "Sales" },
  { icon: Users, label: "Customers" },
  { icon: Calendar, label: "Bookings" },
  { icon: Package, label: "Inventory" },
  { icon: Wallet, label: "Credit" },
  { icon: TrendingUp, label: "Profit" },
  { icon: FileText, label: "Reports" },
];

const SCOPE_ITEMS = [
  { icon: TrendingUp, title: "Sales", description: "What you're selling" },
  { icon: Users, title: "Customers", description: "Who you're serving" },
  { icon: Calendar, title: "Bookings", description: "What's coming up" },
  { icon: Package, title: "Inventory", description: "What's in stock" },
  { icon: Wallet, title: "Credit", description: "Who owes what" },
  { icon: TrendingUp, title: "Profit", description: "What you're making" },
];

const DARK_QUESTIONS = ["Which products are moving fastest?", "Who still owes us money?", "What bookings are coming tomorrow?", "What changed this week?"];

const PRODUCT_TABLE = [
  { n: 1, product: "Cappuccino", qty: 124, revenue: "$620" },
  { n: 2, product: "Avocado Toast", qty: 98, revenue: "$960" },
  { n: 3, product: "Iced Latte", qty: 76, revenue: "$380" },
  { n: 4, product: "Blueberry Muffin", qty: 62, revenue: "$310" },
  { n: 5, product: "Chicken Sandwich", qty: 54, revenue: "$810" },
];

const RELATED_INFO = [
  { icon: Database, title: "Related Records", description: "View orders, customers and inventory" },
  { icon: Calendar, title: "Time Period", description: "Last 7 days" },
  { icon: Package, title: "Business Area", description: "Sales" },
  { icon: FileText, title: "Visualization", description: "Table + Chart" },
];

const ACTION_FLOW = [
  { icon: MessageCircle, title: "Ask" },
  { icon: Sparkles, title: "Understand" },
  { icon: Database, title: "Retrieve" },
  { icon: FileText, title: "Explain" },
  { icon: Settings, title: "Prepare" },
  { icon: CheckCircle2, title: "Approve" },
];

const ACTION_EXAMPLES = ["“Prepare today's marketing campaign.”", "“Create a report for this week.”", "“Send payment reminders to overdue customers.”"];

export default function BusinessAssistantPage() {
  return (
    <div data-theme="light" className="flex min-h-dvh flex-col bg-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden px-5 pb-16 pt-14 sm:px-7 sm:pb-10 sm:pt-10">
          <div className="pointer-events-none absolute inset-y-0 right-0 z-0 hidden w-[45%] lg:block">
            <Image
              src="https://images.unsplash.com/photo-1497366216548-37526070297c?w=900&q=80&auto=format&fit=crop"
              alt=""
              fill
              sizes="45vw"
              className="object-cover"
            />
            <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, #ffffff 0%, rgba(255,255,255,0.6) 30%, transparent 60%)" }} />
          </div>

          <div className="relative z-10 mx-auto max-w-[1320px]">
            <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">Powered by AI</p>
            <div className="grid grid-cols-1 gap-x-14 gap-y-12 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="max-w-[46ch]">
                <h1 className="text-balance font-display text-[38px] font-bold leading-[1.1] tracking-tight text-fg sm:text-[48px]">
                  Ask Your Business a <span className="text-accent">Question.</span>
                </h1>
                <p className="mt-4 max-w-[50ch] text-[14.5px] leading-relaxed text-fg-muted">
                  Noxtill Business Assistant helps you get clear, useful answers from your connected business
                  information. Ask naturally and see relevant data from your sales, customers, bookings, inventory,
                  credit, profit and more — without searching through multiple screens.
                </p>

                <div className="mt-6 flex items-center gap-2 rounded-full border border-border-strong bg-white p-1.5 pl-4 shadow-[0_10px_30px_-20px_rgba(13,21,18,0.3)]">
                  <Sparkles className="h-4 w-4 flex-none text-accent" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-fg-faint">Ask a question about your business…</span>
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {QUICK_QUESTIONS.map((q) => (
                    <span key={q} className="rounded-full border border-border-strong bg-white px-3.5 py-1.5 text-[12px] text-fg-muted">
                      {q}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1 rounded-md border border-border-strong bg-white p-4 shadow-[0_40px_80px_-40px_rgba(13,21,18,0.35)]">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-fg">
                      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary text-white">
                        <Bot className="h-3 w-3" aria-hidden />
                      </span>
                      Noxtill AI
                    </span>
                    <span className="text-fg-faint">⋯</span>
                  </div>

                  <div className="mb-2.5 ml-auto w-fit rounded-md rounded-br-none bg-surface-2 px-3 py-1.5 text-[11.5px] text-fg">
                    How much did we sell today?
                  </div>
                  <div className="mb-3 flex items-start gap-1.5">
                    <span className="mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full bg-[#e3fbf1]">
                      <Sparkles className="h-2.5 w-2.5 text-accent" aria-hidden />
                    </span>
                    <p className="text-[11px] text-fg-muted">Here&apos;s your sales overview for today:</p>
                  </div>

                  <div className="mb-3 rounded-md border border-border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div>
                        <p className="text-[9.5px] text-fg-faint">Total Sales</p>
                        <p className="font-display text-[20px] font-bold text-fg">
                          $4,320 <span className="text-[11px] font-semibold text-accent">↑ 12%</span>
                        </p>
                      </div>
                      <div className="flex h-8 items-end gap-0.5">
                        {[6, 10, 8, 14, 11, 16].map((h, i) => (
                          <span key={i} className="w-1.5 flex-none rounded-t-sm bg-accent" style={{ height: `${h}px` }} />
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 text-[10.5px]">
                      {[
                        ["Transactions", "28"],
                        ["Average Order", "$154"],
                        ["Top Product", "Cappuccino"],
                        ["Top Channel", "In-store"],
                      ].map(([label, value]) => (
                        <div key={label} className="flex items-center justify-between">
                          <span className="text-fg-faint">{label}</span>
                          <span className="font-medium text-fg">{value}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[9px] text-fg-faint">Based on your connected data · Today, 10:34 AM</p>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {["View Full Report", "Compare with Yesterday", "Show Top Products"].map((l) => (
                      <span key={l} className="rounded-md border border-border px-2.5 py-1 text-[10px] font-medium text-fg-muted">
                        {l}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="hidden flex-col gap-1.5 sm:flex">
                  {SIDE_MODULES.map((m) => (
                    <span key={m.label} className="flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-white px-2.5 py-1.5 text-[10.5px] text-fg">
                      <m.icon className="h-3 w-3 flex-none text-accent" aria-hidden /> {m.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Doesn't live in one screen */}
        <section className="px-5 pb-8 sm:px-7">
          <div className="mx-auto max-w-[1320px]">
            <h2 className="mb-2 text-balance font-display text-[26px] font-bold leading-[1.2] tracking-tight text-fg">
              The Business Doesn&apos;t Live in One Screen.
            </h2>
            <p className="mb-8 max-w-[70ch] text-[13.5px] leading-relaxed text-fg-muted">
              A single business question can require information from several areas. Noxtill is designed to retrieve
              the relevant context instead of making you search through separate screens.
            </p>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {SCOPE_ITEMS.map((s) => (
                <div key={s.title} className="rounded-md border border-border bg-white p-4">
                  <span className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-md bg-[#e3fbf1]">
                    <s.icon className="h-[17px] w-[17px] text-accent" aria-hidden />
                  </span>
                  <p className="text-[13px] font-semibold text-fg">{s.title}</p>
                  <p className="text-[11px] text-fg-muted">{s.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Ask naturally */}
        <section className="bg-surface-deep px-5 py-7 sm:px-7 sm:py-8">
          <div className="mx-auto max-w-[1320px]">
            <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-on-deep">Questions, not menus</p>
            <div className="grid grid-cols-1 gap-x-10 gap-y-10 lg:grid-cols-[0.7fr_1.2fr_0.7fr]">
              <div>
                <h2 className="mb-3 text-balance font-display text-[26px] font-bold leading-[1.2] tracking-tight text-fg-on-deep">
                  Ask Naturally. Get Relevant Answers.
                </h2>
                <p className="mb-6 max-w-[40ch] text-[13px] leading-relaxed text-fg-on-deep-muted">
                  Use plain language to ask about your business. No need to remember menus, filters or report names.
                </p>
                <div className="flex flex-col gap-2">
                  <span className="flex items-center justify-between rounded-md bg-primary px-3.5 py-2.5 text-[12.5px] font-medium text-primary-foreground">
                    How much did we sell today? <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  {DARK_QUESTIONS.map((q) => (
                    <span key={q} className="flex items-center justify-between rounded-md border border-white/15 px-3.5 py-2.5 text-[12.5px] text-fg-on-deep-muted">
                      {q} <ArrowRight className="h-3.5 w-3.5 flex-none opacity-50" aria-hidden />
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-md border border-white/10 bg-white p-4">
                <p className="mb-3 flex items-center gap-1.5 text-[12.5px] font-semibold text-fg">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary text-white">
                    <Bot className="h-3 w-3" aria-hidden />
                  </span>
                  Noxtill AI
                </p>
                <div className="mb-2.5 ml-auto w-fit rounded-md rounded-br-none bg-surface-2 px-3 py-1.5 text-[11.5px] text-fg">
                  Which products are moving fastest?
                </div>
                <div className="mb-3 flex items-start gap-1.5">
                  <span className="mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full bg-[#e3fbf1]">
                    <Sparkles className="h-2.5 w-2.5 text-accent" aria-hidden />
                  </span>
                  <p className="text-[11px] text-fg-muted">Here are your top products by quantity sold in the last 7 days:</p>
                </div>

                <div className="mb-3 overflow-x-auto rounded-md border border-border">
                  <table className="w-full min-w-[380px] text-left text-[11px]">
                    <thead>
                      <tr className="border-b border-border bg-surface-2 text-fg-faint">
                        <th className="px-2.5 py-1.5 font-medium">#</th>
                        <th className="px-2.5 py-1.5 font-medium">Product</th>
                        <th className="px-2.5 py-1.5 font-medium">Quantity</th>
                        <th className="px-2.5 py-1.5 font-medium">Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {PRODUCT_TABLE.map((r) => (
                        <tr key={r.product}>
                          <td className="px-2.5 py-1.5 text-fg-faint">{r.n}</td>
                          <td className="px-2.5 py-1.5 font-medium text-fg">{r.product}</td>
                          <td className="px-2.5 py-1.5 text-fg-muted">{r.qty}</td>
                          <td className="px-2.5 py-1.5 text-fg-muted">{r.revenue}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mb-3 flex items-center justify-between">
                  <span className="rounded-md border border-border px-2.5 py-1 text-[10.5px] font-medium text-fg-muted">View Full Product Report</span>
                  <span className="rounded-md border border-border px-2.5 py-1 text-[10.5px] text-fg-muted">7 days ⌄</span>
                </div>

                <div className="flex items-center gap-2 rounded-full border border-border-strong px-3.5 py-2">
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-fg-faint">Ask another question…</span>
                  <ArrowRight className="h-4 w-4 flex-none text-fg-faint" aria-hidden />
                </div>
              </div>

              <div className="flex flex-col gap-5">
                {RELATED_INFO.map((r) => (
                  <div key={r.title} className="flex items-start gap-3">
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-md bg-white/10">
                      <r.icon className="h-4 w-4 text-accent-on-deep" aria-hidden />
                    </span>
                    <div>
                      <p className="text-[13px] font-semibold text-fg-on-deep">{r.title}</p>
                      <p className="text-[11.5px] text-fg-on-deep-muted">{r.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* From question to action */}
        <section className="px-5 py-8 sm:px-7">
          <div className="mx-auto max-w-[1320px]">
            <div className="grid grid-cols-1 gap-x-14 gap-y-10 lg:grid-cols-[1.3fr_0.9fr]">
              <div>
                <h2 className="mb-2 text-balance font-display text-[24px] font-bold leading-[1.2] tracking-tight text-fg">From Question to Action.</h2>
                <p className="mb-8 max-w-[60ch] text-[13.5px] leading-relaxed text-fg-muted">
                  Where supported, Noxtill can help prepare reports or actions based on your request. Business-changing
                  actions remain subject to appropriate permissions and approval.
                </p>

                <div className="flex flex-wrap items-start gap-x-1 gap-y-6">
                  {ACTION_FLOW.map((s, i) => (
                    <div key={s.title} className="flex flex-1 items-start justify-center gap-1">
                      <div className="flex w-[84px] flex-none flex-col items-center gap-2 text-center">
                        <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-accent/40 bg-[#e3fbf1]">
                          <s.icon className="h-[18px] w-[18px] text-accent" aria-hidden />
                        </span>
                        <p className="text-[12px] font-semibold text-fg">{s.title}</p>
                      </div>
                      {i < ACTION_FLOW.length - 1 ? <ArrowRight className="mt-4 h-3.5 w-3.5 flex-none text-border-strong" aria-hidden /> : null}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-md border border-[#c8efdd] bg-[#f7fdfa] p-5">
                <p className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-fg">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#e3fbf1]">
                    <Zap className="h-4 w-4 text-accent" aria-hidden />
                  </span>
                  Need to take action?
                </p>
                <p className="mb-2 text-[12px] text-fg-muted">Try something like:</p>
                <div className="flex flex-col gap-2">
                  {ACTION_EXAMPLES.map((e) => (
                    <p key={e} className="text-[12.5px] italic leading-relaxed text-fg">
                      {e}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Closing */}
        <section className="relative overflow-hidden px-5 py-7 text-center sm:px-7 sm:py-8">
          

          <div className="relative z-10">
            <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">Powered by AI</p>
            <h2 className="mx-auto mb-3 max-w-[26ch] text-balance font-display text-[26px] font-bold leading-[1.25] tracking-tight text-fg sm:text-[32px]">
              Stop searching through your business. Start asking it.
            </h2>
            <p className="mx-auto mb-7 max-w-[54ch] text-[13.5px] leading-relaxed text-fg-muted">
              Get clear answers, useful insights and help with everyday tasks — all from your connected business data.
            </p>
            <Link
              href="/book-a-demo"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-[14px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              Explore Business Assistant <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

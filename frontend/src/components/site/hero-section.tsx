import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Bell, Check, ChevronDown, HeartPulse, PackageX, PlayCircle, Star, Users, Wallet } from "lucide-react";
import { Reveal } from "@/components/site/reveal";
import { HeroPhoneMockup } from "@/components/site/hero-phone-mockup";
import { HERO_CHANNELS, HERO_TRUST, INTEGRATION_BENEFITS, INTEGRATION_TOOLS } from "@/lib/marketing/home-content";

const SIDEBAR_ITEMS = ["Sales / POS", "Orders", "Products", "Bookings", "Customers", "Inventory", "Marketing", "Reports", "AI Assistant"];

const STAT_CARDS = [
  { label: "Total Sales", value: "$18,760", delta: "▲ 12.5% vs yesterday", trend: [8, 11, 9, 13, 12, 15, 18] },
  { label: "Total Profit", value: "$4,890", delta: "▲ 8.3% vs yesterday", trend: [6, 7, 9, 8, 10, 11, 13] },
  { label: "Orders", value: "128", delta: "▲ 11.2% vs yesterday", trend: [40, 55, 48, 60, 58, 66, 72] },
  { label: "Bookings", value: "18", delta: "▲ 6.6% vs yesterday", trend: [10, 9, 12, 11, 13, 12, 15] },
];

const SALES_LINE = [30, 42, 36, 55, 48, 68, 60];

const TOP_PRODUCTS = [
  { name: "Hair Shampoo", price: "$2,450", delta: "▲18%" },
  { name: "Hair Serum", price: "$1,890", delta: "▲12%" },
  { name: "Skin Cleanser", price: "$1,530", delta: "▲9%" },
  { name: "Face Cream", price: "$1,120", delta: "▲7%" },
  { name: "Body Lotion", price: "$980", delta: "▲5%" },
];

const QUICK_STATS = [
  { icon: PackageX, label: "Low Stock", value: "7 items", color: "#e0483f" },
  { icon: Wallet, label: "Outstanding", value: "$3,150", color: "#e8a93c" },
  { icon: Star, label: "Reviews", value: "4.8", color: "#7c5cf0" },
  { icon: Users, label: "Staff", value: "12", color: "#7c5cf0" },
  { icon: HeartPulse, label: "Health", value: "98%", color: "#0b8f5c" },
];

function Sparkline({ points, color = "#0ea86a" }: { points: number[]; color?: string }) {
  const w = 60;
  const h = 18;
  const max = Math.max(...points);
  const step = w / (points.length - 1);
  const path = points.map((p, i) => `${i * step},${h - (p / max) * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="mt-1 overflow-visible" aria-hidden>
      <polyline points={path} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />
    </svg>
  );
}

export function HeroSection() {
  return (
    <section className="overflow-hidden px-5 sm:px-7">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-12 gap-y-12 pt-10 sm:pt-14">
        <div className="min-w-[300px] max-w-[560px] flex-1 basis-[420px]">
          <h1 className="text-balance font-display text-4xl font-semibold leading-[1.08] tracking-[-0.035em] text-fg sm:text-5xl">
            AI-powered business management software{" "}
            <span className="border-b-4 border-[#a9e8cb] pb-1.5 text-accent">for small businesses.</span>
          </h1>

          <p className="mt-5 max-w-[50ch] text-[15.5px] leading-relaxed text-fg-muted">
            Noxtill is an AI-powered{" "}
            <Link href="/product" className="text-primary hover:text-primary-hover">
              business management platform
            </Link>{" "}
            that brings sales, customers, bookings, orders, inventory, payments, marketing, communication and reporting into
            one connected system.
          </p>
          <p className="mt-3.5 max-w-[50ch] text-[15.5px] leading-relaxed text-fg-muted">
            Every night at a time you choose, it sends one message with the day&apos;s sales, profit, tomorrow&apos;s bookings
            and outstanding credit — and the{" "}
            <Link href="/product#assistant" className="text-primary hover:text-primary-hover">
              AI Business Assistant
            </Link>{" "}
            answers anything else you ask.
          </p>

          <div className="mt-7 grid max-w-[500px] grid-cols-2 gap-2.5 sm:grid-cols-4">
            {HERO_CHANNELS.map((channel) => (
              <div
                key={channel.title}
                className="rounded-[16px] border border-border bg-white p-3.5 text-center transition-colors hover:border-[#a9e8cb]"
              >
                <div className="mx-auto mb-3 flex h-[38px] w-[38px] items-center justify-center rounded-[10px] bg-surface-2">
                  <channel.icon className="h-[18px] w-[18px] text-accent" aria-hidden />
                </div>
                <div className="mb-1 font-display text-[13.5px] font-semibold text-fg">{channel.title}</div>
                <div className="text-[12px] leading-snug text-fg-faint">{channel.description}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2.5 rounded-[14px] bg-primary px-6.5 py-4 text-[15.5px] font-medium text-primary-foreground shadow-[0_12px_26px_-16px_rgba(11,143,78,0.9)] transition-colors hover:bg-primary-hover"
            >
              Start 14-Day Free Trial <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/book-a-demo"
              className="inline-flex items-center gap-2.5 rounded-[14px] border border-border-strong bg-white px-6 py-4 text-[15.5px] font-medium text-fg transition-colors hover:border-primary hover:text-accent"
            >
              <PlayCircle className="h-[18px] w-[18px]" aria-hidden />
              Book a Demo
            </Link>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-4.5 gap-y-2 text-[12.5px] text-fg-muted">
            {HERO_TRUST.map((item) => (
              <span key={item} className="inline-flex items-center gap-1.5">
                <Check className="h-[15px] w-[15px] text-accent" aria-hidden />
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-1 basis-[260px] items-center justify-center">
          <HeroPhoneMockup />
        </div>
      </div>

      {/* Dashboard composition — the animated phone lives up in the hero row beside the text; this is
          the rest of the "product in action" visual: three notification cards on the left, the
          dashboard laptop in the middle, two more cards on the right. One row at desktop width,
          stacking down to a single column on small screens. */}
      <div className="relative mx-auto mt-16 max-w-[1360px] pb-6 sm:mt-20">
        <div
          className="pointer-events-none absolute inset-[6%_10%_10%_10%] rounded-full opacity-70"
          style={{ background: "radial-gradient(60% 60% at 50% 40%, #e7f8f1 0%, rgba(255,255,255,0) 70%)" }}
          aria-hidden
        />

        <div className="relative flex flex-wrap items-center justify-center gap-x-6 gap-y-10 lg:flex-nowrap lg:items-center lg:gap-x-4">
          <div className="hidden w-[196px] flex-none flex-col gap-4 lg:flex">
            <MiniCard>
              <div className="mb-2 flex items-center gap-2">
                <Image src="/brand/whatsapp.png" alt="" width={20} height={20} className="h-5 w-5 rounded-full object-cover" />
                <span className="text-[11px] font-medium text-fg-muted">You</span>
                <span className="ml-auto text-[9px] text-fg-faint">11:30 AM</span>
              </div>
              <div className="rounded-[10px_10px_3px_10px] bg-[#d9fdd3] px-2.5 py-2 text-[11px] leading-tight text-fg">
                Give me today&apos;s business report
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-[6px] bg-accent font-display text-[11px] font-bold text-white">
                  N
                </span>
                <span className="text-[11px] font-medium text-fg-muted">Noxtill</span>
                <span className="ml-auto text-[9px] text-fg-faint">11:31 AM</span>
              </div>
              <div className="mt-1.5 rounded-[10px_10px_10px_3px] bg-surface-2 px-2.5 py-2 text-[11px] text-fg">Report is ready ✅</div>
            </MiniCard>

            <MiniCard>
              <div className="text-[10.5px] text-fg-faint">To: you@yourbusiness.com</div>
              <div className="mt-1 text-[11px] text-fg">Subject: Daily Business Report</div>
              <div className="mt-2 flex items-center gap-2 rounded-[10px] border border-border p-2">
                <span className="h-4 w-4 flex-none rounded-[4px] bg-[#f42b3d]" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate text-[10.5px] text-fg">Daily_Report.pdf</span>
                  <span className="block text-[9px] text-fg-faint">1.2 MB</span>
                </span>
              </div>
            </MiniCard>

            <MiniCard>
              <div className="mb-2.5 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[#0b8f5c]">
                <Check className="h-[15px] w-[15px] text-white" aria-hidden />
              </div>
              <div className="flex items-center gap-2 rounded-[10px] border border-border p-2">
                <span className="h-[18px] w-[18px] flex-none rounded-[5px] bg-[#e3fbf1]" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate text-[10.5px] text-fg">Customer_List.xlsx</span>
                  <span className="block text-[9px] text-fg-faint">892 KB · Excel</span>
                </span>
                <Check className="h-3.5 w-3.5 flex-none text-accent" aria-hidden />
              </div>
              <div className="mt-2.5 text-[11px] text-fg">428 records imported</div>
              <div className="mt-0.5 text-[9.5px] text-accent">Successfully</div>
            </MiniCard>
          </div>

          <div className="flex min-w-0 flex-none items-center">
            <div className="w-[560px] max-w-[62vw] min-w-[300px] sm:max-w-[560px]">
              <div className="rounded-[18px_18px_7px_7px] bg-[#111c22] p-2.5 shadow-[0_40px_80px_-50px_rgba(13,21,18,0.55)]">
                <div className="grid grid-cols-1 overflow-hidden rounded-[11px] bg-white sm:grid-cols-[128px_minmax(0,1fr)]">
                  <aside className="hidden flex-col border-r border-border bg-surface-2 p-2.5 sm:flex">
                    <div className="mb-3.5 flex items-center gap-1.5 px-1">
                      <span className="flex h-5 w-5 items-center justify-center rounded-[6px] bg-accent font-display text-xs font-bold text-white">
                        N
                      </span>
                      <span className="font-display text-[13px] font-semibold text-fg">Noxtill</span>
                    </div>
                    <div className="flex flex-1 flex-col gap-0.5 text-[10px] text-fg-muted">
                      <div className="flex items-center gap-2 rounded-[8px] bg-[#e3fbf1] px-2 py-1.5 font-medium text-[#0b8f5c]">
                        <span className="h-1.5 w-1.5 rounded-[2px] bg-accent" /> Dashboard
                      </div>
                      {SIDEBAR_ITEMS.map((item) => (
                        <div key={item} className="flex items-center gap-2 px-2 py-1.5">
                          <span className="h-1.5 w-1.5 rounded-[2px] bg-border-strong" /> {item}
                        </div>
                      ))}
                      <div className="px-2 py-1.5 text-fg-faint">~ More</div>
                    </div>
                    <div className="mt-2 border-t border-border pt-2 text-[8.5px] leading-snug text-fg-faint">
                      35+ connected business modules
                    </div>
                  </aside>

                  <div className="flex flex-col gap-2.5 p-3 sm:p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-sm font-semibold text-fg">Dashboard</span>
                      <div className="flex items-center gap-2">
                        <span className="hidden items-center gap-1 rounded-[8px] border border-border px-2 py-1 text-[9.5px] text-fg-muted sm:flex">
                          Main Branch <ChevronDown className="h-2.5 w-2.5" aria-hidden />
                        </span>
                        <span className="relative flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full border border-border text-fg-faint">
                          <Bell className="h-3 w-3" aria-hidden />
                          <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[#f42b3d]" />
                        </span>
                        <div className="h-[22px] w-[22px] flex-none rounded-full bg-border" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {STAT_CARDS.map((stat) => (
                        <div key={stat.label} className="rounded-[11px] border border-border p-2.5">
                          <div className="text-[10px] text-fg-faint">{stat.label}</div>
                          <div className="my-0.5 font-display text-[15px] font-semibold tracking-[-0.02em] text-fg">{stat.value}</div>
                          <div className="text-[8.5px] leading-tight text-accent">{stat.delta}</div>
                          <Sparkline points={stat.trend} />
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1.4fr_1fr]">
                      <div className="rounded-[11px] border border-border p-2.5">
                        <div className="mb-1 flex items-baseline justify-between">
                          <div className="font-display text-xs font-semibold text-fg">Sales Overview</div>
                          <div className="text-[9px] text-fg-faint">This Week</div>
                        </div>
                        <div className="mb-1.5 flex items-baseline justify-between">
                          <div className="font-display text-sm font-semibold text-fg">$18,760</div>
                          <div className="text-[9px] text-fg-faint">Today</div>
                        </div>
                        <svg viewBox="0 0 260 56" className="h-[56px] w-full" preserveAspectRatio="none" aria-hidden>
                          <polyline
                            points={SALES_LINE.map((v, i) => `${(i * 260) / (SALES_LINE.length - 1)},${56 - (v / 70) * 56}`).join(" ")}
                            fill="none"
                            stroke="#0ea86a"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <circle
                            cx={(5 * 260) / (SALES_LINE.length - 1)}
                            cy={56 - (SALES_LINE[5] / 70) * 56}
                            r={3.2}
                            fill="#0ea86a"
                            stroke="white"
                            strokeWidth={1.4}
                          />
                        </svg>
                        <div className="mt-1 flex justify-between text-[8px] text-fg-faint">
                          {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => (
                            <span key={d}>{d}</span>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-[11px] border border-border p-2.5">
                        <div className="mb-2 flex items-baseline justify-between">
                          <div className="font-display text-xs font-semibold text-fg">Top Products</div>
                          <div className="text-[8.5px] text-primary">View all</div>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {TOP_PRODUCTS.map((product) => (
                            <div key={product.name} className="flex items-center gap-2 text-[9.5px] text-fg-muted">
                              <span className="h-3.5 w-3.5 flex-none rounded-[4px] bg-surface-2" />
                              <span className="flex-1 truncate">{product.name}</span>
                              <span className="flex-none text-fg">{product.price}</span>
                              <span className="flex-none text-accent">{product.delta}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="hidden grid-cols-5 gap-1.5 border-t border-border pt-2.5 sm:grid">
                      {QUICK_STATS.map((stat) => (
                        <div key={stat.label} className="flex flex-col items-center gap-1 text-center">
                          <stat.icon className="h-3 w-3" style={{ color: stat.color }} aria-hidden />
                          <span className="text-[8px] leading-none text-fg-faint">{stat.label}</span>
                          <span className="font-display text-[10.5px] font-semibold leading-none text-fg">{stat.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="mx-[-8px] h-3 rounded-[0_0_14px_14px]" style={{ background: "linear-gradient(180deg,#1f2b31 0%,#0d181e 100%)" }} />
            </div>
          </div>

          <div className="hidden w-[196px] flex-none flex-col gap-4 lg:flex">
            <MiniCard className="flex-row items-center gap-2.5">
              <span className="h-4 w-6 flex-none rounded-[4px] bg-[#f42b3d]" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-medium text-fg">Email delivered</span>
                <span className="block text-[10px] text-fg-faint">Daily_Report.pdf</span>
              </span>
              <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-accent">
                <Check className="h-3 w-3 text-white" aria-hidden />
              </span>
            </MiniCard>

            <MiniCard className="relative">
              <div className="font-display text-[13px] font-bold tracking-[0.02em] text-fg">NOXTILL</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-fg-faint">Daily business report</div>
              <div className="mt-1.5 text-[9px] text-fg-faint">18 May 2026</div>
              <div className="mt-2.5 flex flex-col gap-1.5 text-[10.5px] text-fg-muted">
                {[
                  ["Sales", "$18,760"],
                  ["Profit", "$4,890"],
                  ["Orders", "128"],
                  ["Bookings", "18"],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-2.5">
                    <span>{label}</span>
                    <span className="font-medium text-fg">{value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex h-[40px] items-end gap-1">
                {[40, 62, 48, 76, 58, 88, 70].map((h, i) => (
                  <span key={i} className="flex-1 rounded-[2px] bg-accent/60" style={{ height: `${h}%` }} />
                ))}
              </div>
              <span className="absolute -bottom-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent">
                <Check className="h-3 w-3 text-white" aria-hidden />
              </span>
            </MiniCard>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-16 flex max-w-[1440px] flex-col items-center sm:mt-20">
        <div className="inline-flex items-center rounded-full px-7 py-2.5 text-center font-display text-sm font-semibold uppercase tracking-[0.04em] text-white" style={{ background: "linear-gradient(90deg,#0ea86a 0%,#095843 100%)" }}>
          Connects with the tools your business already uses
        </div>

        <h2 className="mt-7 text-balance text-center font-display text-[38px] font-bold leading-tight tracking-[-0.03em] text-fg sm:text-5xl">
          Business software <span className="text-accent">integrations</span>
          <br className="hidden sm:block" /> that keep your <span className="text-[#095843]">data connected</span>
        </h2>

        <p className="mt-5 max-w-[74ch] text-center text-lg leading-relaxed text-fg-muted">
          Noxtill connects the business tools you already use so important information can move between systems instead of
          staying trapped in separate apps. Connect ecommerce, payments, accounting, marketing, communication and business
          listing services to create a more connected workflow — reducing repeated data entry, improving operational
          visibility and letting teams work from consistent customer and business information.
        </p>

        <p className="mt-3.5 max-w-[74ch] text-center text-[15px] leading-relaxed text-fg-faint">
          Popular connections:{" "}
          <Link href="/integrations-directory" className="text-primary hover:text-primary-hover">
            Shopify integration
          </Link>
          ,{" "}
          <Link href="/integrations-directory" className="text-primary hover:text-primary-hover">
            WooCommerce integration
          </Link>
          ,{" "}
          <Link href="/integrations-directory" className="text-primary hover:text-primary-hover">
            QuickBooks integration
          </Link>
          ,{" "}
          <Link href="/integrations-directory" className="text-primary hover:text-primary-hover">
            Stripe integration
          </Link>{" "}
          and{" "}
          <Link href="/integrations-directory" className="text-primary hover:text-primary-hover">
            WhatsApp integration
          </Link>{" "}
          — or{" "}
          <Link href="/integrations-directory" className="text-primary hover:text-primary-hover">
            view all integrations
          </Link>
          .
        </p>

        <div className="mt-10 grid w-full grid-cols-1 gap-x-5 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {INTEGRATION_BENEFITS.slice(0, 4).map((benefit, i) => (
            <div key={benefit.title} className={`flex min-w-0 items-start gap-3.5 ${i < 3 ? "sm:border-r sm:border-border sm:pr-4.5" : ""}`}>
              <div className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-full bg-white shadow-[0_6px_18px_-10px_rgba(13,21,18,0.28)]">
                <benefit.icon className="h-[22px] w-[22px] text-[#0b8f5c]" aria-hidden />
              </div>
              <div className="min-w-0">
                <div className="mb-1 text-balance font-display text-[15px] font-semibold text-fg">{benefit.title}</div>
                <div className="text-[13.5px] leading-snug text-fg-muted">{benefit.description}</div>
              </div>
            </div>
          ))}
        </div>

        {(() => {
          const fifthBenefit = INTEGRATION_BENEFITS[4];
          if (!fifthBenefit) return null;
          const FifthIcon = fifthBenefit.icon;
          return (
            <div className="mt-6 flex w-full justify-center">
              <div className="flex min-w-0 max-w-[280px] items-start gap-3.5">
                <div className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-full bg-white shadow-[0_6px_18px_-10px_rgba(13,21,18,0.28)]">
                  <FifthIcon className="h-[22px] w-[22px] text-[#0b8f5c]" aria-hidden />
                </div>
                <div className="min-w-0">
                  <div className="mb-1 text-balance font-display text-[15px] font-semibold text-fg">{fifthBenefit.title}</div>
                  <div className="text-[13.5px] leading-snug text-fg-muted">{fifthBenefit.description}</div>
                </div>
              </div>
            </div>
          );
        })()}

        <div className="mt-10 flex w-full items-center gap-5 border-t border-border pt-8">
          <span className="hidden h-px flex-1 sm:block" style={{ background: "linear-gradient(90deg,#c8efdd 0%,#ffffff 100%)" }} />
          <div className="whitespace-nowrap text-center font-display text-lg font-semibold tracking-[-0.01em] text-fg sm:text-xl">
            <span className="text-accent">70+ Tools.</span> One Powerful Connection.
          </div>
          <span className="hidden h-px flex-1 sm:block" style={{ background: "linear-gradient(90deg,#ffffff 0%,#c8efdd 100%)" }} />
        </div>

        <div className="mt-8 flex w-full flex-wrap items-start justify-center gap-x-6 gap-y-7">
          {INTEGRATION_TOOLS.map((tool, i) => (
            <Reveal key={tool.id} delay={(i % 8) * 55} className="flex w-[104px] flex-col items-center gap-2.5">
              <div className="flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-[18px] border border-border bg-white p-3 shadow-[0_10px_26px_-16px_rgba(13,21,18,0.4)]">
                <Image src={tool.src} alt={`${tool.label} integration available with Noxtill`} width={44} height={44} className="max-h-full max-w-full object-contain" />
              </div>
              <div className="text-center text-[12.5px] leading-snug text-fg">{tool.label}</div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function MiniCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col rounded-[14px] border border-[#e9edeb] bg-white p-3 shadow-[0_14px_34px_-24px_rgba(13,21,18,0.45)] ${className}`}>
      {children}
    </div>
  );
}

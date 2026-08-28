import Link from "next/link";
import { ArrowRight, PlayCircle, Sparkles } from "lucide-react";
import { Reveal } from "@/components/site/reveal";
import { FINAL_CTA_FEATURES, FINAL_CTA_TRUST } from "@/lib/marketing/home-content";

export function FinalCtaSection() {
  return (
    <section className="px-5 pt-16 sm:px-7 sm:pt-14">
      <div className="mx-auto max-w-[1560px] overflow-hidden rounded-[var(--radius-xl)] border border-border">
        <h2 className="mb-2 mt-10 text-balance text-center font-display text-4xl font-semibold leading-[1.08] tracking-[-0.035em] text-fg sm:text-5xl">
              Everything Your Business Needs.
              <br />
              <span className="text-accent">One Place to Run It.</span>
            </h2>

        <div className="flex flex-wrap items-center gap-10 p-8 sm:p-11" style={{ background: "linear-gradient(135deg,#f7fbf9 0%,#ffffff 60%)" }}>
          <Reveal delay={0} className="min-w-[300px] max-w-[560px] flex-1 basis-[420px]">
            

            <p className="mb-2.5 max-w-[50ch] text-base leading-relaxed text-fg-muted">
              Noxtill brings all your conversations, calls, reviews, leads, and workflows together in one powerful platform.
              Save time, improve customer experience, build your reputation, and grow your business — faster than ever. Smart
              automation. Real results. Unlimited growth.
            </p>
            <div className="mb-7 text-base font-medium text-fg">
              Noxtill is <span className="text-accent">your partner in success.</span>
            </div>

            <div className="mb-6 flex flex-wrap gap-3.5">
              <Link
                href="/book-a-demo"
                className="inline-flex items-center gap-3 rounded-xl bg-primary px-7 py-4.5 text-base font-semibold text-primary-foreground shadow-[0_14px_30px_-18px_rgba(11,143,78,0.9)] transition-colors hover:bg-primary-hover"
              >
                Book a Demo <ArrowRight className="h-[18px] w-[18px]" aria-hidden />
              </Link>
              <Link
                href="/product"
                className="inline-flex items-center gap-2.5 rounded-xl border border-border-strong bg-white px-6.5 py-4.5 text-base font-medium text-fg hover:border-primary hover:text-accent"
              >
                <PlayCircle className="h-[19px] w-[19px]" aria-hidden /> See How It Works
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-[13.5px] text-fg-muted">
              {FINAL_CTA_TRUST.map((item, i) => (
                <span key={item} className="flex items-center gap-x-5">
                  {i > 0 ? <span className="h-4.5 w-px bg-border" /> : null}
                  {item}
                </span>
              ))}
            </div>
          </Reveal>

          <Reveal delay={110} className="min-w-[320px] flex-1 basis-[600px] overflow-hidden rounded-2xl border border-border bg-white shadow-[0_30px_70px_-50px_rgba(13,21,18,0.55)]">
            <div className="p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-display text-base font-semibold text-fg">Welcome back, Sarah! 👋</div>
                  <div className="mt-0.5 text-[11.5px] text-fg-faint">Here&apos;s what&apos;s happening with your business today.</div>
                </div>
                <span className="rounded-[10px] border border-border px-2.5 py-1.5 text-[11.5px] text-fg-muted">May 20 – May 26, 2025</span>
              </div>

              <div className="mb-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {[
                  { label: "Total Conversations", value: "1,248" },
                  { label: "New Leads", value: "346" },
                  { label: "Total Reviews", value: "128" },
                  { label: "Avg. Rating", value: "4.6" },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-xl border border-[#eef0ef] p-3">
                    <div className="text-[10.5px] text-fg-faint">{stat.label}</div>
                    <div className="mt-0.5 font-display text-xl font-semibold tracking-[-0.02em] text-fg">{stat.value}</div>
                    <div className="mt-1.5 text-[10px] text-accent">↑ 18%</div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2.5">
                <div className="min-w-[150px] flex-1 basis-[160px] rounded-xl border border-[#eef0ef] p-3">
                  <div className="mb-2.5 font-display text-[12.5px] font-semibold text-fg">Top Review Source</div>
                  <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-fg">Google</span>
                    <span className="font-display text-[13px] font-semibold text-fg">64</span>
                  </div>
                  <span className="block h-[5px] overflow-hidden rounded-full bg-[#eef0ef]">
                    <span className="block h-full w-1/2 bg-accent" />
                  </span>
                </div>
                <div className="min-w-[140px] flex-1 basis-[150px] rounded-xl border border-[#eef0ef] p-3">
                  <div className="mb-2.5 font-display text-[12.5px] font-semibold text-fg">AI Actions</div>
                  <div className="font-display text-xl font-semibold tracking-[-0.02em] text-fg">12</div>
                  <div className="mt-0.5 text-[10px] text-fg-faint">Tasks Completed</div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>

        <div className="grid grid-cols-2 border-t border-[#eceeed] sm:grid-cols-4 lg:grid-cols-8">
          {FINAL_CTA_FEATURES.map((feature, i) => (
            <div key={feature.title} className={`flex flex-col items-center gap-2.5 p-5.5 text-center ${i > 0 ? "border-l border-[#eceeed]" : ""}`}>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#e3fbf1]">
                <feature.icon className="h-[21px] w-[21px] text-accent" aria-hidden strokeWidth={1.8} />
              </span>
              <div className="font-display text-sm font-semibold text-fg">{feature.title}</div>
              <div className="text-xs leading-snug text-fg-faint">{feature.description}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-5 border-t border-[#eceeed] bg-[#f7faf8] px-7 py-7">
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-accent">
            <Sparkles className="h-5 w-5 text-white" aria-hidden />
          </span>
          <div className="text-center">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <span className="font-display text-[22px] font-semibold tracking-[-0.02em] text-fg">One connected platform for the whole business</span>
              <span className="text-lg tracking-[2px] text-[#f5a623]">★★★★★</span>
            </div>
            <div className="mt-1.5 text-sm text-fg-muted">All the tools you need. One simple platform. Endless possibilities.</div>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-[1560px]">
        <p className="mx-auto max-w-[108ch] text-center text-[14.5px] leading-relaxed text-fg-muted">
          Noxtill brings your sales, customers, bookings, inventory, payments, marketing, communication, reports, analytics,
          AI tools, and business operations together in one intelligent business management platform. Instead of switching
          between multiple apps and disconnected dashboards, your team can manage everyday work, understand real-time
          business performance, and make faster data-driven decisions from one connected system.
        </p>
        <div className="mt-4.5 text-center font-display text-[17px] font-semibold text-fg">
          One platform. One connected business. <span className="text-accent">One smarter way to grow.</span>
        </div>
      </div>
    </section>
  );
}

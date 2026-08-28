import Link from "next/link";
import Image from "next/image";
import { REPUTATION_FEATURES, REPUTATION_PLATFORMS } from "@/lib/marketing/home-content";
import { Reveal } from "@/components/site/reveal";

const RECENT_REVIEWS = [
  { src: "/brand/google.png", name: "Jessica M.", stars: 5, time: "2 hours ago", text: "Excellent service! The team was professional and very helpful.", status: "Replied" },
  { src: "/brand/meta.png", name: "Mark D.", stars: 4, time: "5 hours ago", text: "Great experience overall. Would recommend to others.", status: "Replied" },
  { src: "/brand/yelp.png", name: "Lisa K.", stars: 2, time: "1 day ago", text: "Service was fine but there is room for improvement on communication.", status: "Reply" },
];

const REVIEW_SOURCES = [
  { label: "Google", value: 642, pct: 100, color: "bg-accent" },
  { label: "Facebook", value: 248, pct: 62, color: "bg-[#1877f2]" },
  { label: "Trustpilot", value: 182, pct: 44, color: "bg-accent" },
  { label: "Yelp", value: 106, pct: 28, color: "bg-[#e0453a]" },
  { label: "Others", value: 70, pct: 16, color: "bg-fg-faint" },
];

function Stars({ count }: { count: number }) {
  return (
    <span className="text-[11px] tracking-[1px] text-[#f5a623]">
      {"★".repeat(count)}
      <span className="text-[#f0c98a]">{"★".repeat(5 - count)}</span>
    </span>
  );
}

export function ReputationSection() {
  return (
    <section className="bg-surface-tint-2 px-5 pt-16 sm:px-7 sm:pt-20">
      <div className="mx-auto max-w-[1560px]">
        <div className="mx-auto mb-10 max-w-[900px] text-center">
          <h2 className="mb-4 text-balance font-display text-4xl font-semibold leading-[1.14] tracking-[-0.035em] text-fg sm:text-5xl">
            Reputation management software for reviews, ratings <span className="text-accent">and customer feedback</span>
          </h2>
          <p className="mx-auto max-w-[68ch] text-[15px] leading-relaxed text-fg-muted">
            Noxtill Reputation Management helps you monitor reviews and feedback, respond professionally, understand customer
            sentiment and track reputation performance across supported platforms. Organise new reviews, unanswered feedback,
            ratings and trends in one place, with AI-assisted response drafts that you approve before they go out. See{" "}
            <Link href="/product#reviews" className="text-primary hover:text-primary-hover">
              reputation management
            </Link>{" "}
            or connect your{" "}
            <Link href="/integrations-directory" className="text-primary hover:text-primary-hover">
              Google Business Profile
            </Link>
            .
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <div className="flex min-w-[250px] max-w-[400px] flex-1 basis-[260px] flex-col gap-5.5">
            {REPUTATION_FEATURES.map((feature) => (
              <div key={feature.title} className="flex items-start gap-3.5">
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-[#d5eee2] bg-[#eefaf4]">
                  <feature.icon className="h-[19px] w-[19px] text-accent" aria-hidden strokeWidth={1.8} />
                </span>
                <div>
                  <div className="mb-1 font-display text-[15px] font-semibold text-fg">{feature.title}</div>
                  <div className="text-[13px] leading-relaxed text-fg-muted">{feature.description}</div>
                </div>
              </div>
            ))}
          </div>

          <Reveal delay={0} className="flex min-w-[320px] flex-1 basis-[640px] flex-wrap overflow-hidden rounded-[var(--radius-lg)] border border-border shadow-[0_24px_60px_-46px_rgba(13,21,18,0.5)]">
            <div className="flex-1 basis-[420px] p-4.5">
              <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2.5">
                <div className="font-display text-[17px] font-semibold text-fg">Reputation Overview</div>
                <span className="rounded-[10px] border border-border px-2.5 py-1.5 text-xs text-fg-muted">Last 30 Days</span>
              </div>

              <div className="mb-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {[
                  { label: "Average Rating", value: "4.6", extra: <Stars count={4} /> },
                  { label: "Total Reviews", value: "1,248" },
                  { label: "New Reviews", value: "146" },
                  { label: "Responded", value: "92%" },
                  { label: "Sentiment", value: "Positive", accent: true },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-2xl border border-[#eef0ef] p-3">
                    <div className="mb-1.5 text-[11.5px] text-fg-faint">{stat.label}</div>
                    <div className={`font-display text-[26px] font-semibold tracking-[-0.02em] ${stat.accent ? "text-accent" : "text-fg"}`}>{stat.value}</div>
                    {stat.extra ? <div className="mt-1">{stat.extra}</div> : null}
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-[#eef0ef] p-3.5">
                <div className="mb-3 flex items-baseline justify-between gap-2.5">
                  <div className="font-display text-[13.5px] font-semibold text-fg">Recent Reviews</div>
                  <Link href="/product#reviews" className="text-[11.5px] text-primary hover:text-primary-hover">
                    View All
                  </Link>
                </div>
                <div className="flex flex-col gap-3">
                  {RECENT_REVIEWS.map((review) => (
                    <div key={review.name} className="flex items-center gap-2.5">
                      <Image src={review.src} alt="" width={20} height={20} className="h-5 w-5 flex-none object-contain" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[12.5px] font-medium text-fg">{review.name}</span>
                          <Stars count={review.stars} />
                          <span className="font-mono text-[9.5px] text-fg-faint">{review.time}</span>
                        </div>
                        <div className="mt-0.5 text-[11.5px] text-fg-muted">{review.text}</div>
                      </div>
                      <span
                        className={`flex-none rounded-full px-2.5 py-1 text-[10.5px] ${
                          review.status === "Replied" ? "bg-[#e3fbf1] text-[#0b8f5c]" : "border border-[#c8efdd] bg-[#eefaf4] text-[#0b8f5c]"
                        }`}
                      >
                        {review.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex-1 basis-[250px] border-t border-[#eef0ef] p-4.5 sm:border-l sm:border-t-0">
              <div className="mb-3 flex items-baseline justify-between gap-2.5">
                <div className="font-display text-[15px] font-semibold text-fg">Top Review Sources</div>
                <Link href="/product#reports" className="text-[11.5px] text-primary hover:text-primary-hover">
                  View Report
                </Link>
              </div>
              <div className="flex flex-col gap-3 text-xs">
                {REVIEW_SOURCES.map((source) => (
                  <div key={source.label} className="flex items-center gap-2.5">
                    <span className="w-16 flex-none text-fg-muted">{source.label}</span>
                    <span className="h-[5px] flex-1 overflow-hidden rounded-full bg-[#eef0ef]">
                      <span className={`block h-full ${source.color}`} style={{ width: `${source.pct}%` }} />
                    </span>
                    <span className="w-8 flex-none text-right font-medium text-fg">{source.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-5 rounded-[var(--radius-lg)] border border-border p-5.5">
          <div className="max-w-[280px] flex-1 basis-[220px] border-b border-[#eceeed] pb-4.5 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-5">
            <div className="text-[13.5px] leading-relaxed text-fg-muted">Monitor and manage your reputation across all major platforms.</div>
          </div>
          <div className="grid min-w-[300px] flex-1 basis-[640px] grid-cols-3 gap-2.5 sm:grid-cols-5 lg:grid-cols-9">
            {REPUTATION_PLATFORMS.map((platform) => (
              <div key={platform.label} className="flex flex-col items-center gap-2.5 rounded-2xl border border-border p-3.5 transition-colors hover:border-[#a9e8cb]">
                <Image src={platform.src} alt={`${platform.label} reviews monitored by Noxtill`} width={26} height={26} className="h-[26px] w-[26px] object-contain" />
                <span className="text-center text-[11.5px] font-medium text-fg">{platform.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

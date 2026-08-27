import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { Reveal } from "@/components/site/reveal";
import { MarketingFaqGrid } from "@/components/site/marketing-faq-grid";
import { SolutionsNavigator } from "@/components/site/solutions-navigator";
import {
  SOLUTIONS_HERO,
  FLOW_STEPS,
  FLOW_FINAL_STEP,
  FLOW_PANEL,
  CROSS_LINKS,
  SOLUTIONS_FAQS,
  SOLUTIONS_FINAL_CTA,
} from "@/lib/marketing/solutions-content";

export const metadata: Metadata = {
  title: "Business Solutions for Small Businesses | Noxtill",
  description:
    "See how Noxtill helps salons, restaurants, clinics, retail stores, service businesses and growing companies manage sales, customers, bookings, inventory, payments, communication and business data in one system.",
  alternates: { canonical: "https://noxtill.com/solutions" },
  openGraph: {
    type: "website",
    url: "https://noxtill.com/solutions",
    title: "Business Solutions for Small Businesses | Noxtill",
    description: "Enter by your business type or the problem you need to solve, and see exactly how Noxtill fits your daily workflow.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Business Solutions for Small Businesses | Noxtill",
  },
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": "https://noxtill.com/#organization", name: "Noxtill", url: "https://noxtill.com/" },
    {
      "@type": "WebPage",
      "@id": "https://noxtill.com/solutions/",
      url: "https://noxtill.com/solutions/",
      name: "Business Solutions for Small Businesses",
      description:
        "How Noxtill fits salons, restaurants, clinics, retail, service businesses and multi-location operations, and how it solves no-shows, reviews, customer credit, profit visibility, paper records and multi-branch reporting.",
      isPartOf: { "@id": "https://noxtill.com/#organization" },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://noxtill.com/" },
        { "@type": "ListItem", position: 2, name: "Solutions", item: "https://noxtill.com/solutions/" },
      ],
    },
  ],
};

export default function SolutionsPage() {
  return (
    <div data-theme="light" className="flex min-h-dvh flex-col bg-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />

      <SiteHeader />

      <main className="flex-1">
        <nav aria-label="Breadcrumb" className="mx-auto max-w-[1240px] px-5 pt-5 text-xs text-fg-faint sm:px-7">
          <Link href="/" className="text-fg-faint hover:text-primary">
            Home
          </Link>{" "}
          › <span className="text-fg-muted">Solutions</span>
        </nav>

        <section className="px-5 pb-11 pt-6 text-center sm:px-7">
          <div className="mx-auto max-w-[860px]">
            
            <Reveal delay={60}>
              <h1 className="mb-4.5 text-balance font-display text-[32px] font-bold leading-[1.1] tracking-tight text-fg sm:text-[42px]">
                {SOLUTIONS_HERO.headlineLead} <span className="text-accent">{SOLUTIONS_HERO.headlineAccent}</span>
              </h1>
            </Reveal>
            <Reveal delay={120}>
              <p className="mx-auto mb-6 max-w-[66ch] text-[16.5px] leading-relaxed text-fg-muted">{SOLUTIONS_HERO.body}</p>
            </Reveal>
            <Reveal delay={180}>
              <div className="mb-4 flex flex-wrap justify-center gap-3">
                <Link
                  href="/login"
                  className="rounded-[var(--radius-md)] bg-primary px-6.5 py-3.5 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
                >
                  {SOLUTIONS_HERO.primaryCta}
                </Link>
                <Link
                  href="#navigator"
                  className="rounded-[var(--radius-md)] border border-border-strong px-6.5 py-3.5 text-[15px] font-medium text-fg transition-colors hover:border-accent hover:text-primary"
                >
                  {SOLUTIONS_HERO.secondaryCta}
                </Link>
              </div>
            </Reveal>
            <div className="flex flex-wrap justify-center gap-x-4.5 gap-y-2 text-xs text-fg-faint">
              {SOLUTIONS_HERO.trust.map((item, i) => (
                <span key={item} className="flex items-center gap-4.5">
                  {i > 0 ? <span aria-hidden>·</span> : null}
                  {item}
                </span>
              ))}
            </div>
          </div>
        </section>

        <SolutionsNavigator />

        <section className="px-5 pb-14 sm:px-7">
          <Reveal>
            <div className="mx-auto max-w-[1240px] rounded-[var(--radius-xl)] border border-border p-7">
              <h2 className="mb-2.5 font-display text-2xl font-semibold tracking-tight text-fg">{FLOW_PANEL.title}</h2>
              <p className="mb-5 max-w-[88ch] text-[14.5px] leading-relaxed text-fg-muted">{FLOW_PANEL.body}</p>
              <div className="flex flex-wrap items-center gap-2">
                {FLOW_STEPS.map((step) => (
                  <span key={step} className="contents">
                    <span className="rounded-full border border-border px-3.5 py-1.5 text-xs text-fg">{step}</span>
                    <span aria-hidden className="text-fg-faint">
                      →
                    </span>
                  </span>
                ))}
                <span className="rounded-full border border-accent/30 bg-accent/8 px-3.5 py-1.5 text-xs font-medium text-primary">
                  {FLOW_FINAL_STEP}
                </span>
              </div>
            </div>
          </Reveal>
        </section>

        <section className="px-5 pb-14 sm:px-7">
          <div className="mx-auto flex max-w-[1240px] flex-wrap gap-4">
            <Reveal className="min-w-[300px] flex-1 basis-[400px]" delay={0}>
              <div className="h-full rounded-[var(--radius-lg)] border border-border p-6">
                <h2 className="mb-2.5 font-display text-xl font-semibold tracking-tight text-fg">{CROSS_LINKS.ask.title}</h2>
                <p className="mb-3.5 text-[13.5px] leading-relaxed text-fg-muted">
                  {CROSS_LINKS.ask.body.split(CROSS_LINKS.ask.linkLabel)[0]}
                  <Link href={CROSS_LINKS.ask.linkHref} className="font-medium text-primary">
                    {CROSS_LINKS.ask.linkLabel}
                  </Link>
                  {CROSS_LINKS.ask.body.split(CROSS_LINKS.ask.linkLabel)[1]}
                </p>
                <div className="flex flex-col gap-2 text-[13px] text-[#253830]">
                  {CROSS_LINKS.ask.examples.map((example) => (
                    <span key={example} className="rounded-[var(--radius-noxtill)] border border-border px-3 py-2.5">
                      &ldquo;{example}&rdquo;
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>
            <Reveal className="min-w-[300px] flex-1 basis-[400px]" delay={90}>
              <div className="h-full rounded-[var(--radius-lg)] border border-border p-6">
                <h2 className="mb-2.5 font-display text-xl font-semibold tracking-tight text-fg">{CROSS_LINKS.connect.title}</h2>
                <p className="mb-3.5 text-[13.5px] leading-relaxed text-fg-muted">
                  {CROSS_LINKS.connect.body}{" "}
                  <Link href={CROSS_LINKS.connect.linkHref} className="font-medium text-primary">
                    {CROSS_LINKS.connect.linkLabel}
                  </Link>
                  .
                </p>
                <div className="flex flex-wrap gap-2">
                  {CROSS_LINKS.connect.chips.map((chip) => (
                    <Link
                      key={chip.name}
                      href={chip.href}
                      className="rounded-full border border-border px-3 py-1.5 text-xs text-fg-muted hover:border-accent/40 hover:text-primary"
                    >
                      {chip.name}
                    </Link>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <MarketingFaqGrid title="Questions business owners ask" items={SOLUTIONS_FAQS} />

        <section className="px-5 pb-18 sm:px-7">
          <Reveal>
            <div className="mx-auto max-w-[900px] rounded-[var(--radius-xl)] border border-border bg-surface-2 p-10 text-center">
              <h2 className="mb-3 text-balance font-display text-[28px] font-semibold tracking-tight text-fg">
                {SOLUTIONS_FINAL_CTA.title}
              </h2>
              <p className="mx-auto mb-5.5 max-w-[62ch] text-[14.5px] leading-relaxed text-fg-muted">{SOLUTIONS_FINAL_CTA.body}</p>
              <div className="mb-4 flex flex-wrap justify-center gap-3">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-primary px-6.5 py-3.5 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
                >
                  {SOLUTIONS_FINAL_CTA.primaryCta}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link
                  href="/product"
                  className="rounded-[var(--radius-md)] border border-border-strong px-6.5 py-3.5 text-[15px] font-medium text-fg transition-colors hover:border-accent hover:text-primary"
                >
                  {SOLUTIONS_FINAL_CTA.secondaryCta}
                </Link>
              </div>
              <div className="flex flex-wrap justify-center gap-x-4.5 gap-y-2 text-xs text-fg-faint">
                {SOLUTIONS_FINAL_CTA.trust.map((item, i) => (
                  <span key={item} className="flex items-center gap-4.5">
                    {i > 0 ? <span aria-hidden>·</span> : null}
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

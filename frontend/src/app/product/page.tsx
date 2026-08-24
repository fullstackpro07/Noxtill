import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { Reveal } from "@/components/site/reveal";
import { ProductFeatureGroup } from "@/components/site/product-feature-group";
import { PRODUCT_HERO, PRODUCT_GROUPS_CONTENT, PRODUCT_CALLOUT } from "@/lib/marketing/product-content";

export const metadata: Metadata = {
  title: "Noxtill Product | One Connected Business Operating System",
  description:
    "Explore every Noxtill feature — nightly close, POS, orders, bookings, customer credit, inventory, reports, reputation, messaging and AI tools — in one connected system.",
  alternates: { canonical: "https://noxtill.com/product/" },
  openGraph: {
    type: "website",
    url: "https://noxtill.com/product/",
    title: "Noxtill Product | One Connected Business Operating System",
    description: "Every Noxtill feature in one place: run your day, know your numbers, grow, and the AI tools that sit on top.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Noxtill Product | One Connected Business Operating System",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://noxtill.com/" },
        { "@type": "ListItem", position: 2, name: "Product", item: "https://noxtill.com/product/" },
      ],
    },
    {
      "@type": "SoftwareApplication",
      name: "Noxtill",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Business management software",
      operatingSystem: "Web, iOS, Android",
      url: "https://noxtill.com/product/",
      description:
        "Noxtill is an AI-powered business management platform covering nightly close, point of sale, orders, bookings, customer credit, products, profit and loss, inventory, analytics, reports, business health, staff and commissions, reputation, unified inbox, marketing, listings, social advertising, multi-location, voice-entry sales, photo digitizer, business assistant, AI insights and an AI phone receptionist.",
    },
  ],
};

export default function ProductPage() {
  return (
    <div data-theme="light" className="flex min-h-dvh flex-col bg-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <SiteHeader />

      <main className="flex-1">
        <nav aria-label="Breadcrumb" className="mx-auto max-w-[1200px] px-5 pt-5 text-[12.5px] text-fg-faint sm:px-7">
          <Link href="/" className="hover:text-fg-muted">
            Home
          </Link>{" "}
          › <span className="text-fg-muted">Product</span>
        </nav>

        <section className="px-5 pb-11 pt-7 text-center sm:px-7">
          <div className="mx-auto max-w-[860px]">
            <Reveal>
              <span className="inline-flex items-center rounded-full bg-gradient-to-r from-accent to-[#095843] px-5 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-white">
                {PRODUCT_HERO.eyebrow}
              </span>
            </Reveal>
            <Reveal delay={60}>
              <h1 className="mt-5 text-balance font-display text-4xl font-bold leading-[1.1] tracking-tight text-fg sm:text-5xl">
                {PRODUCT_HERO.headlineLead} <span className="text-accent">{PRODUCT_HERO.headlineHighlight}</span>
              </h1>
            </Reveal>
            <Reveal delay={120}>
              <p className="mx-auto mt-4 max-w-[64ch] text-[17px] leading-relaxed text-fg-muted">{PRODUCT_HERO.body}</p>
            </Reveal>
            <Reveal delay={160}>
              <p className="mx-auto mt-3 max-w-[64ch] text-[14.5px] leading-relaxed text-fg-faint">{PRODUCT_HERO.subBody}</p>
            </Reveal>
            <Reveal delay={200}>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/login"
                  className="flex items-center gap-1.5 rounded-[var(--radius-noxtill)] bg-primary px-6.5 py-3.5 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
                >
                  {PRODUCT_HERO.primaryCta}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link
                  href="/login"
                  className="rounded-[var(--radius-noxtill)] border border-border-strong px-6.5 py-3.5 text-[15px] font-medium text-fg transition-colors hover:border-accent hover:text-primary"
                >
                  {PRODUCT_HERO.secondaryCta}
                </Link>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="px-5 pb-16 sm:px-7">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-11">
            {PRODUCT_GROUPS_CONTENT.map((group, i) => (
              <ProductFeatureGroup key={group.title} group={group} delay={i * 60} />
            ))}
          </div>
        </section>

        <section className="px-5 pb-20 sm:px-7">
          <Reveal>
            <div className="mx-auto max-w-[1200px] rounded-[var(--radius-noxtill-xl)] border border-border bg-surface-2 p-8 sm:p-9">
              <h2 className="mb-3 font-display text-2xl font-semibold tracking-tight text-fg">{PRODUCT_CALLOUT.title}</h2>
              <p className="mb-5 max-w-[88ch] text-[14.5px] leading-relaxed text-fg-muted">{PRODUCT_CALLOUT.body}</p>
              <div className="flex flex-wrap gap-2.5">
                {PRODUCT_CALLOUT.links.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="rounded-full border border-border-strong px-4 py-2.5 text-[13px] text-fg transition-colors hover:border-accent"
                  >
                    {link.label}
                  </Link>
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

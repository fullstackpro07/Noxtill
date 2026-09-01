import type { Metadata } from "next";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { FaqAccordion } from "@/components/site/faq-accordion";
import { Reveal } from "@/components/site/reveal";
import { PricingPlansSection } from "@/components/site/pricing-plans-section";
import { PricingFinalCta } from "@/components/site/pricing-final-cta";
import { PRICING_HERO, PRICING_UNIVERSAL_FEATURES, PRICING_FAQS } from "@/lib/marketing/pricing-content";

export const metadata: Metadata = {
  title: "Noxtill Pricing | Business Management Software Plans",
  description:
    "Explore Noxtill pricing for POS, bookings, CRM, inventory, AI, marketing, reporting and connected business management. Choose the plan that fits your business.",
  alternates: { canonical: "https://noxtill.com/pricing/" },
  openGraph: {
    type: "website",
    title: "Noxtill Pricing | Business Management Software Plans",
    description: "Five plans from $49/month. POS, bookings, CRM, inventory, AI, marketing and reporting in one connected platform. 14-day free trial.",
    url: "https://noxtill.com/pricing/",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": "https://noxtill.com/pricing/#webpage",
      url: "https://noxtill.com/pricing/",
      name: "Noxtill Pricing | Business Management Software Plans",
      description: "Noxtill pricing for POS, bookings, CRM, inventory, AI, marketing, reporting and connected business management.",
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://noxtill.com/" },
        { "@type": "ListItem", position: 2, name: "Pricing", item: "https://noxtill.com/pricing/" },
      ],
    },
  ],
};

export default function PricingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg" data-theme="light">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto max-w-[1280px] px-5 pt-16.5 text-center sm:px-10">
          <h1 className="mx-auto mb-5 max-w-[20ch] text-balance font-display text-[clamp(34px,5vw,64px)] font-bold leading-[1.06] tracking-[-0.04em] text-fg">
            {PRICING_HERO.headline} <span className="text-accent-hover">{PRICING_HERO.headlineAccent}</span> {PRICING_HERO.headlineEnd}
          </h1>
          <p className="mx-auto mb-8.5 max-w-[62ch] text-[17px] leading-relaxed text-fg-muted">{PRICING_HERO.body}</p>

          <div className="mx-auto mb-10 grid max-w-[1000px] grid-cols-1 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
            {PRICING_HERO.trust.map((item, i) => (
              <div key={item.title} className={`flex items-center gap-3 px-5 text-left ${i > 0 ? "sm:border-l sm:border-[#eceeed]" : ""}`}>
                <span className="flex size-10.5 shrink-0 items-center justify-center rounded-full bg-primary/8">
                  <item.icon className="size-5 text-accent-hover" aria-hidden />
                </span>
                <span className="text-[14.5px] leading-snug text-fg">
                  {item.title}
                  <br />
                  {item.subtitle}
                </span>
              </div>
            ))}
          </div>
        </section>

        <PricingPlansSection />

        <section className="mx-auto max-w-[1280px] px-5 pb-20 sm:px-10">
          <div className="mx-auto mb-7.5 max-w-[620px] text-center">
            <h2 className="mb-3 text-balance font-display text-[clamp(28px,3.4vw,44px)] font-bold leading-[1.1] tracking-[-0.035em] text-fg">
              Included with every Noxtill plan
            </h2>
            <p className="text-base leading-relaxed text-fg-muted">Powerful features, reliable support and a secure platform — included with every plan.</p>
          </div>
          <Reveal>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {PRICING_UNIVERSAL_FEATURES.map((feature) => (
                <div key={feature.title} className="rounded-[18px] border border-[#e9edeb] bg-white p-5.5">
                  <span className="mb-3.5 flex size-11 items-center justify-center rounded-full bg-primary/8">
                    <feature.icon className="size-[22px] text-accent-hover" aria-hidden />
                  </span>
                  <div className="mb-1.5 font-display text-[15.5px] font-semibold text-fg">{feature.title}</div>
                  <div className="text-[13.5px] leading-relaxed text-fg-muted">{feature.desc}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        <section className="mx-auto max-w-[1000px] px-5 pb-20 sm:px-10">
          <div className="mx-auto mb-7.5 max-w-[620px] text-center">
            <h2 className="mb-3 text-balance font-display text-[clamp(28px,3.4vw,44px)] font-bold leading-[1.1] tracking-[-0.035em] text-fg">
              Everything you need to know
            </h2>
            <p className="text-base leading-relaxed text-fg-muted">Answers to common questions about plans, pricing, billing, usage and getting started.</p>
          </div>
          <FaqAccordion items={PRICING_FAQS} />
        </section>

        <PricingFinalCta />
      </main>

      <SiteFooter />
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bot, Check } from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { Reveal } from "@/components/site/reveal";
import { FaqAccordion } from "@/components/site/faq-accordion";
import { AiAssistantLiveDemo } from "@/components/site/ai-assistant-live-demo";
import { AiAssistantFlowSteps } from "@/components/site/ai-assistant-flow-steps";
import { AiAssistantReportDemo } from "@/components/site/ai-assistant-report-demo";
import { AiReceptionLiveDemo } from "@/components/site/ai-reception-live-demo";
import { AiVoiceSalesDemo } from "@/components/site/ai-voice-sales-demo";
import { AiPhotoDigitizerDemo } from "@/components/site/ai-photo-digitizer-demo";
import { AiInsightsFeedDemo } from "@/components/site/ai-insights-feed-demo";
import { AiCapabilitySectionBlock } from "@/components/site/ai-capability-section";
import { AiPromiseSection } from "@/components/site/ai-promise-section";
import { AI_CAPABILITIES, AI_FAQ, AI_FINAL_CTA, AI_HERO } from "@/lib/marketing/ai-content";

export const metadata: Metadata = {
  title: "Noxtill AI | Business Assistant, AI Receptionist, Voice Sales & Insights",
  description:
    "Every AI feature in Noxtill: a Business Assistant that answers from your real data, an AI Phone Receptionist, Voice-Entry Sales, a Photo Digitizer for paper records, and AI Insights — with honest limits, not invented numbers.",
  alternates: { canonical: "https://noxtill.com/ai/" },
  openGraph: {
    type: "website",
    url: "https://noxtill.com/ai/",
    title: "Noxtill AI | Business Assistant, AI Receptionist, Voice Sales & Insights",
    description: "AI that reads your actual business records — and tells you when it doesn't have the answer.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Noxtill AI | Business Assistant, AI Receptionist, Voice Sales & Insights",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://noxtill.com/" },
        { "@type": "ListItem", position: 2, name: "AI", item: "https://noxtill.com/ai/" },
      ],
    },
    {
      "@type": "SoftwareApplication",
      name: "Noxtill AI",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Business management software",
      operatingSystem: "Web, iOS, Android",
      url: "https://noxtill.com/ai/",
      description:
        "Noxtill's AI features: a Business Assistant that answers from connected business data, an AI Phone Receptionist, Voice-Entry Sales, a Photo Digitizer for paper records, and AI Insights — built with explicit limits against invented answers.",
    },
  ],
};

export default function AiPage() {
  return (
    <div data-theme="light" className="flex min-h-dvh flex-col bg-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <SiteHeader />

      <main className="flex-1">
        <nav aria-label="Breadcrumb" className="mx-auto max-w-[1320px] px-5 pt-5 text-[12.5px] text-fg-faint sm:px-7">
          <Link href="/" className="hover:text-fg-muted">
            Home
          </Link>{" "}
          › <span className="text-fg-muted">AI</span>
        </nav>

        {/* Hero */}
        <section className="px-5 pt-7 text-center sm:px-7">
          <div className="mx-auto max-w-[820px]">
            <Reveal delay={0}>
              <div className="mb-4 inline-flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-[0.11em] text-primary">
                {AI_HERO.eyebrow}
              </div>
            </Reveal>
            <Reveal delay={60}>
              <h1 className="text-balance font-display text-4xl font-bold leading-[1.1] tracking-tight text-fg sm:text-5xl">
                {AI_HERO.headlineLead} <span className="text-accent">{AI_HERO.headlineHighlight}</span>
              </h1>
            </Reveal>
            <Reveal delay={120}>
              <p className="mx-auto mt-4 max-w-[64ch] text-[17px] leading-relaxed text-fg-muted">{AI_HERO.body}</p>
            </Reveal>
            <Reveal delay={180}>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href={AI_HERO.primaryCta.href}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-6.5 py-3.5 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
                >
                  {AI_HERO.primaryCta.label} <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link
                  href={AI_HERO.secondaryCta.href}
                  className="rounded-xl border border-border-strong px-6.5 py-3.5 text-[15px] font-medium text-fg transition-colors hover:border-accent hover:text-primary"
                >
                  {AI_HERO.secondaryCta.label}
                </Link>
              </div>
            </Reveal>
            <Reveal delay={220}>
              <ul className="mx-auto mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5">
                {AI_HERO.checklist.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-[13.5px] text-fg-muted">
                    <span className="flex h-4.5 w-4.5 flex-none items-center justify-center rounded-full bg-[#e3fbf1]">
                      <Check className="h-2.5 w-2.5 text-accent" aria-hidden strokeWidth={3} />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* Business Assistant */}
        <section id="assistant" className="px-5 pt-16 sm:px-7 sm:pt-20">
          <div className="mx-auto max-w-[1320px]">
            <div className="mx-auto mb-8 max-w-[720px] text-center">
              <div className="mb-3.5 font-display text-xs font-semibold uppercase tracking-[0.11em] text-primary">
                {AI_CAPABILITIES.assistant.eyebrow}
              </div>
              <h2 className="mb-3.5 text-balance font-display text-[30px] font-bold leading-tight tracking-tight text-fg sm:text-[40px]">
                {AI_CAPABILITIES.assistant.title} <span className="text-accent">{AI_CAPABILITIES.assistant.highlight}</span>
              </h2>
              <p className="mx-auto max-w-[64ch] text-[15.5px] leading-relaxed text-fg-muted">{AI_CAPABILITIES.assistant.body}</p>
            </div>

            <Reveal delay={0}>
              <AiAssistantLiveDemo />
            </Reveal>

            <div className="mt-8 flex flex-wrap items-stretch gap-4">
              <Reveal delay={80} className="min-w-[300px] flex-1 basis-[460px] rounded-[var(--radius-lg)] border border-border bg-white p-5">
                <div className="mb-4.5 flex items-center gap-2.5">
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-[#e3fbf1]">
                    <Bot className="h-[19px] w-[19px] text-accent" aria-hidden strokeWidth={1.8} />
                  </span>
                  <div className="font-display text-base font-semibold text-fg">How it works</div>
                </div>
                <AiAssistantFlowSteps />
              </Reveal>

              <Reveal delay={140} className="min-w-[280px] flex-1 basis-full">
                <AiAssistantReportDemo />
              </Reveal>
            </div>
          </div>
        </section>

        {/* AI Phone Receptionist */}
        <AiCapabilitySectionBlock data={AI_CAPABILITIES.reception} demo={<AiReceptionLiveDemo />} />

        {/* Voice-Entry Sales */}
        <AiCapabilitySectionBlock data={AI_CAPABILITIES.voiceSales} demo={<AiVoiceSalesDemo />} reverse />

        {/* Photo Digitizer */}
        <AiCapabilitySectionBlock data={AI_CAPABILITIES.photoDigitizer} demo={<AiPhotoDigitizerDemo />} />

        {/* AI Insights */}
        <AiCapabilitySectionBlock data={AI_CAPABILITIES.insights} demo={<AiInsightsFeedDemo />} reverse />

        {/* What Our AI Never Does */}
        <AiPromiseSection />

        {/* FAQ */}
        <section className="mx-auto max-w-[760px] px-5 py-16 sm:px-7 sm:py-14">
          <div className="mx-auto mb-10 max-w-[620px] text-center">
            <h2 className="mb-3.5 text-balance font-display text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
              AI questions, answered plainly
            </h2>
          </div>
          <FaqAccordion items={AI_FAQ} />
        </section>

        {/* Final CTA */}
        <section className="bg-surface-deep px-5 pb-0 pt-10 sm:px-7 sm:pb-18 sm:pt-16">
          <Reveal className="mx-auto max-w-[1280px] rounded-[24px] border border-border bg-white p-8 text-center sm:p-11">
            <h2 className="mb-3.5 text-balance font-display text-[26px] font-bold leading-[1.14] tracking-tight text-fg sm:text-[38px]">
              {AI_FINAL_CTA.heading}
            </h2>
            <p className="mx-auto mb-6.5 max-w-[56ch] text-base leading-relaxed text-fg-muted">{AI_FINAL_CTA.body}</p>
            <div className="mb-5 flex flex-wrap justify-center gap-3">
              <Link
                href={AI_FINAL_CTA.primaryCta.href}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-[15.5px] font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
              >
                {AI_FINAL_CTA.primaryCta.label} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href={AI_FINAL_CTA.secondaryCta.href}
                className="inline-flex items-center rounded-xl border border-border-strong px-6.5 py-3.5 text-[15.5px] font-medium text-fg transition-colors hover:border-primary hover:text-primary"
              >
                {AI_FINAL_CTA.secondaryCta.label}
              </Link>
            </div>
            <div className="flex flex-wrap justify-center gap-4.5 text-[13px] text-fg-faint">
              {AI_FINAL_CTA.trust.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </Reveal>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

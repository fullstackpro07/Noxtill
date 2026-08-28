import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { Reveal } from "@/components/site/reveal";
import { MarketingFaqGrid } from "@/components/site/marketing-faq-grid";
import { IntegrationsDirectory } from "@/components/site/integrations-directory";
import { IntegrationsStepFlow } from "@/components/site/integrations-step-flow";
import { IntegrationsSyncOverviewLiveDemo } from "@/components/site/integrations-sync-overview-live-demo";
import { IntegrationsAutomationSection } from "@/components/site/integrations-automation-section";
import { IntegrationsProblemCard } from "@/components/site/integrations-problem-card";
import { IntegrationsRequestForm } from "@/components/site/integrations-request-form";
import {
  BUILT_FOR_BUSINESS,
  HERO_BOTTOM_ROW,
  HERO_LEFT_COLUMN,
  HERO_RIGHT_COLUMN,
  HERO_TOP_ROW,
  INTEGRATIONS_FAQ,
  INTEGRATIONS_FINAL_CTA,
  INTEGRATIONS_HERO,
  MULTI_LOCATION,
  REQUEST_SECTION,
  SECURITY_SECTION,
  SOLVE_PROBLEMS,
  SYNC_OVERVIEW,
  UNIFIED_INBOX,
  type HeroToolIcon,
} from "@/lib/marketing/integrations-content";

export const metadata: Metadata = {
  title: "Noxtill Integrations | Connect Your Business Software & Data",
  description:
    "Connect Noxtill with the business tools you already use. Sync sales, customers, payments, inventory, bookings, marketing, communication and reporting in one connected system.",
  alternates: { canonical: "https://noxtill.com/integrations-directory/" },
  openGraph: {
    type: "website",
    url: "https://noxtill.com/integrations-directory/",
    title: "Noxtill Integrations | Connect Your Business Software & Data",
    description: "Connect the tools your business already uses and keep sales, customers, payments, inventory and reporting in sync.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Noxtill Integrations | Connect Your Business Software & Data",
  },
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": "https://noxtill.com/#organization", name: "Noxtill", url: "https://noxtill.com/" },
    {
      "@type": "WebPage",
      "@id": "https://noxtill.com/integrations-directory/",
      url: "https://noxtill.com/integrations-directory/",
      name: "Noxtill Integrations",
      isPartOf: { "@id": "https://noxtill.com/#organization" },
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What integrations does Noxtill support?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Noxtill supports connectors across e-commerce, payments, accounting, CRM, marketing, communication, business listings, reputation and automation. The integration directory lists every connector available today, with what each one syncs.",
          },
        },
        {
          "@type": "Question",
          name: "How do Noxtill integrations work?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "You authorise the connection from Noxtill, choose what should sync, and Noxtill keeps the relevant business records updated. Most connections take a few minutes and need no technical knowledge.",
          },
        },
        {
          "@type": "Question",
          name: "Can I connect multiple tools and locations?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. You can connect several tools at once, and each location can be connected so branch-level data stays visible alongside a combined view.",
          },
        },
        {
          "@type": "Question",
          name: "Can Noxtill connect WhatsApp?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. WhatsApp Business connects to the unified inbox, so customer conversations, receipts, reminders and reports can run through the channel customers already use.",
          },
        },
        {
          "@type": "Question",
          name: "Can I disconnect an integration?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Any connection can be disconnected from Noxtill at any time, and you control what each connection is allowed to access while it is active.",
          },
        },
      ],
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://noxtill.com/" },
        { "@type": "ListItem", position: 2, name: "Integrations", item: "https://noxtill.com/integrations-directory/" },
      ],
    },
  ],
};

function HeroIconTile({ tool }: { tool: HeroToolIcon }) {
  return (
    <div className="w-[100px] text-center">
      <div className="mx-auto mb-2.5 flex h-[70px] w-[70px] items-center justify-center rounded-[20px] bg-white shadow-[0_10px_26px_-14px_rgba(16,29,38,0.32)]">
        <Image src={tool.logo} alt={`${tool.name} logo`} width={38} height={38} className="h-9.5 w-9.5 object-contain" />
      </div>
      <div className="text-[13px] text-fg">{tool.name}</div>
    </div>
  );
}

const DASHED_DIVIDER = "mx-auto h-0 max-w-[420px] flex-1 border-t-2 border-dashed border-[#a9e8cb]";

export default function IntegrationsPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg" data-theme="light">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="px-5 pb-16 pt-12 sm:px-7 sm:pb-18 sm:pt-14">
          <div className="mx-auto flex max-w-[1420px] flex-wrap items-center gap-10 lg:gap-14">
            <Reveal className="min-w-[300px] max-w-[560px] flex-[1_1_420px]">
              
              <h1 className="mb-6.5 text-balance font-display text-[34px] font-bold leading-[1.12] tracking-tight text-fg sm:text-[46px] lg:text-[54px]">
                {INTEGRATIONS_HERO.headlineLine1}
                <br />
                <span className="text-primary">{INTEGRATIONS_HERO.headlineLine2}</span>
              </h1>
              <p className="mb-7.5 max-w-[46ch] text-lg leading-relaxed text-fg-muted">{INTEGRATIONS_HERO.body}</p>
              <ul className="flex flex-col gap-3.5">
                {INTEGRATIONS_HERO.checklist.map((item) => (
                  <li key={item} className="flex items-center gap-3 text-base text-fg">
                    <span className="flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full bg-primary">
                      <Check className="h-3.5 w-3.5 text-white" strokeWidth={2.5} aria-hidden />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={90} className="min-w-[300px] flex-[1_1_640px]">
              <div className="mb-2.5 flex flex-wrap justify-center gap-6.5">
                {HERO_TOP_ROW.map((tool) => (
                  <HeroIconTile key={tool.name} tool={tool} />
                ))}
              </div>

              <div className="mb-2.5 flex items-center justify-center gap-2.5">
                <span className={DASHED_DIVIDER} />
              </div>

              <div className="mb-2.5 flex flex-wrap items-center justify-center gap-5.5">
                <div className="flex flex-col gap-5.5">
                  {HERO_LEFT_COLUMN.map((tool) => (
                    <HeroIconTile key={tool.name} tool={tool} />
                  ))}
                </div>

                <div className="flex items-center gap-2.5">
                  <span className="h-0 w-8.5 border-t-2 border-dashed border-[#a9e8cb]" />
                  <div className="flex h-[190px] w-[240px] max-w-full items-center justify-center rounded-[26px] bg-white shadow-[0_22px_54px_-24px_rgba(16,29,38,0.34)]">
                    <Image src="/brand/noxtill-logo.png" alt="Noxtill" width={160} height={45} className="h-9 w-auto" />
                  </div>
                  <span className="h-0 w-8.5 border-t-2 border-dashed border-[#a9e8cb]" />
                </div>

                <div className="flex flex-col gap-5.5">
                  {HERO_RIGHT_COLUMN.map((tool) => (
                    <HeroIconTile key={tool.name} tool={tool} />
                  ))}
                </div>
              </div>

              <div className="mb-2.5 flex items-center justify-center">
                <span className={DASHED_DIVIDER} />
              </div>

              <div className="mb-6.5 flex flex-wrap justify-center gap-6.5">
                {HERO_BOTTOM_ROW.map((tool) => (
                  <HeroIconTile key={tool.name} tool={tool} />
                ))}
              </div>

              

              <div className="mx-auto flex max-w-[560px] items-center gap-3.5 rounded-[18px] border border-[#dcefe6] bg-[#f6fbf8] px-5 py-4.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary">
                  <Sparkles className="h-[22px] w-[22px] text-white" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-base font-semibold text-fg">{INTEGRATIONS_HERO.aiCallout.title}</span>
                  <span className="mt-0.5 block text-sm text-fg-muted">{INTEGRATIONS_HERO.aiCallout.description}</span>
                </span>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Integration Directory */}
        <section id="directory" className="bg-surface-tint px-5 pb-16 sm:px-7 sm:pb-18">
          <div className="mx-auto max-w-[1420px]">
            <IntegrationsDirectory />
          </div>
        </section>

        <IntegrationsStepFlow />

        {/* What You Can Connect & Sync */}
        <div className="bg-surface-tint-2">
        <section className="mx-auto max-w-[1560px] px-5 pb-16 sm:px-7 sm:pb-18">
          <div className="mx-auto mb-8 max-w-[720px] text-center">
            <div className="mb-4.5 inline-flex items-center gap-2 font-display text-[12.5px] font-semibold uppercase tracking-[0.09em] text-primary">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              {SYNC_OVERVIEW.eyebrow}
            </div>
            <h2 className="mb-4 text-balance font-display text-[30px] font-bold leading-[1.1] tracking-tight text-fg sm:text-[46px]">
              {SYNC_OVERVIEW.heading}
            </h2>
            <p className="mx-auto max-w-[56ch] text-[16.5px] leading-relaxed text-fg-muted">{SYNC_OVERVIEW.body}</p>
          </div>
          <IntegrationsSyncOverviewLiveDemo />
        </section>
        </div>

        {/* Unified inbox callout */}
        <section className="mx-auto max-w-[1280px] px-5 pb-14 sm:px-7">
          <Reveal className="rounded-[24px] border border-border bg-white p-6 sm:p-8.5">
            <div className="flex flex-wrap items-center gap-7 sm:gap-10">
              <div className="min-w-[280px] max-w-[460px] flex-[1_1_340px]">
                <div className="mb-3.5 font-display text-xs font-semibold uppercase tracking-[0.11em] text-primary">{UNIFIED_INBOX.eyebrow}</div>
                <h2 className="mb-3.5 text-balance font-display text-[30px] font-bold leading-[1.15] tracking-tight text-fg">{UNIFIED_INBOX.heading}</h2>
                <p className="mb-4.5 text-[15.5px] leading-relaxed text-fg-muted">{UNIFIED_INBOX.body}</p>
                <Link href={UNIFIED_INBOX.cta.href} className="inline-flex items-center gap-2 text-[15px] font-medium text-primary hover:text-primary-hover">
                  {UNIFIED_INBOX.cta.label} <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>
              <div className="flex min-w-[300px] flex-[1_1_420px] flex-wrap gap-2.5">
                {UNIFIED_INBOX.channels.map((channel) => (
                  <span key={channel.label} className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3.5 py-2 text-[13.5px] text-fg">
                    {channel.logo ? (
                      <Image src={channel.logo} alt="" width={20} height={20} className="h-5 w-5 shrink-0 object-contain" aria-hidden />
                    ) : channel.icon ? (
                      <channel.icon className="h-5 w-5 shrink-0 text-primary" aria-hidden strokeWidth={1.8} />
                    ) : null}
                    {channel.label}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        </section>

        {/* Multi-location callout */}
        <div className="bg-surface-tint">
        <section className="mx-auto max-w-[1280px] px-5 pb-14 sm:px-7">
          <Reveal className="rounded-[24px] border border-border bg-white p-6 sm:p-8.5">
            <div className="flex flex-wrap items-center gap-7 sm:gap-10">
              <div className="min-w-[280px] max-w-[460px] flex-[1_1_340px]">
                <div className="mb-3.5 font-display text-xs font-semibold uppercase tracking-[0.11em] text-primary">{MULTI_LOCATION.eyebrow}</div>
                <h2 className="mb-3.5 text-balance font-display text-[30px] font-bold leading-[1.15] tracking-tight text-fg">{MULTI_LOCATION.heading}</h2>
                <p className="mb-4.5 text-[15.5px] leading-relaxed text-fg-muted">{MULTI_LOCATION.body}</p>
                <Link href={MULTI_LOCATION.cta.href} className="inline-flex items-center gap-2 text-[15px] font-medium text-primary hover:text-primary-hover">
                  {MULTI_LOCATION.cta.label} <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>
              <div className="flex min-w-[300px] flex-[1_1_420px] flex-wrap items-center gap-3">
                <div className="flex min-w-[110px] flex-[1_1_120px] flex-col gap-2">
                  {MULTI_LOCATION.branches.map((branch) => (
                    <span key={branch} className="rounded-xl border border-border bg-white px-3.5 py-2.5 text-[13.5px] text-fg">
                      {branch}
                    </span>
                  ))}
                </div>
                <ArrowRight className="h-6 w-6 shrink-0 text-accent" aria-hidden />
                <div className="min-w-[190px] flex-[1_1_200px] rounded-2xl border border-[#cfeede] bg-white p-4">
                  <div className="mb-2.5 font-display text-sm font-semibold text-fg">{MULTI_LOCATION.combinedViewTitle}</div>
                  <div className="flex flex-wrap gap-1.5 text-[11.5px] text-fg-muted">
                    {MULTI_LOCATION.combinedViewTags.map((tag) => (
                      <span key={tag} className="rounded-full border border-border px-2.5 py-1">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
        </div>

        {/* Built for the way your business works */}
        <div className="bg-surface-tint-2">
        <section className="mx-auto max-w-[1280px] px-5 pb-14 sm:px-7">
          <div className="mx-auto mb-6.5 max-w-[620px] text-center">
            <h2 className="mb-3 text-balance font-display text-[30px] font-bold leading-[1.15] tracking-tight text-fg">{BUILT_FOR_BUSINESS.heading}</h2>
            <p className="text-[15.5px] leading-relaxed text-fg-muted">{BUILT_FOR_BUSINESS.body}</p>
          </div>
          <div className="mb-6.5 flex flex-wrap justify-center gap-2.5">
            {BUILT_FOR_BUSINESS.pills.map((pill) => (
              <Link
                key={pill.label}
                href={pill.href}
                className="rounded-full border border-border bg-white px-4 py-2.5 text-[13.5px] text-fg transition-colors hover:border-[#a9e8cb] hover:text-primary"
              >
                {pill.label}
              </Link>
            ))}
          </div>
          <div className="text-center">
            <Link href={BUILT_FOR_BUSINESS.ctaHref} className="inline-flex items-center gap-2 text-[15px] font-medium text-primary hover:text-primary-hover">
              {BUILT_FOR_BUSINESS.ctaLabel} <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </section>
        </div>

        {/* Solve the problems that matter most */}
        <section className="mx-auto max-w-[1280px] px-5 pb-14 sm:px-7">
          <div className="mx-auto mb-6.5 max-w-[640px] text-center">
            <h2 className="mb-3 text-balance font-display text-[30px] font-bold leading-[1.15] tracking-tight text-fg">{SOLVE_PROBLEMS.heading}</h2>
            <p className="text-[15.5px] leading-relaxed text-fg-muted">{SOLVE_PROBLEMS.body}</p>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3.5">
            {SOLVE_PROBLEMS.cards.map((card) => (
              <IntegrationsProblemCard key={card.title} {...card} />
            ))}
          </div>
          <div className="mt-5.5 text-center">
            <Link href={SOLVE_PROBLEMS.ctaHref} className="inline-flex items-center gap-2 text-[15px] font-medium text-primary hover:text-primary-hover">
              {SOLVE_PROBLEMS.ctaLabel} <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </section>

        <IntegrationsAutomationSection />

        {/* Security + Request an integration */}
        <div className="bg-surface-tint-2">
        <section id="request" className="mx-auto max-w-[1280px] px-5 pb-14 sm:px-7">
          <div className="flex flex-wrap items-stretch gap-4.5">
            <Reveal className="min-w-[300px] flex-[1_1_440px] rounded-[20px] border border-border bg-white p-6.5">
              <span className="mb-4 inline-flex rounded-lg border border-[#cfeede] bg-[#f0faf5] px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0b7a4c]">
                {SECURITY_SECTION.badge}
              </span>
              <h3 className="mb-2.5 text-balance font-display text-[26px] font-bold leading-[1.18] tracking-tight text-fg">{SECURITY_SECTION.heading}</h3>
              <p className="mb-5 text-sm leading-relaxed text-fg-muted">{SECURITY_SECTION.body}</p>
              <div className="flex flex-col gap-4">
                {SECURITY_SECTION.items.map(({ icon: Icon, title, description }) => (
                  <div key={title} className="flex items-start gap-3.5">
                    <span className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-[10px] bg-[#e8f7ef]">
                      <Icon className="h-4.5 w-4.5 text-primary" aria-hidden strokeWidth={1.8} />
                    </span>
                    <div>
                      <div className="mb-1 font-display text-sm font-semibold text-fg">{title}</div>
                      <div className="text-[12.5px] leading-relaxed text-fg-faint">{description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal delay={90} className="min-w-[300px] flex-[1_1_560px] rounded-[20px] border border-border bg-white p-6.5">
              <span className="mb-4 inline-flex rounded-lg border border-[#d8e6f6] bg-[#f2f7fd] px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-[#2f6fbd]">
                {REQUEST_SECTION.badge}
              </span>
              <h3 className="mb-2.5 text-balance font-display text-[26px] font-bold leading-[1.18] tracking-tight text-fg">{REQUEST_SECTION.heading}</h3>
              <p className="mb-5 text-sm leading-relaxed text-fg-muted">{REQUEST_SECTION.body}</p>
              <div className="flex flex-wrap items-start gap-4.5">
                <IntegrationsRequestForm />
                <div className="flex min-w-[200px] flex-[1_1_210px] flex-col gap-4 rounded-2xl border border-border bg-surface-2 p-4.5">
                  {REQUEST_SECTION.sideItems.map(({ icon: Icon, title, description }) => (
                    <div key={title} className="flex items-start gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[#e8f7ef]">
                        <Icon className="h-[17px] w-[17px] text-primary" aria-hidden strokeWidth={1.8} />
                      </span>
                      <div>
                        <div className="mb-0.5 font-display text-[13.5px] font-semibold text-fg">{title}</div>
                        <div className="text-[12.5px] leading-relaxed text-fg-faint">{description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4.5 flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-border bg-surface-2 px-4 py-3.5">
                <span className="text-[13.5px] text-fg-muted">{REQUEST_SECTION.footerLabel}</span>
                <Link href={REQUEST_SECTION.footerCtaHref} className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-primary">
                  {REQUEST_SECTION.footerCtaLabel} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
        </div>

        <div id="faq">
          <MarketingFaqGrid title="Integration questions, answered" items={INTEGRATIONS_FAQ} />
        </div>

        {/* Final CTA */}
        <div className="bg-surface-tint">
        <section className="mx-auto max-w-[1280px] px-5 pb-18 sm:px-7">
          <Reveal className="rounded-[24px] border border-[#cfeede] bg-white p-8 text-center sm:p-11">
            <h2 className="mb-3.5 text-balance font-display text-[26px] font-bold leading-[1.14] tracking-tight text-fg sm:text-[38px]">
              {INTEGRATIONS_FINAL_CTA.heading}
            </h2>
            <p className="mx-auto mb-6.5 max-w-[56ch] text-base leading-relaxed text-fg-muted">{INTEGRATIONS_FINAL_CTA.body}</p>
            <div className="mb-5 flex flex-wrap justify-center gap-3">
              <Link
                href={INTEGRATIONS_FINAL_CTA.primaryCta.href}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-[15.5px] font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
              >
                {INTEGRATIONS_FINAL_CTA.primaryCta.label} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href={INTEGRATIONS_FINAL_CTA.secondaryCta.href}
                className="inline-flex items-center rounded-xl border border-border-strong px-6.5 py-3.5 text-[15.5px] font-medium text-fg transition-colors hover:border-primary hover:text-primary"
              >
                {INTEGRATIONS_FINAL_CTA.secondaryCta.label}
              </Link>
            </div>
            <div className="flex flex-wrap justify-center gap-4.5 text-[13px] text-fg-faint">
              {INTEGRATIONS_FINAL_CTA.trust.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </Reveal>
        </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { HeroNav } from "@/components/site/hero-nav";
import { SiteFooter } from "@/components/site/site-footer";
import { PhoneMockup } from "@/components/site/phone-mockup";
import { NightlyClosePhone } from "@/components/site/nightly-close-phone";
import { StatsBar } from "@/components/site/stats-bar";
import { HowItWorks } from "@/components/site/how-it-works";
import { ModuleGrid } from "@/components/site/module-grid";
import { CreditLedgerSection } from "@/components/site/credit-ledger-section";
import { AssistantModuleSection } from "@/components/site/assistant-module-section";
import { BusinessTypePicker } from "@/components/site/business-type-picker";
import { PricingSection } from "@/components/site/pricing-section";
import { TrustGrid } from "@/components/site/trust-grid";
import { FinalCtaSection } from "@/components/site/final-cta-section";
import { HERO } from "@/lib/landing-content";

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      {/* Sticky nav, styled to blend into the hero below it rather than reading as a separate bar */}
      <HeroNav />

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute -end-32 -top-32 h-96 w-96 rounded-full opacity-40 blur-3xl"
            style={{ background: "radial-gradient(circle, var(--accent) 0%, transparent 70%)" }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -start-24 top-40 h-72 w-72 rounded-full opacity-30 blur-3xl"
            style={{ background: "radial-gradient(circle, var(--primary) 0%, transparent 70%)" }}
            aria-hidden
          />

          <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 pb-16 pt-10 sm:px-6 sm:pb-24 lg:grid-cols-[1.1fr_0.9fr] lg:pb-28">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent-foreground">
                🌙 {HERO.eyebrow}
              </span>
              <h1 className="mt-5 text-balance font-display text-4xl font-bold leading-[1.05] tracking-tight text-fg sm:text-5xl lg:text-6xl">
                {HERO.headlineLine1}
                <br />
                <span className="text-primary">{HERO.headlineLine2}</span>
              </h1>
              <p className="mt-4 font-display text-xl font-semibold text-fg">{HERO.subheadline}</p>
              <p className="mt-3 max-w-lg text-fg-muted">{HERO.body}</p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/login"
                  className="flex items-center gap-1.5 rounded-full bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-md)] transition-transform hover:scale-[1.02]"
                >
                  {HERO.primaryCta}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <a href="#features" className="rounded-full border border-border-strong px-6 py-3.5 text-sm font-semibold text-fg hover:bg-surface-2">
                  {HERO.secondaryCta}
                </a>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-fg-faint">
                {HERO.trust.map((item) => (
                  <span key={item} className="flex items-center gap-1">
                    <Check className="h-3.5 w-3.5 text-primary" aria-hidden />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <PhoneMockup>
              <NightlyClosePhone />
            </PhoneMockup>
          </div>
        </section>

        <StatsBar />
        <HowItWorks />
        <ModuleGrid />
        <CreditLedgerSection />
        <AssistantModuleSection />
        <BusinessTypePicker />
        <PricingSection />
        <TrustGrid />
        <FinalCtaSection />
      </main>

      <SiteFooter />
    </div>
  );
}

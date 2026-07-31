import Link from "next/link";
import { Check } from "lucide-react";
import { LANDING_PLANS } from "@/lib/landing-content";
import { cn } from "@/lib/utils";

export function PricingSection() {
  return (
    <section id="pricing" className="border-y border-border bg-surface/60 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-12 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-foreground">Pricing</p>
          <h2 className="mt-2 font-display text-3xl font-bold text-fg sm:text-4xl">Simple, honest pricing.</h2>
          <p className="mt-3 text-fg-muted">14-day free trial · No card required · Cancel anytime</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LANDING_PLANS.map((plan) => (
            <div
              key={plan.key}
              className={cn(
                "relative flex flex-col rounded-[var(--radius-noxtill)] border p-5",
                plan.featured ? "border-primary bg-primary text-primary-foreground shadow-[var(--shadow-lg)]" : "border-border bg-surface",
              )}
            >
              {plan.featured && (
                <span className="absolute -top-3 start-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-[11px] font-semibold text-accent-foreground">
                  Most popular
                </span>
              )}
              <p className={cn("text-xs font-semibold uppercase tracking-wide", plan.featured ? "text-accent" : "text-accent-foreground")}>
                {plan.eyebrow}
              </p>
              <p className={cn("mt-2 font-display text-3xl font-bold", plan.featured ? "text-primary-foreground" : "text-fg")}>{plan.price}</p>
              <p className={cn("text-xs", plan.featured ? "text-primary-foreground/70" : "text-fg-faint")}>{plan.priceSuffix}</p>
              {plan.description && (
                <p className={cn("mt-2 text-xs", plan.featured ? "text-primary-foreground/80" : "text-fg-muted")}>{plan.description}</p>
              )}
              <ul className="mt-4 flex-1 space-y-1.5">
                {plan.features.map((feature) => (
                  <li key={feature} className={cn("flex items-start gap-1.5 text-xs", plan.featured ? "text-primary-foreground/85" : "text-fg-muted")}>
                    <Check className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", plan.featured ? "text-accent" : "text-primary")} aria-hidden />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href="/login"
                className={cn(
                  "mt-5 rounded-full px-4 py-2.5 text-center text-sm font-medium transition-colors",
                  plan.featured ? "bg-accent text-accent-foreground hover:bg-accent-hover" : "border border-border-strong text-fg hover:bg-surface-2",
                )}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-fg-faint">
          Prices shown in USD. Localized pricing available per market. All plans include multi-currency, multi-language, and the
          Nightly Close.
        </p>
      </div>
    </section>
  );
}

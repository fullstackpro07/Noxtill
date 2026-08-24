"use client";

import { useState } from "react";
import { Reveal } from "@/components/site/reveal";
import { PricingCard } from "@/components/site/pricing-card";
import { PricingBillingToggle } from "@/components/site/pricing-billing-toggle";
import { PricingCompareTable } from "@/components/site/pricing-compare-table";
import { PricingUsageTable } from "@/components/site/pricing-usage-table";
import { Check } from "lucide-react";
import { PRICING_PLANS, PRICING_TRUST_GRID, PRICING_USAGE_HELP_TILES } from "@/lib/marketing/pricing-content";

export function PricingPlansSection() {
  const [yearly, setYearly] = useState(true);
  const regularPlans = PRICING_PLANS.slice(0, 4);
  const enterprisePlan = PRICING_PLANS[4];

  return (
    <>
      <section className="mx-auto max-w-[1560px] px-5 pb-20 sm:px-10">
        <div className="mx-auto mb-8 max-w-[660px] text-center">
          <h2 className="mb-3.5 text-balance font-display text-[clamp(30px,3.8vw,52px)] font-bold leading-[1.06] tracking-[-0.04em] text-fg">
            Pricing Plans
          </h2>
          <p className="mx-auto mb-6.5 max-w-[52ch] text-[16.5px] leading-relaxed text-fg-muted">
            Choose the plan that fits your business. All plans include core features and can scale with you as you grow.
          </p>
          <PricingBillingToggle yearly={yearly} onChange={setYearly} />
        </div>

        <Reveal>
          <div className="mx-auto grid max-w-[1180px] grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {regularPlans.map((plan) => (
              <PricingCard key={plan.key} plan={plan} yearly={yearly} />
            ))}
          </div>
        </Reveal>

        {enterprisePlan && (
          <div className="mx-auto mt-4 max-w-[280px] sm:max-w-[300px]">
            <PricingCard plan={enterprisePlan} yearly={yearly} />
          </div>
        )}

        <div className="mx-auto mt-8.5 grid max-w-[1240px] grid-cols-1 gap-y-5.5 rounded-[20px] border border-[#e9edeb] bg-surface-2 py-6.5 sm:grid-cols-2 lg:grid-cols-4">
          {PRICING_TRUST_GRID.map((item, i) => (
            <div key={item.title} className={`flex items-start gap-3.5 px-5.5 ${i > 0 ? "sm:border-l sm:border-[#eceeed]" : ""}`}>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/8">
                <item.icon className="size-[19px] text-accent-hover" aria-hidden />
              </span>
              <div>
                <div className="mb-1 font-display text-sm font-semibold text-fg">{item.title}</div>
                <div className="text-[13px] leading-snug text-fg-faint">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1560px] px-5 pb-20 sm:px-10">
        <div className="mx-auto mb-7.5 max-w-[660px] text-center">
          <h2 className="mb-3 text-balance font-display text-[clamp(28px,3.4vw,44px)] font-bold leading-[1.1] tracking-[-0.035em] text-fg">
            Compare <span className="text-accent-hover">Noxtill</span> Plans
          </h2>
          <p className="text-base leading-relaxed text-fg-muted">See exactly what&rsquo;s included in each plan and choose the right level for your business.</p>
        </div>

        <Reveal>
          <PricingCompareTable plans={PRICING_PLANS} yearly={yearly} />
        </Reveal>

        <div className="mt-5 flex flex-wrap justify-center gap-x-6.5 gap-y-3 text-[13px] text-fg-muted">
          <span className="inline-flex items-center gap-2">
            <Check className="size-[15px] text-accent-hover" aria-hidden /> Included
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="text-[#a3aeaa]">—</span> Not included
          </span>
          <span className="inline-flex items-center gap-2">
            <strong className="text-fg">Custom</strong> Tailored to your needs
          </span>
        </div>
      </section>

      <section className="mx-auto max-w-[1560px] px-5 pb-20 sm:px-10">
        <div className="mx-auto mb-7.5 max-w-[680px] text-center">
          <h2 className="mb-3 text-balance font-display text-[clamp(28px,3.4vw,44px)] font-bold leading-[1.1] tracking-[-0.035em] text-fg">
            Know exactly what&rsquo;s included
          </h2>
          <p className="text-base leading-relaxed text-fg-muted">Clear usage limits so you can plan, scale and get the most out of Noxtill.</p>
        </div>

        <Reveal>
          <PricingUsageTable plans={PRICING_PLANS} yearly={yearly} />
        </Reveal>

        <div className="mt-4.5 grid grid-cols-1 gap-5 rounded-[18px] border border-[#e9edeb] p-5.5 sm:grid-cols-2 lg:grid-cols-4">
          {PRICING_USAGE_HELP_TILES.map((tile) => (
            <div key={tile.title} className="flex items-start gap-3">
              <span className="flex size-8.5 shrink-0 items-center justify-center rounded-[10px] bg-primary/8">
                <tile.icon className="size-[17px] text-accent-hover" aria-hidden />
              </span>
              <div>
                <div className="mb-1 font-display text-[13.5px] font-semibold text-fg">{tile.title}</div>
                <div className="text-[12.5px] leading-snug text-fg-faint">{tile.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-4.5 max-w-[900px] rounded-2xl bg-primary/8 px-4.5 py-3.5 text-center text-[13px] text-fg-muted">
          All limits are monthly unless stated otherwise. Add-ons are available for higher usage, and the Enterprise plan is tailored to your business needs.
        </p>
      </section>
    </>
  );
}

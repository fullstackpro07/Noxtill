import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PRICING_FINAL_CTA } from "@/lib/marketing/pricing-content";

export function PricingFinalCta() {
  return (
    <section className="mx-auto max-w-[1280px] px-5 pb-20 sm:px-10">
      <div className="rounded-3xl border border-[#cfeede] bg-primary/8 px-6 py-13 text-center sm:px-8">
        <h2 className="mx-auto mb-3.5 max-w-[24ch] text-balance font-display text-[clamp(28px,3.4vw,42px)] font-bold leading-[1.12] tracking-[-0.035em] text-fg">
          {PRICING_FINAL_CTA.headline}
        </h2>
        <p className="mx-auto mb-7 max-w-[58ch] text-[16.5px] leading-relaxed text-fg-muted">{PRICING_FINAL_CTA.body}</p>
        <div className="mb-5.5 flex flex-wrap justify-center gap-3">
          <Link
            href={PRICING_FINAL_CTA.primaryHref}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-7.5 py-4 text-[15.5px] font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            {PRICING_FINAL_CTA.primaryCta} <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Link
            href={PRICING_FINAL_CTA.secondaryHref}
            className="inline-flex items-center rounded-xl border border-[#b6ddc9] bg-white px-7 py-4 text-[15.5px] font-medium text-fg transition-colors hover:border-accent-hover hover:text-accent-hover"
          >
            {PRICING_FINAL_CTA.secondaryCta}
          </Link>
          <Link
            href={PRICING_FINAL_CTA.tertiaryHref}
            className="inline-flex items-center rounded-xl border border-[#b6ddc9] bg-white px-7 py-4 text-[15.5px] font-medium text-fg transition-colors hover:border-accent-hover hover:text-accent-hover"
          >
            {PRICING_FINAL_CTA.tertiaryCta}
          </Link>
        </div>
        <div className="flex flex-wrap justify-center gap-4.5 text-[13.5px] text-fg-muted">
          {PRICING_FINAL_CTA.trust.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

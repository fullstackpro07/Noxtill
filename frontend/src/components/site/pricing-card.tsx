import Link from "next/link";
import { ArrowRight, Calendar, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PricingPlan } from "@/lib/marketing/pricing-content";

export function PricingCard({ plan, yearly }: { plan: PricingPlan; yearly: boolean }) {
  const highlighted = plan.popular || plan.custom;
  const Icon = plan.icon;

  const priceMain = plan.custom ? "Custom" : `$${yearly ? plan.annual : plan.monthly}`;
  const priceUnit = plan.custom ? "" : "/month";
  const priceNote = plan.custom
    ? "Tailored to your needs"
    : yearly
      ? `$${(plan.annual ?? 0) * 12} billed annually · save 20%`
      : `$${plan.annual}/month billed annually`;

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-[20px] border p-6 transition-transform duration-200 hover:-translate-y-1 hover:shadow-[var(--shadow-lg)]",
        plan.popular ? "border-accent-hover bg-gradient-to-b from-[#eaf8f1] to-white" : "border-[#e4ece8] bg-gradient-to-b from-[#f2faf6] to-white",
      )}
    >
      {plan.popular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-3.5 py-1.5 font-display text-[10.5px] font-semibold uppercase tracking-[0.09em] text-primary-foreground">
          Most popular
        </span>
      )}

      <div className="flex min-h-[84px] items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-[13px] bg-primary/8">
          <Icon className="size-5 text-accent-hover" aria-hidden />
        </span>
        <div>
          <div className="mb-1 font-display text-[19px] font-semibold text-fg">{plan.name}</div>
          <div className="text-[12.5px] leading-snug text-fg-faint">{plan.audience}</div>
        </div>
      </div>

      <div className="mb-4.5 min-h-[92px] border-b border-[#f0f3f2] py-1.5 pb-4.5">
        <div className="flex items-baseline gap-1.5">
          <span className="font-display text-[38px] font-bold tracking-[-0.04em] text-fg">{priceMain}</span>
          {priceUnit && <span className="text-sm text-fg-faint">{priceUnit}</span>}
        </div>
        <div className="mt-2 text-[13px] text-accent-hover">
          {plan.custom ? <strong className="font-medium">{priceNote}</strong> : priceNote}
        </div>
      </div>

      <div className="mb-3.5 font-display text-[13.5px] font-semibold text-fg">{plan.summaryLabel}</div>
      <div className="mb-6 flex flex-col gap-2.5">
        {plan.summary.map((item) => (
          <div key={item} className="flex items-start gap-2.5 text-[13.5px] leading-snug text-fg-muted">
            <Check className="mt-0.5 size-[15px] shrink-0 text-accent-hover" aria-hidden />
            {item}
          </div>
        ))}
      </div>

      <div className="mt-auto flex flex-col gap-3">
        <Link
          href={plan.ctaHref}
          className={cn(
            "inline-flex h-[46px] items-center justify-center gap-2 rounded-xl text-[14.5px] font-medium transition-colors",
            highlighted
              ? "bg-primary text-primary-foreground hover:bg-primary-hover"
              : "border border-[#dbe6e1] bg-white text-fg hover:border-accent-hover hover:text-accent-hover",
          )}
        >
          {plan.ctaLabel} <ArrowRight className="size-4" aria-hidden />
        </Link>
        {plan.secondaryDemo && (
          <Link href="/demo" className="inline-flex items-center justify-center gap-2 text-[13.5px] font-medium text-fg hover:text-primary">
            <Calendar className="size-[15px]" aria-hidden />
            Book a Demo
          </Link>
        )}
      </div>
    </div>
  );
}

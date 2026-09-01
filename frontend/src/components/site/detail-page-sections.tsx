import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { ArrowRight, Check, Quote, X } from "lucide-react";
import { Reveal } from "@/components/site/reveal";

export interface DetailStat {
  value: string;
  label: string;
}

export interface DetailBenefit {
  icon: LucideIcon;
  label: string;
}

/** Big icon-led hero with a stat-tile strip — shared across /product, /solutions and /resources detail pages. */
export function DetailHero({
  icon: Icon,
  eyebrow,
  h1Lead,
  h1Highlight,
  subhead,
  stats,
}: {
  icon: LucideIcon;
  eyebrow: string;
  h1Lead: string;
  h1Highlight: string;
  subhead: string;
  stats: DetailStat[];
}) {
  return (
    <section className="px-5 pt-10 text-center sm:px-7 sm:pt-14">
      <div className="mx-auto max-w-[820px]">
        <Reveal delay={0}>
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[22px] bg-primary shadow-[0_16px_32px_-14px_rgba(7,120,76,0.55)]">
            <Icon className="h-7 w-7 text-white" aria-hidden strokeWidth={1.8} />
          </div>
        </Reveal>
        <Reveal delay={40}>
          <div className="mb-3.5 inline-flex items-center gap-2 rounded-full bg-[#e3fbf1] px-3.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#0b8f5c]">
            {eyebrow}
          </div>
        </Reveal>
        <Reveal delay={80}>
          <h1 className="text-balance font-display text-[40px] font-bold leading-[1.08] tracking-tight text-fg sm:text-[52px]">
            {h1Lead} <span className="text-accent">{h1Highlight}</span>
          </h1>
        </Reveal>
        <Reveal delay={130}>
          <p className="mx-auto mt-4 max-w-[54ch] text-[17px] leading-relaxed text-fg-muted">{subhead}</p>
        </Reveal>
        <Reveal delay={180}>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/book-a-demo"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-6.5 py-3.5 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              Book a Demo <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/pricing"
              className="rounded-xl border border-border-strong px-6.5 py-3.5 text-[15px] font-medium text-fg transition-colors hover:border-accent hover:text-primary"
            >
              See Pricing
            </Link>
          </div>
        </Reveal>
      </div>

      <Reveal delay={230} className="mx-auto mt-10 max-w-[720px]">
        <div className="grid grid-cols-3 divide-x divide-border rounded-2xl border border-border bg-white shadow-[0_24px_60px_-46px_rgba(13,21,18,0.5)]">
          {stats.map((stat) => (
            <div key={stat.label} className="px-3 py-5 sm:px-5">
              <div className="font-display text-[26px] font-bold tracking-tight text-primary sm:text-[30px]">{stat.value}</div>
              <div className="mt-1 text-[11.5px] leading-snug text-fg-muted sm:text-[12.5px]">{stat.label}</div>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

/** Without/With Noxtill comparison table plus a benefit-chip row. */
export function DetailComparison({
  heading,
  without,
  withList,
  pullQuote,
  benefits,
}: {
  heading: string;
  without: string[];
  withList: string[];
  pullQuote: string;
  benefits: DetailBenefit[];
}) {
  return (
    <section className="bg-surface-deep px-5 pt-14 sm:px-7 sm:pt-16">
      <div className="mx-auto max-w-[920px]">
        <h2 className="mb-7 text-center font-display text-2xl font-bold tracking-tight text-fg-on-deep sm:text-3xl">{heading}</h2>
        <Reveal className="grid grid-cols-1 overflow-hidden rounded-2xl border border-border-on-deep sm:grid-cols-2">
          <div className="bg-white p-6 sm:p-7">
            <div className="mb-4 inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-[#c4563f]">
              Without Noxtill
            </div>
            <ul className="flex flex-col gap-3">
              {without.map((line) => (
                <li key={line} className="flex items-start gap-2.5 text-[14px] leading-relaxed text-fg-muted">
                  <X className="mt-0.5 h-4 w-4 flex-none text-[#c4563f]" aria-hidden strokeWidth={2.2} />
                  {line}
                </li>
              ))}
            </ul>
          </div>
          <div className="border-t border-[#eef0ef] bg-white p-6 sm:border-l sm:border-t-0 sm:p-7">
            <div className="mb-4 inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-[#0b8f5c]">
              With Noxtill
            </div>
            <ul className="flex flex-col gap-3">
              {withList.map((line) => (
                <li key={line} className="flex items-start gap-2.5 text-[14px] leading-relaxed text-[#1e3138]">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-accent" aria-hidden strokeWidth={2.5} />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>

      <div className="mx-auto mt-14 max-w-[740px] text-center">
        <Quote className="mx-auto mb-4 h-7 w-7 text-accent-on-deep" aria-hidden />
        <p className="text-balance font-display text-[22px] font-semibold leading-snug tracking-tight text-fg-on-deep sm:text-[26px]">{pullQuote}</p>
      </div>

      <div className="mx-auto mt-9 grid max-w-[860px] grid-cols-2 gap-5 pb-1 sm:grid-cols-4">
        {benefits.map((benefit, i) => (
          <Reveal key={benefit.label} delay={i * 60} className="flex flex-col items-center gap-2.5 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[0_10px_24px_-16px_rgba(13,21,18,0.45)]">
              <benefit.icon className="h-[19px] w-[19px] text-accent" aria-hidden strokeWidth={1.9} />
            </span>
            <span className="text-[12.5px] font-medium leading-snug text-fg-on-deep">{benefit.label}</span>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/** Closing related-links strip, shared across all three detail-page sections. */
export function DetailRelated({ heading, links }: { heading: string; links: { label: string; href: string }[] }) {
  return (
    <section className="px-5 pt-14 sm:px-7 sm:pt-16">
      <div className="mx-auto max-w-[900px] text-center">
        <h2 className="mb-5 font-display text-xl font-semibold text-fg">{heading}</h2>
        <div className="flex flex-wrap justify-center gap-2.5">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-4 py-2 text-[13.5px] font-medium text-fg hover:border-primary hover:text-primary"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

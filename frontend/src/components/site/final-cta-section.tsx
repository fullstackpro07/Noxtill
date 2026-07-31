import Link from "next/link";
import { Moon, ArrowRight, Check } from "lucide-react";
import { FINAL_CTA } from "@/lib/landing-content";

export function FinalCtaSection() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-24 text-center sm:px-6">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Moon className="h-5 w-5" aria-hidden />
      </span>
      <h2 className="mt-6 text-balance font-display text-4xl font-bold leading-tight text-fg sm:text-5xl">
        {FINAL_CTA.headlineLine1}
        <br />
        <span className="text-primary">{FINAL_CTA.headlineLine2}</span>
      </h2>
      <p className="mx-auto mt-4 max-w-md text-fg-muted">{FINAL_CTA.body}</p>
      <Link
        href="/login"
        className="mt-8 inline-flex items-center gap-1.5 rounded-full bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-md)] transition-transform hover:scale-[1.02]"
      >
        {FINAL_CTA.cta}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-4 text-xs text-fg-faint">
        {FINAL_CTA.trust.map((item) => (
          <span key={item} className="flex items-center gap-1">
            <Check className="h-3.5 w-3.5 text-primary" aria-hidden />
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}

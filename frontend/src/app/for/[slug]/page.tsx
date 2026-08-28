import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check, Quote } from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { FaqAccordion } from "@/components/site/faq-accordion";
import { BUSINESS_TYPE_PAGES, findBusinessTypePage } from "@/lib/business-type-pages";

export function generateStaticParams() {
  return BUSINESS_TYPE_PAGES.map((p) => ({ slug: p.slug }));
}

export default async function BusinessTypePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = findBusinessTypePage(slug);

  if (!page) notFound();

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 pt-16 text-center sm:px-6 sm:pt-24">
          <span className="inline-flex rounded-full bg-primary/8 px-3 py-1 text-xs font-semibold text-primary">{page.categoryLabel}</span>
          <h1 className="mt-5 text-balance font-display text-4xl font-bold leading-tight text-fg sm:text-5xl">{page.headline}</h1>
          <p className="mt-4 text-lg text-fg-muted">{page.subheadline}</p>
          <Link
            href="/book-a-demo"
            className="mt-8 inline-flex items-center gap-1.5 rounded-full bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-md)]"
          >
            Book a Demo for your {page.name.toLowerCase()}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </section>

        <section className="border-y border-border bg-surface/60 py-14">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-fg-faint">What {page.name.toLowerCase()} deal with every day</p>
            <ul className="flex flex-col gap-3">
              {page.painPoints.map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-fg">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div className="bg-surface-tint">
        <section className="mx-auto max-w-2xl px-4 pb-14 sm:px-6">
          <Quote className="h-6 w-6 text-accent-foreground" aria-hidden />
          <p className="mt-3 font-display text-xl font-medium leading-snug text-fg">&ldquo;{page.testimonial.quote}&rdquo;</p>
          <p className="mt-3 text-sm text-fg-muted">
            {page.testimonial.author} — {page.testimonial.place}
          </p>
        </section>
        </div>

        <div className="bg-surface-tint-2">
        <section className="mx-auto max-w-2xl px-4 pb-14 sm:px-6">
          <h2 className="mb-6 text-center font-display text-2xl font-bold text-fg">Questions {page.name.toLowerCase()} ask</h2>
          <FaqAccordion items={page.faqs} />
        </section>
        </div>

        <section className="mx-auto max-w-3xl px-4 pb-20 text-center sm:px-6">
          <p className="text-sm text-fg-faint">
            Not quite your business?{" "}
            <Link href="/#examples" className="font-medium text-primary hover:underline">
              See every type Noxtill supports
            </Link>
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

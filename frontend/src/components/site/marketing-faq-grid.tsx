import { Reveal } from "@/components/site/reveal";
import { buildFaqJsonLd, type FaqItem } from "@/lib/marketing/faq-jsonld";

/**
 * Always-open two-column FAQ grid used on Home / Solutions / Integrations — distinct from
 * the single-open chevron accordion (`faq-accordion.tsx`) reused on Pricing.
 */
export function MarketingFaqGrid({
  title,
  description,
  items,
}: {
  title: string;
  description?: string;
  items: FaqItem[];
}) {
  const left = items.filter((_, i) => i % 2 === 0);
  const right = items.filter((_, i) => i % 2 === 1);
  const jsonLd = buildFaqJsonLd(items);

  return (
    <section className="px-5 py-16 sm:px-7 sm:py-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto max-w-[1560px]">
        <div className="mx-auto mb-8 max-w-[720px] text-center">
          <h2 className="mb-3.5 text-balance font-display text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{title}</h2>
          {description ? <p className="text-[15px] leading-relaxed text-fg-muted">{description}</p> : null}
        </div>
        <div className="flex flex-wrap gap-4">
          {[left, right].map((column, columnIndex) => (
            <div key={columnIndex} className="flex min-w-[300px] flex-1 basis-[440px] flex-col gap-4">
              {column.map((item, i) => (
                <Reveal key={item.question} delay={(i % 3) * 90} className="rounded-2xl border border-border p-5">
                  <h3 className="mb-2 font-display text-[16.5px] font-semibold text-fg">{item.question}</h3>
                  <p className="text-sm leading-relaxed text-fg-muted">{item.answer}</p>
                </Reveal>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

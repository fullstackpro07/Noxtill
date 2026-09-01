import { FaqAccordion } from "@/components/site/faq-accordion";
import { HOME_FAQ_ITEMS } from "@/lib/marketing/home-content";

export function FaqSection() {
  return (
    <div>
      <section className="mx-auto max-w-[760px] px-5 py-16 sm:px-7 sm:py-14">
        <div className="mx-auto mb-10 max-w-[620px] text-center">
          <h2 className="mb-3.5 text-balance font-display text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
            Frequently asked questions
          </h2>
          <p className="text-[15px] leading-relaxed text-fg-muted">
            What Noxtill is, how the nightly close works, and what happens to your data.
          </p>
        </div>
        <FaqAccordion items={HOME_FAQ_ITEMS} />
      </section>
    </div>
  );
}

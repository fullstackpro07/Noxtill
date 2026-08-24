export interface FaqItem {
  question: string;
  answer: string;
}

/** Builds a schema.org FAQPage JSON-LD object from whatever FAQ array a page ships — never hand-copy source JSON-LD. */
export function buildFaqJsonLd(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}
